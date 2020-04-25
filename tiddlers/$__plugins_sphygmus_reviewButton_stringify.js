/*\
title: $:/core/modules/utils/luci.js
type: application/javascript
module-type: utils

Various static utility functions.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// Stringify an array of tiddler titles into a list string
exports.stringifyReview = function(value) {
    if($tw.utils.isArray(value)) {
        var result = [];
        for(var t=0; t<value.length; t++) {
            var entry = value[t] || "";
            //if(entry.indexOf(" ") !== -1) {
            result.push("\n* [["+entry+"]]\n"+"**");
            //} else {
            //    result.push(entry); //this one
            //}
        }
        return result.join(" ");
    } else {
        return value || "";
    }
};

})();