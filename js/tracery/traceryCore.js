/**
 * @author Kate Compton

 */

import traceryUtilities from "./utilities.js";
import Grammar from "./grammar.js";

const tracery = {};

Object.assign(tracery, traceryUtilities);

tracery.createGrammar = function (obj) {
    const grammar = new Grammar();
    grammar.loadFrom(obj);
    return grammar;
};

tracery.addError = function (error) {
    console.warn(error);
};

tracery.test = function () {
    /*
    // good
    tracery.testParse("");
    tracery.testParse("fooo");
    tracery.testParse("####");
    tracery.testParse("#[]#[]##");
    tracery.testParse("#someSymbol# and #someOtherSymbol#");
    tracery.testParse("#someOtherSymbol.cap.pluralize#");
    tracery.testParse("#[#do some things#]symbol.mod[someotherthings[and a function]]#");
    tracery.testParse("#[fxn][fxn][fxn[subfxn]]symbol[[fxn]]#");
    tracery.testParse("#[fxn][#fxn#][fxn[#subfxn#]]symbol[[fxn]]#");
    tracery.testParse("#hero# ate some #color# #animal.s#");

    // bad
    tracery.testParse("#someSymbol# and #someOtherSymbol");
    tracery.testParse("#[fxn][fxn][fxn[subfxn]]symbol[fxn]]#");
    */

    /*
    // good
    tracery.testParseTag("[action]symbol.mod1.mod2[postAction]");
    // bad
    tracery.testParseTag("stuff[action]symbol.mod1.mod2[postAction]");
    tracery.testParseTag("[action]symbol.mod1.mod2[postAction]stuff");

    */
    //    tracery.testParse("#hero# ate some #color# #animal.s#");
    tracery.testParse("#[#setPronouns#][#setOccupation#][hero:#name#]story#");
};

export default tracery;
