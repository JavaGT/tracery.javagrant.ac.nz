/**
 * @author Kate
 */

import Rule from "./rule.js";

class RuleSet {
    constructor(rules) {
        // is the rules obj an array? A RuleSet, or a string?
        if (Array.isArray(rules)) {
            // make a copy
            rules = rules.slice(0, rules.length);
        } else if (rules instanceof RuleSet) {
            // clone
        } else if (typeof rules == 'string' || rules instanceof String) {
            var args = Array.prototype.slice.call(arguments);
            rules = args;
        } else {
            console.log(rules);
            throw ("creating ruleset with unknown object type!");
        }

        // create rules and their use counts

        this.rules = rules;
        this.parseAll();

        this.uses = [];
        this.startUses = [];
        this.totalUses = 0;
        for (var i = 0; i < this.rules.length; i++) {
            this.uses[i] = 0;
            this.startUses[i] = this.uses[i];
            this.totalUses += this.uses[i];
        }
    }

    //========================================================
    // Iterating over rules

    parseAll() {
        for (var i = 0; i < this.rules.length; i++) {
            if (!(this.rules[i] instanceof Rule))
                this.rules[i] = new Rule(this.rules[i]);
        }
    }

    //========================================================
    // Iterating over rules

    mapRules(fxn) {
        return this.rules.map(function (rule, index) {
            return fxn(rule, index);
        });
    }

    applyToRules(fxn) {
        for (var i = 0; i < this.rules.length; i++) {
            fxn(this.rules[i], i);
        }
    }

    addRule(rule) {
        if (!(rule instanceof Rule))
            rule = new Rule(rule);

        this.rules.push(rule);
        this.uses.push(0);
        this.startUses.push(0);
    }
    //========================================================
    get() {
        var index = this.getIndex();

        return this.rules[index];
    }

    getRandomIndex() {
        return Math.floor(this.uses.length * Math.random());
    }

    getIndex() {
        // Weighted distribution
        // Imagine a bar of length 1, how to divide the length
        // s.t. a random dist will result in the dist we want?

        var index = this.getRandomIndex();
        // What if the uses determine the chance of rerolling?

        var median = this.totalUses / this.uses.length;

        var count = 0;
        while (this.uses[index] > median && count < 20) {
            index = this.getRandomIndex();
            count++;
        }

        // reroll more likely if index is too much higher

        return index;
    }

    decayUses(pct) {
        this.totalUses = 0;
        for (var i = 0; i < this.uses.length; i++) {
            this.uses[i] *= 1 - pct;
            this.totalUses += this.uses[i];
        }
    }

    testRandom() {
        console.log("Test random");
        var counts = [];
        for (var i = 0; i < this.uses.length; i++) {
            counts[i] = 0;
        }

        var testCount = 10 * this.uses.length;
        for (var i = 0; i < testCount; i++) {

            var index = this.getIndex();
            this.uses[index] += 1;

            counts[index]++;
            this.decayUses(.1);
        }

        for (var i = 0; i < this.uses.length; i++) {
            console.log(i + ":\t" + counts[i] + " \t" + this.uses[i]);
        }
    }

    getSaveRules() {
        var jsonRules = this.rules.map(function (rule) {
            return rule.toJSONString();
        });

        return jsonRules;
    }
}

export default RuleSet;
