/*\
title: $:/core/modules/widgets/keyboard-snippets.js
type: application/javascript
module-type: widget

Edit-text widget

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var EditTextWidget = require("$:/core/modules/widgets/edit-text.js")["edit-text"];

/*
The edit-text widget calls this method just after inserting its dom nodes
*/
EditTextWidget.prototype.postRender = function() {
	var self = this;
	var domNode = self.domNodes[0];
	this.KEYMAP = this.wiki.getTiddlerData("$:/plugins/danielo/keyboardSnippets/KEYMAP");
	this.KEYBINDINGS = this.parseKeyBindings(this.wiki.getTiddlerData("$:/plugins/danielo/keyboardSnippets/KEYBINDINGS"));
	$tw.utils.addEventListeners(domNode,[
		{name: "keydown", handlerObject: this, handlerMethod: "insertAtCursor"}
	]);


};


EditTextWidget.prototype.createKeySnippet = function(preTag,postTag){
 if(typeof arguments[0] == "object")
 {
	 var result = arguments[0];
	 if(result.hasOwnProperty("length")) return {regExp:result, length:result[0]["replace"].length};
	 if(result.pre && result.post) result.length=result.pre.length;
	 return result;
 }
	
	return {pre:preTag, post:postTag, length:preTag.length };
};


EditTextWidget.prototype.getKeyName = function (keyCode){
  return this.KEYMAP[keyCode];
};


EditTextWidget.prototype.parseKeyBindings = function (keyCombinations){
var keybindings={}; 
if (keyCombinations) {
	for(var comb in keyCombinations){
		keybindings[comb.toLowerCase()]=this.createKeySnippet(keyCombinations[comb]);
	}
	return keybindings;
}

 keybindings={

		 "ctrl+b" : this.createKeySnippet("''","''"), //b -- bold
		 "ctrl+i" : this.createKeySnippet("//","//"), //i --italics
		 "ctrl+o" : this.createKeySnippet("\n#"," "), //o -- Ordered list
		 "ctrl+u" : this.createKeySnippet("__","__"), //u -- understrike list
		 "ctrl+k" : this.createKeySnippet("\n```\n","```"), //k -- code
		 "ctrl+s" : this.createKeySnippet(",,",",,"), //s -- subscript
		 "ctrl+l" : this.createKeySnippet("\n*"," "), //l -- list
		 "ctrl+right_arrow" : {moveto:"|"}
		};
	return keybindings;
		

};

EditTextWidget.prototype.composeKeyCombo = function (event){
var keyCombo="";
            if(event.ctrlKey)keyCombo+="ctrl+";
            if(event.shiftKey)keyCombo+="shift+";
			if(event.altKey)keyCombo+="alt+";
			keyCombo+=this.getKeyName(event.keyCode);

return keyCombo;

};



EditTextWidget.prototype.insertAtCursor = function (event) {
    var snippet , myField=this.domNodes[0];

 if(snippet=this.KEYBINDINGS[this.composeKeyCombo(event)] )
  //para evitar sobreescribir otros eventos solo reaccionamos ante combinaciones que
  //estén en nuestro map de KEYBINDINGS
 {
	var reacted=false;
        //Internet explorer
            if (document.selection) {
                myField.focus();
                var sel = document.selection.createRange();
                sel.text = snippet;
            }
            //MOZILLA and others
            else if (myField.selectionStart || myField.selectionStart == '0') {
                var selection = this.getSelection(myField);
                if( snippet.hasOwnProperty("moveto")  ){
					var move = selection.followingText.indexOf(snippet.moveto);
					if(move >=0){ 
						reacted=true; //only stop default if we have to move
						this.moveSelection(myField,selection,move+1);
						}
				}else{
					reacted=true;
					myField.value = selection.previousText
						+ this.applyTag(snippet,selection.text)
						+ selection.followingText;
					this.moveSelection(myField,selection,snippet.length);
				}
            } else {
                myField.value += snippet;
            }
	if (reacted){ event.preventDefault(); event.stopPropagation();}
	
    this.saveChanges(this.domNodes[0].value);
    }
	
};

/*selection { object } domNode {dom object} 
length{number} number of characters to move the selection */
EditTextWidget.prototype.moveSelection = function(domNode,selection,length){
domNode.selectionStart = selection.start + length;
domNode.selectionEnd = selection.start + length + selection.text.length;
};

EditTextWidget.prototype.getSelection = function(domNode){
var selStarts=domNode.selectionStart; var selEnds=domNode.selectionEnd;
return {
		start:selStarts,
		end:selEnds,
		text:domNode.value.substring(selStarts,selEnds),
		previousText:domNode.value.substring(0, selStarts),
		followingText:domNode.value.substring(selEnds, domNode.value.length)
		};
};

EditTextWidget.prototype.applyTag = function(tag,text){
	if(tag.hasOwnProperty("multiline")){
		var elements = text.split("\n");
		for(var i in elements) 
			if(elements[i].length > 1 || elements.length < 2)
				elements[i]=tag.pre+elements[i]+tag.post;
			
		text=elements.join("\n");
	}else if (tag.hasOwnProperty("regExp")){
		var regExps = tag.regExp;
		for(var i in regExps){
			var regExp = new RegExp(regExps[i].exp,regExps[i].modificators);
			text = text.replace(regExp,regExps[i].replace);
		}
	}	
	else{
		text=tag.pre+text+tag.post;
	}
	
	return text;
	
};

})();