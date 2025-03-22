var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export const NUMBER_OF_CARDS = 90;
function cardIndex(value) {
    if (value < 0 || value > NUMBER_OF_CARDS) {
        throw new TypeError("Invalid card index " + value);
    }
    return value;
}
let promiseCards = (function init() {
    return __awaiter(this, void 0, void 0, function* () {
        let response = yield fetch("resources/cards.json");
        let json = yield response.json();
        let cards = [];
        for (let suitKey of Object.keys(json)) {
            let suitCards = json[suitKey];
            let suit = suits[suitKey];
            for (let cardKey of Object.keys(suitCards)) {
                let card = suitCards[cardKey];
                cards.push(new Card(card.up.name, suit, card.up.legend, card.down.legend, card.up.index, card.up.value, card.up.index));
            }
        }
        return cards;
    });
})();
/**
 * The state of the deck.
 */
class Deck {
    /**
     * Prepare for JSON serialization.
     */
    toJSON() {
        return {
            nextCards: this.nextCards,
            nextUpside: this.nextUpside,
            lockedAct: [...this.lockedAct],
            lockedSession: [...this.lockedSession],
            lockedScene: [...this.lockedScene],
        };
    }
    /**
     * Parse from JSON.
     */
    constructor(serialized) {
        this.listeners = {
            shuffle: [],
            locked: [],
        };
        if (serialized) {
            console.debug("Deck", "Attempting to deserialize");
            try {
                let obj = JSON.parse(serialized);
                for (let source of [obj.nextCards, obj.lockedAct, obj.lockedScene, obj.lockedSession]) {
                    for (let card of source) {
                        if (typeof card != "number") {
                            throw new TypeError("Invalid card value " + card);
                        }
                    }
                }
                // Now construct. We may still detect indices out of range.
                let nextUpside = !!obj.nextUpside;
                let nextCards = obj.nextCards.map(index => cardIndex(index));
                let lockedAct = new Set(obj.lockedAct.map(index => cardIndex(index)));
                let lockedScene = new Set(obj.lockedScene.map(index => cardIndex(index)));
                let lockedSession = new Set(obj.lockedSession.map(index => cardIndex(index)));
                this.nextCards = nextCards;
                this.nextUpside = nextUpside;
                this.lockedAct = lockedAct;
                this.lockedScene = lockedScene;
                this.lockedSession = lockedSession;
                // Check invariants.
                this.check();
                // Construction complete.
                console.debug("Deck", "Deserialization successful");
                return;
            }
            catch (error) {
                console.debug("Deck", "Invalid serialized state, reshuffling from fresh", error);
            }
        }
        // Start with an empty deck, reshuffling will happen next time we call next().
        console.debug("Deck", "Initializing deck from scratch");
        this.nextCards = [];
        this.nextUpside = true;
        this.lockedAct = new Set();
        this.lockedScene = new Set();
        this.lockedSession = new Set();
    }
    /**
     * Reshuffle the deck, minus all the locked cards.
     */
    shuffle() {
        for (let listener of this.listeners.shuffle) {
            listener({ event: "start" });
        }
        // Create the list of cards that are not locked.
        let cards = [];
        for (let i = 0; i < NUMBER_OF_CARDS; ++i) {
            let index = cardIndex(i);
            if (this.lockedAct.has(index)) {
                continue;
            }
            if (this.lockedScene.has(index)) {
                continue;
            }
            if (this.lockedSession.has(index)) {
                continue;
            }
            cards.push(index);
        }
        console.debug("shuffle", "shuffling", cards);
        if (cards.length == 0) {
            throw new TypeError("Cannot reshuffle, there are no cards left!");
        }
        // Constant time shuffle.
        for (let i = 0; i < cards.length; ++i) {
            let swapIndex = i + Math.floor(Math.random() * (cards.length - i));
            console.debug("Swapping", i, swapIndex);
            let swap = cards[i];
            cards[i] = cards[swapIndex];
            cards[swapIndex] = swap;
        }
        console.debug("shuffle", "shuffled", cards);
        this.nextCards = cards;
        this.nextUpside = Math.random() >= 0.5;
        try {
            this.check(); // Just in case.
        }
        catch (e) {
            for (let listener of this.listeners.shuffle) {
                listener(new ShuffleFailedEvent(e));
            }
            throw e;
        }
        for (let listener of this.listeners.shuffle) {
            listener({ event: "done" });
        }
        this.save();
    }
    check(expectEverythingPressent = false) {
        let cards = new Set();
        for (let source of [this.nextCards, this.lockedAct, this.lockedScene, this.lockedSession]) {
            for (let card of source) {
                if (cards.has(card)) {
                    throw new TypeError("Duplicate card " + card);
                }
                cards.add(card);
            }
        }
        if (expectEverythingPressent && cards.size < NUMBER_OF_CARDS) {
            throw new TypeError("Missing cards");
        }
    }
    save() {
        window.localStorage.setItem("deck", JSON.stringify(this));
    }
    /**
     * The current card.
     */
    top() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.nextCards.length == 0) {
                this.shuffle();
            }
            let card = (yield promiseCards)[this.nextCards[this.nextCards.length - 1]];
            return new Drawn(card, this.nextUpside);
        });
    }
    /**
     * Draw the next card.
     */
    next() {
        return __awaiter(this, void 0, void 0, function* () {
            // Pop the top card.
            this.nextCards.length -= 1;
            console.debug("We still have", this.nextCards.length, "cards");
            // If more than half of the remaining cards have been drawn, shuffle.
            if (this.nextCards.length <
                (NUMBER_OF_CARDS - (this.lockedAct.size + this.lockedScene.size + this.lockedSession.size)) / 2) {
                this.shuffle();
            }
            // Randomize orientation of next card.
            this.nextUpside = Math.random() >= 0.5;
            this.save();
            return this.top();
        });
    }
    _auxLock(to, name) {
        return __awaiter(this, void 0, void 0, function* () {
            for (let i = 0; i < NUMBER_OF_CARDS; ++i) {
                // We limit redraws in case the only remaining cards are black.
                let drawn = yield this.next();
                if (drawn.card.suit == black) {
                    console.debug("Deck", "locking for", name, "skipping black card", drawn);
                    continue;
                }
                // We have found a card, we should be good.
                to.add(drawn.card.index);
                this.next();
                for (let listener of this.listeners.locked) {
                    listener({ event: "updated", name });
                }
                return;
            }
            for (let listener of this.listeners.locked) {
                listener({ event: "failed", name });
            }
        });
    }
    /**
     * Lock the next card for one scene.
     */
    lockScene() {
        this._auxLock(this.lockedScene, "scene");
    }
    /**
     * Lock the next card for one session.
     */
    lockSession() {
        this._auxLock(this.lockedSession, "session");
    }
    /**
     * Lock the next card for one act.
     */
    lockAct() {
        this._auxLock(this.lockedAct, "act");
    }
    /**
     * Start a new scene.
     */
    refreshScene() {
        this._auxRefresh([this.lockedScene], "scene");
    }
    /**
     * Start a new session.
     */
    refreshSession() {
        this._auxRefresh([this.lockedScene, this.lockedSession], "session");
    }
    /**
     * Start a new act.
     */
    refreshAct() {
        this._auxRefresh([this.lockedScene, this.lockedSession, this.lockedAct], "act");
    }
    /**
     * Implementation of all the `refresh*` methods.
     *
     * @param refresh The list of indices to refresh.
     * @param name The name of the event.
     */
    _auxRefresh(refresh, name) {
        for (let set of refresh) {
            set.clear();
        }
        this.save();
        for (let listener of this.listeners.locked) {
            listener({ event: "updated", name });
        }
    }
    addEventListener(listener) {
        switch (listener.event) {
            case "shuffle":
                this.listeners.shuffle.push(listener.callback);
                break;
            case "locked":
                this.listeners.locked.push(listener.callback);
                break;
        }
    }
}
export class ShuffleFailedEvent {
    constructor(error) {
        this.error = error;
    }
}
export const red = {
    name: "Red: The Dreamers",
    interpretation: "Those who want to change the world or escape it. Journalists, addicts, authors, scientists, philosophers, rebels, priests, ... Also, perhaps, a tendency to live in a world that isn't quite the same as everybody else.",
    upSymbol: "The Broken Icon",
    upSymbolInterpretation: "Broken dreams, shattered promises.",
    reversedSymbol: "The Smoke",
    reversedSymbolInterpretation: "Illusions, dreams, imagination."
};
export const purple = {
    name: "Purple: The Underbelly",
    interpretation: "Those  who survive in the gutter, or have risen from the gutter, usually to prey upon people. Gangsters, brothel and cabaret owners, but also corrupt police officers, homeless people, ethnic minorities, drug dealers, informants, forgers, the shadow office, ... Also, perhaps, a will to survive, and to have something to call their own, even if it currently belongs to someone else.",
    upSymbol: "The Gangster",
    upSymbolInterpretation: "Upsetting the rules, breaking the limits, violence.",
    reversedSymbol: "The Spirit Bottle",
    reversedSymbolInterpretation: "Excess, vice, self-harm."
};
export const pink = {
    name: "Pink: The Adventurers",
    interpretation: "Those who have escaped the boundaries of society, or who pretend that they have, or those who help them along the way. Athletes, pilots, race drivers, but also spies, burglars. Also, perhaps, contempt for those who live normal lives.",
    upSymbol: "The Eye/Tree",
    upSymbolInterpretation: "Growth, learning, discovery.",
    reversedSymbol: "The Sleeper",
    reversedSymbolInterpretation: "Rest, death, the future yet to be born."
};
export const blue = {
    name: "Blue: The People",
    interpretation: "Most of the population, both lower and middle classes, looking up to the power. Workers, soldiers and police officers, but also lynching and book-burning mobs, school students and their teachers, civil servants, believers and farmers. Also, perhaps, jealousy towards elites, real or imaginary.",
    upSymbol: "The Imperial Owl",
    upSymbolInterpretation: "Authority, conformity, order, safety.",
    reversedSymbol: "The Broken Man.",
    reversedSymbolInterpretation: "Exploitation, discontent, accidents, disregard."
};
export const gold = {
    name: "Gold: The Elites",
    interpretation: "Those who are envied, with or without justification, usually for their wealth, their lineage or their knowledge. Scholars and investors, aristocrats and tradespeople. Also, perhaps, the fear of the People.",
    upSymbol: "The Scroll",
    upSymbolInterpretation: "Knowledge, law, tradition, birthright.",
    reversedSymbol: "The Golden Apple",
    reversedSymbolInterpretation: "lies, discord, politics, temptation."
};
export const black = {
    name: "Black: The Divider",
    interpretation: "Everything and everyone that enables the Restoration to maintain its regime. The army and the theoreticians of the Restoration, the police forces and the propagandists. Also, perhaps, the hole, deep within our souls and society, that let them grab and hold to power.",
    upSymbol: "The Hourglass",
    upSymbolInterpretation: "Something old and corrupted, the slow decay of something beautiful, failing to let go.",
    reversedSymbol: "The Wind",
    reversedSymbolInterpretation: "Something new and evil, the sudden destruction of something beautiful, giving up too early",
};
let suits = {
    red: red,
    purple: purple,
    pink: pink,
    blue: blue,
    gold: gold,
    black: black
};
class Card {
    constructor(name, suit, upLegend, reversedLegend, value, strValue, index) {
        this.name = name;
        this.suit = suit;
        this.upLegend = upLegend;
        this.reversedLegend = reversedLegend;
        this.strValue = strValue;
        this.index = cardIndex(index);
    }
}
class Drawn {
    constructor(card, up) {
        this.card = card;
        this.up = up;
    }
}
// Initialize.
export const deck = new Deck(window.localStorage.getItem("deck"));
