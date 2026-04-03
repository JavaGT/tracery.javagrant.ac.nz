/**
 * @author Kate
 */

import { parseRule } from "../utilities.js";

class Rule {
    constructor(raw) {
        this.raw = raw;
        this.sections = parseRule(raw);
    }

    getParsed() {
        if (!this.sections)
            this.sections = parseRule(this.raw);

        return this.sections;
    }

    toString() {
        return this.raw;
    }

    toJSONString() {
        return this.raw;
    }
}

export default Rule;
