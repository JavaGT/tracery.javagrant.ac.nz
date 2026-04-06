/**
 * @author Kate Compton
 */

import RuleSet from "./rule/ruleset.js";

class Symbol {
    constructor(grammar, key) {
        this.grammar = grammar;
        this.key = key;
        this.currentRules = undefined;
        this.ruleSets = [];
    }

    loadFrom(rules) {

        rules = this.wrapRules(rules);
        this.baseRules = rules;

        this.ruleSets.push(rules);
        this.currentRules = this.ruleSets[this.ruleSets.length - 1];

    }

    //========================================================
    // Iterating over rules

    mapRules(fxn) {

        return this.currentRules.mapRules(fxn);
    }

    applyToRules(fxn) {
        this.currentRules.applyToRules(fxn);
    }

    //==================================================
    // Rule pushpops
    wrapRules(rules) {
        if (!(rules instanceof RuleSet)) {
            if (Array.isArray(rules)) {
                return new RuleSet(rules);
            } else if (typeof rules == 'string' || rules instanceof String) {
                return new RuleSet(rules);
            } else {
                throw ("Unknown rules type: " + rules);
            }
        }
        // already a ruleset
        return rules;
    }

    pushRules(rules) {
        rules = this.wrapRules(rules);
        this.ruleSets.push(rules);
        this.currentRules = this.ruleSets[this.ruleSets.length - 1];
    }

    popRules() {
        var exRules = this.ruleSets.pop();

        if (this.ruleSets.length === 0) {
            //console.warn("No more rules for " + this + "!");
        }
        this.currentRules = this.ruleSets[this.ruleSets.length - 1];
    }

    // Clear everything and set the rules
    setRules(rules) {

        rules = this.wrapRules(rules);
        this.ruleSets = [rules];
        this.currentRules = rules;

    }

    addRule(rule) {
        this.currentRules.addRule(rule);
    }

    //========================================================
    // selection

    select() {
        this.isSelected = true;

    }

    deselect() {
        this.isSelected = false;
    }

    //==================================================
    // Getters

    getRule(seed) {
        return this.currentRules.get(seed);
    }

    //==================================================

    toString() {
        return this.key + ": " + this.currentRules + "(overlaying " + (this.ruleSets.length - 1) + ")";
    }

    toJSON() {

        var rules = this.baseRules.rules.map(function (rule) {
            return '"' + rule.raw + '"';
        });
        return '"' + this.key + '"' + ": [" + rules + "]";
    }
}

export default Symbol;
