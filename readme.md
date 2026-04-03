# Welcome to Tracery!

## A text-expansion library

(Update: Nov 3 2024, everything is moved into Tracery.io because I let the old domains slip 🙃)

Here is the (new location) of the classic [editor](https://tracery.io/archival/brightspiral/tracery/)

And the newer [artbot.club version](https://artbot.club) that I keep working on 

There are many new examples of Tracery [in use](https://tracery.io/archival/crystalcodepalace/tracery.html "Examples")

I also have an exciting new *interactive* [tutorial](https://tracery.io/archival/crystalcodepalace/tracerytut.html "Tutorial")

Use the modern ES module source in [js/tracery](js/tracery).

### Write grammar objects, get generative stories

#### An example grammar
```
{
	"name": ["Arjun","Yuuma","Darcy","Mia","Chiaki","Izzi","Azra","Lina"],
	"animal": ["unicorn","raven","sparrow","scorpion","coyote","eagle","owl","lizard","zebra","duck","kitten"],
	"mood": ["vexed","indignant","impassioned","wistful","astute","courteous"],
	"story": ["#hero# traveled with her pet #heroPet#.  #hero# was never #mood#, for the #heroPet# was always too #mood#."],
	"origin": ["#[hero:#name#][heroPet:#animal#]story#"]
}
```

#### Output of that grammar.
Of course, many grammars are more complex!
```
Lina traveled with her pet duck. Lina was never indignant, for the duck was always too indignant.
Yuuma traveled with her pet unicorn. Yuuma was never wistful, for the unicorn was always too indignant.
Azra traveled with her pet coyote. Azra was never wistful, for the coyote was always too impassioned.
Yuuma traveled with her pet owl. Yuuma was never wistful, for the owl was always too courteous.
Azra traveled with her pet zebra. Azra was never impassioned, for the zebra was always too astute.
```

### How to use Tracery as a browser library

Import tracery
`<script type="module" src="js/tracery/main.js"></script>`

Use the `tracery` object to create a `Grammar` object from a source object (specification below)
`tracery.createGrammar(spellbook);`

Create a grammar and expand from the default `origin` rule:
`const grammar = tracery.createGrammar(spellbook);`
`const output = grammar.flatten("#origin#");`

You can also expand any ad-hoc rule string:
`const teaser = grammar.flatten("A story about #character#");`

Call `flatten` as many times as you like on the same grammar to generate new variations.

### How to use Tracery as a Node.js library

Use this Node library created by George Buckenham: https://github.com/v21/tracery

## Input

### Syntax overview
####  Grammar
A grammar is a key-value storage system for rules.

####  Rule syntax
Each symbol should be followed by an array of text strings representing rules
```
  "emotion" : ["happy", "sad", "proud"],
```
or, if you're writing a long string of single words, you can use 'split'
```
  "emotion" : "happy sad reflective morose proud".split(" "),
```

Rules can also contain expansion symbols, words surrounded by #'s:
```
mainCharacter: ["Brittany the Wombat"],
story : ["This is a story about #mainCharacter#"]
```

Expansion symbols can have modifiers.  Modifiers can change something about the string expansion of that symbol.
 `#animal.capitalize#` or `#animal.a#` or `#animal.s#`
```
name: ["Brittany"],
animal: ["wombat"],
story : ["This is a story about #name# the #animal.capitalize#"]
```
