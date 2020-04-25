# The Masking Layer

Layer 0 of the Atropos Rhizome is the outmost layer, and logically the only one
that's ever sent in the clear. Its responsibilities are simple:

 - **overall encryption:** make sure an outside party cannot read the content
 - **protocol masking:** layer 0 should be indistinguishable from random
 - **robust communication:** guarantee that an outside party cannot inject
 anything, even uncontrolled random data or replayed packets into the protocol

Layer 0 establishes a single, unordered, nonblocking, robust channel between two
nodes. It guarantees the protection of data from outside parties, the
authentication of data, and that the data arrives exactly 0 or 1 times. It has a
variable packet size, and while it works best over UDP, as long as it receives
the individual packets it works over any channel, such as TCP or WebRTC.

Layer 0 has a fixed, 43 byte overhead.

# Packet Format

A regular Layer 0 packet has the following format:

    [ nonce 24 ][ secretbox n+19 ([ tag 3 ][ content n ]) ]

 - _nonce_ is 24 bytes of random data, used for encrypting the secretbox. It
 must be cryptographically secure random, such as the output of a CSPRNG.
 - _secretbox_ is a NaCl/libsodium secretbox using the default primitive
 (xsalsa20poly1305). Its contents are the following:
   - _tag:_ a 3-byte deduplication tag
   - _content:_ the contents of the package

_tag_ uses the following layout (with lengths in bits):

    [ lowbits 16 ][ flags 4 ][ highbits 4 ]

 - _lowbits_ is a 16-bit unsigned integer in little-endian encoding
 - _flags_ is the flagfield of layer 0, containing four flags
 - _highbits_ is an extra four bits for the deduplication tag

The four flags in _flags_ are:

 - CTRL, switches the packet into Control Mode ([see below][control-mode])
 - FSEC, used for the dedicated forward secrecy mode
 - RSVD, reserved
 - RSVD, reserved

[control-mode]: #Control-Mode---Extensible-Protocol

## Handshake Format

Handshake packets have a different layout in Layer 0:

    [ nonce 24 ][ pubkey 32 ][ secretbox n+16 ([ content n ]) ]

 - _nonce_ is 24 bytes of random data with the same requirements
 - _pubkey_ is an Elligator2-encoded ed25519 point used for a Diffie-Hellman
 - _secretbox_ is a NaCl/libsodium secretbox containing:
   - _content:_ an optional Control Mode packet

If the handshake has content, it is parsed as if the CTRL flag was enabled.

# Parsing and State Management

Layer 0 is stateful. Its state consists of at most two secret keys, a private
key used for Diffie-Hellman, the state of the key exchange, and two bitfields,
each linked to a secret key. One of the secret keys is marked as primary.

When a packet is received

 1. The receiver tries to decrypt it first with the primary, then with the
 secondary key. If both attempts fail, the packet is discarded.
 2. The receiver checks the deduplication tag. If it is invalid, the packet is
 discarded.
 3. The receiver checks the flags. If no flag is set, the packet is passed to
 the next layer. If it is set, the behavior defined by the flag is executed.

## Handshake Parsing

Given that Layer 0 handshakes are desigend to be indistinguishable from random
without a secret key, Layer 0 does not attempt that. If there is no channel open
with the remote node, any incoming packet is parsed as a potential handshake.

 1. The receiver checks if the packet meets the miniumum length (72 bytes)
 2. The receiver decodes the remote public key with Elligator2 and computes the
 shared key using its own long-term private key
 3. The receiver attempts to decrypt the contents of the package. If it fails,
 the packet is discarded. If it is successful, the contents are handled as if
 it was a normal package with the CTRL flag set.

Upon a successful handshake, the shared key used for decrypting it is set as the
primary key. A private key is generated, and the key exchange is set to 'ready'.

When sending the handshake, the channel is immediately regarded as open. The
initiating party can immediately derive the shared key using the remote's
long-term public key and set it as the primary key. The key exchange begins in
the 'ready' state.

