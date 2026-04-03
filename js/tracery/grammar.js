/**
 * @author Kate Compton
 */

import universalModifiers from "./modifiers.js";
import Node from "./node.js";
import Symbol from "./symbol.js";
import Rule from "./rule/rule.js";
import { parseRule } from "./utilities.js";

class Grammar {
    constructor() {
        this.clear();
    }

    clear() {
        // Symbol library
        this.symbols = {};

        // Modifier library
        this.modifiers = {};

        // add the universal mods
        for (var mod in universalModifiers) {
            if (universalModifiers.hasOwnProperty(mod))
                this.modifiers[mod] = universalModifiers[mod];
        }
    }
    //========================================================
    // Loading

    loadFrom(obj) {
        var symbolSrc;

        this.clear();

        if (obj.symbols !== undefined) {
            symbolSrc = obj.symbols;
        } else {
            symbolSrc = obj;
        }

        // get all json keys
        var keys = Object.keys(symbolSrc);

        this.symbolNames = [];
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            this.symbolNames.push(key);

            this.symbols[key] = new Symbol(this, key);
            this.symbols[key].loadFrom(symbolSrc[key]);
        }

    }

    toText() {

        return this.toJSON();
    }

    toJSON() {
        var s = "{\n";
        // get all json keys
        var keys = Object.keys(this.symbols);

        this.symbolNames = [];
        var count = 0;
        for (var i = 0; i < keys.length; i++) {

            var key = keys[i];
            var symbol = this.symbols[key];

            if (symbol && symbol.baseRules) {
                if (count > 0)
                    s += ",";
                count++;

                s += "\t" + this.symbols[key].toJSON();

                s += "\n";
            }
        }

        s += "\n}";
        return s;
    }

    //========================================================
    // selection

    select() {
        this.isSelected = true;
    }

    deselect() {
        this.isSelected = false;
    }

    //========================================================
    // Iterating over symbols

    mapSymbols(fxn) {
        var symbols = this.symbols;
        return this.symbolNames.map(function (name) {
            return fxn(symbols[name], name);
        });
    }

    applyToSymbols(fxn) {
        for (var i = 0; i < this.symbolNames.length; i++) {
            var key = this.symbolNames[i];
            fxn(this.symbols[key], key);
        }
    }

    //========================================================
    addOrGetSymbol(key) {
        if (this.symbols[key] === undefined)
            this.symbols[key] = new Symbol(this, key);

        return this.symbols[key];
    }

    pushRules(key, rules) {
        var symbol = this.addOrGetSymbol(key);
        symbol.pushRules(rules);
    }

    popRules(key, rules) {
        var symbol = this.addOrGetSymbol(key);
        var popped = symbol.popRules();

        if (symbol.ruleSets.length === 0) {
            // remove symbol
            this.symbols[key] = undefined;
        }
    }

    applyMod(modName, text) {
        if (!this.modifiers[modName]) {
            throw ("Unknown mod: " + modName);
        }
        return this.modifiers[modName](text);
    }

    //============================================================
    getRule(key, seed) {
        var symbol = this.symbols[key];
        if (symbol === undefined) {
            var r = new Rule("{{" + key + "}}");

            r.error = "Missing symbol " + key;
            return r;
        }

        var rule = symbol.getRule();
        if (rule === undefined) {
            var r = new Rule("[" + key + "]");
            r.error = "Symbol " + key + " has no rule";
            return r;
        }

        return rule;
    }

    //============================================================
    // Expansions
    expand(raw) {

        // Start a new tree
        var root = new Node(this, raw);

        root.expand();

        return root;
    }

    flatten(raw) {

        // Start a new tree
        var root = new Node(this, raw);

        root.expand();

        return root.childText;
    }

    //===============

    analyze() {
        this.symbolNames = [];
        for (var name in this.symbols) {
            if (this.symbols.hasOwnProperty(name)) {
                this.symbolNames.push(name);
            }
        }

        // parse every rule

        for (var i = 0; i < this.symbolNames.length; i++) {
            var key = this.symbolNames[i];
            var symbol = this.symbols[key];
            // parse all
            for (var j = 0; j < symbol.baseRules.length; j++) {
                var rule = symbol.baseRules[j];
                rule.parsed = parseRule(rule.raw);
                //   console.log(rule);

            }
        }

    }

    selectSymbol(key) {
        var symbol = this.get(key);
    }
}

export default Grammar;
