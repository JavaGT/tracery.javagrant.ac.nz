/**
 * @author Kate Compton
 */

'use strict';

var vowelRE = /^[aeiou]$/i;
var punctuationRE = /[,.?!]$/;

var isConsonant = function (c) {
    return !vowelRE.test(c);
};

var modifiers = {
    capitalizeAll: function (s) {
        return s.replace(/(?:^|\s)\S/g, function (a) {
            return a.toUpperCase();
        });

    },

    capitalize: function (s) {
        return s.charAt(0).toUpperCase() + s.slice(1);

    },

    inQuotes: function (s) {
        return '"' + s + '"';
    },

    comma: function (s) {
        if (punctuationRE.test(s))
            return s;
        return s + ",";
    },

    beeSpeak: function (s) {
        //            s = s.replace("s", "zzz");

        s = s.replace(/s/, 'zzz');
        return s;
    },

    a: function (s) {
        if (!isConsonant(s.charAt()))
            return "an " + s;
        return "a " + s;

    },

    s: function (s) {

        var last = s.charAt(s.length - 1);

        switch (last) {
            case 'y':

                // rays, convoys
                if (!isConsonant(s.charAt(s.length - 2))) {
                    return s + "s";
                }
                // harpies, cries
                else {
                    return s.slice(0, s.length - 1) + "ies";
                }
                break;

            // oxen, boxen, foxen
            case 'x':
                return s.slice(0, s.length - 1) + "en";
            case 'z':
                return s.slice(0, s.length - 1) + "es";
            case 'h':
                return s.slice(0, s.length - 1) + "es";

            default:
                return s + "s";
        };

    },

    ed: function (s) {

        var index = s.indexOf(" ");
        var rest = "";
        if (index > 0) {
            rest = s.substring(index, s.length);
            s = s.substring(0, index);

        }

        var last = s.charAt(s.length - 1);

        switch (last) {
            case 'y':

                // rays, convoys
                if (isConsonant(s.charAt(s.length - 2))) {
                    return s.slice(0, s.length - 1) + "ied" + rest;

                }
                // harpies, cries
                else {
                    return s + "ed" + rest;
                }
                break;
            case 'e':
                return s + "d" + rest;

                break;

            default:
                return s + "ed" + rest;
        };
    }
};

export default modifiers;