## Continuous Key Exchange - Forward Secrecy

Layer 0 continuously runs a loop of key exchange, swapping keys in roughly 3
pings. This key exchange is asynchronous, does not block communication on the
channel, it greatly improves forward secrecy, and allows for a deduplication
strategy using a fixed size bitfield and a small, nonce-independent tag.

The key exchange has three states, _ready_, _confirming_, and _switching_, which
rotate in this order. Each state has its specific task:

  - In the _ready_ state, the node generates a keypair for the next key exchange
  and sends the public key to the remote.
  
  - When the remote public key is received, the node switches to the _confirming_
  state. The new shared key is computed and stored as the secondary key. The node
  sends an authentication code with the new shared key to the remote. The
  authentication code is computed as follows: 

        HMAC-SHA256( key = new shared key, data = packet nonce )

  - When the authentication code is received, it is confirmed that the remote
  node has the new key. The keys are switched, with the new key becoming primary
  and the old one falling back to secondary. The state is set to _switching_ and
  another authentication code sent in the same format.

  - When the second authentication code is received, it confirms that the remote
  node switched to the new key. The secondary key is deleted and the state
  switches back to _ready_, restarting the cycle.

Key exchange messages use the FSEC flag, whenever that flag is set, the packet
content is parsed as a key exchange message in the following layout:

    [ type 1 ][ data 32 ]

Type is an 8-bit integer enum, with the following options:

 - `0x00`: PUBKEY, data is a public key, sender is in _ready_
 - `0x01`: CONFIRM, data is an auth tag, sender is in _confirming_
 - `0x02`: SWITCHED, data is an auth tag, sender is in _switching_

All other values must be ignored. Data is a 32 byte field containing the remote
public key or auth tag, which is paired with a state of key exchange and used to
move it forward. Contents after the first 33 bytes must be ignored.

Key exchange states should have a sensible timeout. If the state is not moved
forward before the timeout expires, the node breaks the connection.

Key exchange packets should be retransmitted periodically with different nonces
but the same deduplication tag, this ensures roboustness even on an unreliable
connection. Due to using the same tag, the receiving side will filter out
duplicates.

## Packet Deduplication - Replay Attack Mitigation

Layer 0 packets have a deduplication tag. This tag should be unique for every
package sent over the channel with the same key (but it can be reused after the
key is changed). The receiving side will accept each tag-key combination only
once.

In the channel state, each shared key has a bitfield mapped to it, which is
zeroed in the beginning. Each tag maps to a bit in this bitfield with its
numeric representation, which is either _lowbits_ itself or

    lowbits + highbits << 16

depending on the size of the bitfield. By default, the bitfield is 8 kB in size,
allowing for 16-bit tags and simply using _lowbits_ as the numeric form.

When a packet with a certain tag is received, the bit is checked. If it's 0, the
packet is allowed through and the bit is set to 1. If it's 1, the packet is
rejected as a duplicate.

On the default settings, this requires 8 kB of memory per key, 16 kB per channel
since each channel can have two active keys. This allows 65,536 packets per key
exchange. With the mutual agreement of the two nodes, this can be increased to
a 20-bit tag, allowing 1,048,576 packets per key exchange, requiring 128 kB per
key, 256 kB per channel.

It is generally advised to reserve a separate range (e.g. the first 256 slots)
for control messages such as key exchange and Control Mode.

## Control Mode - Extensible Protocol

When the CTRL flag is set, the packet is parsed as a control message in the
following layout:

    [ len 2 ][ data len ]

_len_ simply denotes the length of _data_ field. Anything in the packet after 
_data_ must be ignored.

_data_ is a MsgPack-encoded map with string keys. Any string can be a key,
however, keys not in the Atropos standard must use the 'x-' or 'X-' prefix.
Values can be any valid MsgPack data. By convention, the receiving node must
ignore any keys it does not recognize.

The purpose of control mode is to allow extensions to the protocol without
modifying the spec. For example, one such extension may be a mechanism for two
nodes to agree upon the deduplication field size.