/**
 * @author Kate Compton
 */

import { parseTag } from "./utilities.js";

class Action {
    constructor(node, raw) {

        this.node = node;
        this.grammar = node.grammar;
        this.raw = raw;
    }

    activate() {

        var node = this.node;
        node.actions.push(this);

        // replace any hashtags
        this.amended = this.grammar.flatten(this.raw);

        var parsed = parseTag(this.amended);
        var subActionRaw = parsed.preActions;
        if (subActionRaw && subActionRaw.length > 0) {
            this.subactions = subActionRaw.map(function (action) {
                return new Action(node, action);
            });

        }

        if (parsed.symbol) {
            var split = parsed.symbol.split(":");

            if (split.length === 2) {
                this.push = {
                    symbol: split[0],

                    // split into multiple rules
                    rules: split[1].split(","),
                };
                // push
                node.grammar.pushRules(this.push.symbol, this.push.rules);

            } else
                throw ("Unknown action: " + parsed.symbol);
        }

        if (this.subactions) {
            for (var i = 0; i < this.subactions.length; i++) {
                this.subactions[i].activate();
            }
        }

    }

    deactivate() {
        if (this.subactions) {
            for (var i = 0; i < this.subactions.length; i++) {
                this.subactions[i].deactivate();
            }
        }

        if (this.push) {
            this.node.grammar.popRules(this.push.symbol, this.push.rules);
        }
    }
}

export default Action;
