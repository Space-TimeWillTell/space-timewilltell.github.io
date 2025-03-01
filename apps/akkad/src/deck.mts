import { Opaque } from "./tag.mjs";

export const NUMBER_OF_CARDS = 90;

declare const CardIndexSymbol: unique symbol;
/**
 * A value in 0..NUMBER_OF_CARDS.
 */
export type CardIndex = Opaque<number, typeof CardIndexSymbol>;
function cardIndex(value: number): CardIndex {
    if (value < 0 || value > NUMBER_OF_CARDS) {
        throw new TypeError("Invalid card index " + value);
    }
    return value as CardIndex;
}

/**
 * The state of the deck.
 */
class Deck {
    nextCards: Array<CardIndex>

    /**
     * Whether the current card is upside or downside.
     */
    nextUpside: boolean

    /**
     * Cards locked until the end of the act.
     */
    lockedAct: Set<CardIndex>

    /**
     * Cards locked until the end of the session.
     */
    lockedSession: Set<CardIndex>

    /**
     * Cards locked until the end of the scene.
     */
    lockedScene: Set<CardIndex>

    /**
     * Event listeners
     */
    listeners: {
        shuffle: ((e:ShuffleEvent)=>void)[]
        locked: ((e:LockEvent)=>void)[]
    }

    /**
     * Prepare for JSON serialization.
     */
    toJSON(): SerializedStoreState {
        return {
            nextCards: this.nextCards,
            nextUpside: this.nextUpside,
            lockedAct: [...this.lockedAct],
            lockedSession: [...this.lockedSession],
            lockedScene: [...this.lockedScene],
        }
    }

    /**
     * Parse from JSON.
     */
    constructor(serialized: string | null) {
        this.listeners = {
            shuffle: [],
            locked: [],
        }
        if (serialized) {
            console.debug("Deck", "Attempting to deserialize");
            try {
                let obj : SerializedStoreState = JSON.parse(serialized);

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
            } catch (error) {
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
            listener({event: "start"})
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
        } catch (e) {
            for (let listener of this.listeners.shuffle) {
                listener(new ShuffleFailedEvent(e));
            }
            throw e;
        }
        for (let listener of this.listeners.shuffle) {
            listener({event: "done"})
        }
        this.save();
    }

    check(expectEverythingPressent: boolean = false) {
        let cards: Set<CardIndex> = new Set();
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
    top(): Drawn {
        if (this.nextCards.length == 0) {
            this.shuffle();
        }
        let card = cards[this.nextCards[this.nextCards.length - 1]];
        return new Drawn(card, this.nextUpside);
    }

    /**
     * Draw the next card.
     */
    next(): Drawn {
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
    }

    _auxLock(to: Set<CardIndex>, name: "scene" | "session" | "act") {
        for (let i = 0; i < NUMBER_OF_CARDS; ++i) {
            // We limit redraws in case the only remaining cards are black.
            let drawn = this.next();
            if (drawn.card.suit == black) {
                console.debug("Deck", "locking for", name, "skipping black card", drawn);
                continue;
            }

            // We have found a card, we should be good.
            to.add(drawn.card.index);
            this.next();
            for (let listener of this.listeners.locked) {
                listener({event: "updated", name});
            }
            return;
        }
        for (let listener of this.listeners.locked) {
            listener({event: "failed", name});
        }
    }

    /**
     * Lock the next card for one scene.
     */
    lockScene() {
        this._auxLock(this.lockedScene, "scene")
    }

    /**
     * Lock the next card for one session.
     */
    lockSession() {
        this._auxLock(this.lockedSession, "session")
    }

    /**
     * Lock the next card for one act.
     */
    lockAct() {
        this._auxLock(this.lockedAct, "act")
    }

    /**
     * Start a new scene.
     */
    refreshScene() {
        this._auxRefresh([this.lockedScene], "scene")
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
        this._auxRefresh([this.lockedScene, this.lockedSession, this.lockedAct], "act")
    }

    /**
     * Implementation of all the `refresh*` methods.
     *
     * @param refresh The list of indices to refresh.
     * @param name The name of the event.
     */
    private _auxRefresh(refresh: Set<CardIndex>[], name: "session" | "act" | "scene") {
        for (let set of refresh) {
            set.clear();
        }
        this.save();
        for (let listener of this.listeners.locked) {
            listener({event: "updated", name})
        }
    }

    addEventListener(
        listener: {event: "shuffle" , callback: (ShuffleEvent) => void}
        |         {event: "locked" , callback: (LockEvent) => void}
    ) {
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

export interface ShuffleEvent {
    event: "start" | "done" | "failed";
}
export class ShuffleFailedEvent implements ShuffleEvent {
    event: "failed"
    error: Error
    constructor(error: Error) {
        this.error = error
    }
}

export interface LockEvent {
    event: "updated" | "failed";
    name: "scene" | "session" | "act";
}

type SerializedStoreState = {
    nextCards: number[],
    nextUpside: boolean,
    lockedAct: number[],
    lockedSession: number[],
    lockedScene: number[],
}

type Suit = {
    name: string,
    upSymbol: string,
    reversedSymbol: string,
}
export const red: Suit = {
    name: "Red: The Dreamers",
    upSymbol: "The Broken Icon (broken dreams, shattered promises)",
    reversedSymbol: "The Smoke (illusions, dreams, imagination)",
}
export const purple: Suit = {
    name: "Purple: The Underbelly",
    upSymbol: "The Gangster (upsetting the rules, breaking the limits, bullying)",
    reversedSymbol: "The Spirit Bottle (excess, vice, self-harm)",
}
export const pink: Suit = {
    name: "Pink: The Adventurers",
    upSymbol: "The Eye/Tree (growth, learning, discovery)",
    reversedSymbol: "The Sleeper (rest, death, the future yet to be born)",
}
export const blue: Suit = {
    name: "Blue: The People",
    upSymbol: "The Imperial Owl (authority, conformity, order, safety)",
    reversedSymbol: "The Broken Man (exploitation, discontent, accidents, disregard)",
}
export const gold: Suit = {
    name: "Gold: The Elites",
    upSymbol: "The Scroll (knowledge, law, birthright)",
    reversedSymbol: "The Golden Apple (lies, discord, politics, temptation)",
}
export const black: Suit = {
    name: "Black: The Divider",
    upSymbol: "The Hourglass (something old and corrupted, the slow decay of something beautiful, failing to let go)",
    reversedSymbol: "The Wind (something new and evil, the sudden destruction of something beautiful, giving up too early)",
}

class Card {
    name: string;
    suit: Suit;
    upLegend: string;
    reversedLegend: string;
    value: number;
    strValue: string;
    index: CardIndex;
    constructor(name: string, suit: Suit, upLegend: string, reversedLegend: string, value: number, strValue: string, index: number) {
        this.name = name;
        this.suit = suit;
        this.upLegend = upLegend;
        this.reversedLegend = reversedLegend;
        this.value = value;
        this.strValue = strValue;
        this.index = cardIndex(index);
    }
}

class Drawn {
    card: Card
    up: boolean
    constructor(card: Card, up: boolean) {
        this.card = card;
        this.up = up;
    }
}

export const cards = [
	new Card("The Air Field", red, "Higher and higher", "And never return", 0, "1", 0),
	new Card("The Studios", red, "A world of magic", "From your dreams stars are made", 1, "2", 1),
	new Card("The Sea", red, "Quiet", "The wrath of elements", 2, "3", 2),
	new Card("The Player", red, "Double or quit?", "My passion", 3, "4", 3),
	new Card("The Journalist", red, "Uncovering the truth", "Walking the editorial line", 4, "5", 4),
	new Card("The Muse", red, "Beloved of all", "Prisoner of their glances", 5, "6", 5),
	new Card("The Factory", red, "With our hands", "The last of the Masters", 6, "7", 6),
	new Card("The House of Games", red, "Everything to Win", "Everything to Lose", 7, "8", 7),
	new Card("The Orange Garden", red, "An artificial Paradise", "Quite decorative", 8, "9", 8),
	new Card("One More Game?", red, "My Queen for your Kingdom", "Five steps ahead", 9, "10", 9),
	new Card("The Summoning", red, "Among us still", "It's all in your mind, silly", 10, "11", 10),
	new Card("The Smoke", red, "Reveal the Unseen", "Where does Reality end?", 11, "12", 11),
	new Card("The Union", red, "Right makes might", "Our time will come", 12, "13", 12),
	new Card("The Rebellion", red, "For a better world", "Pick your side", 13, "14", 13),
	new Card("The Researchers", red, "I would give anything to find out", "A lifetime worth of questions", 14, "15", 14),
	new Card("Whatever Remains", purple, "Letting go", "We could have rebuilt", 0, "1", 15),
	new Card("The Ghetto", purple, "Those people", "Just behind your house", 1, "2", 16),
	new Card("The Docks", purple, "Time to rebuild", "The blood of empires", 2, "3", 17),
	new Card("The Madame", purple, "A mother for us all", "Their miserable secrets", 3, "4", 18),
	new Card("The Forger", purple, "Reality is an art", "Absolute conformity", 4, "5", 19),
	new Card("The Contract Killer", purple, "Every problem has a solution", "Staring down the barrel", 5, "6", 20),
	new Card("The Arena", purple, "One last round", "Just to destroy something beautiful", 6, "7", 21),
	new Card("The Cabaret", purple, "Let the fun times begin!", "A layer of gold on a background of misery", 7, "8", 22),
	new Card("The Distillery", purple, "The eldest tradition", "One last step towards Oblivion", 8, "9", 23),
	new Card("The Informant", purple, "Our staunchest ally", "The final traitor", 9, "10", 24),
	new Card("The Shootout", purple, "Saw no evil, heard no evil, spoke no evil", "Wrong job if you want to grow old", 10, "11", 25),
	new Card("The Crackdown", purple, "Fun times are over", "Nothing to see", 11, "12", 26),
	new Card("The Lost Children", purple, "And never grow up", "For you have sinned", 12, "13", 27),
	new Card("The Shadow Police", purple, "Discretion itself", "Just a point of detail", 13, "14", 28),
	new Card("The Gang", purple, "A form of hope", "Nothing is as sacred as family", 14, "15", 29),
	new Card("The Catacombs", pink, "A strange place to meet", "Secrets are best buried deep", 0, "1", 30),
	new Card("The Immensity", pink, "We wanted to touch the sky", "Absolute freedom", 1, "2", 31),
	new Card("The Jungle", pink, "The call to adventure", "The ruins of the past", 2, "3", 32),
	new Card("The Burglar", pink, "A light touch", "Never to be found", 3, "4", 33),
	new Card("The Aviatrix", pink, "A formidable hero", "Hotheaded", 4, "5", 34),
	new Card("The Physician", pink, "Do no harm", "Acceptable losses", 5, "6", 35),
	new Card("The Nicosie", pink, "At the crossroads", "The grass must be greener", 6, "7", 36),
	new Card("The Workshop", pink, "There are no limits", "Liberty will come from above", 7, "8", 37),
	new Card("The Hideout", pink, "We could be safe", "We can't stay forever", 8, "9", 38),
	new Card("The Jump", pink, "I will not follow that track", "It's not the fall that matters", 9, "10", 39),
	new Card("The Duel", pink, "A matter of honor", "One of us is too many", 10, "11", 40),
	new Card("The Chase", pink, "Grace and bravery", "I'll be there for you", 11, "12", 41),
	new Card("The Mechanics", pink, "It runs better than ever", "Don't mind the holes", 12, "13", 42),
	new Card("The Soldiers", pink, "Look at them march", "Some will return", 13, "14", 43),
	new Card("The Archaeologists", pink, "The battle for History", "We walk the sublime paths", 14, "15", 44),
	new Card("The City", blue, "All the riches in the Empire", "Behind closed doors", 0, "1", 45),
	new Card("The Worker's Village", blue, "Sleep on, you brave folk", "At least, I have a roof", 1, "2", 46),
	new Card("The Desert", blue, "A good place to start over", "A good place to waste away", 2, "3", 47),
	new Card("The Veteran", blue, "The sum of our experiences", "Just another piece of waste", 3, "4", 48),
	new Card("The Farmer", blue, "The Empire hungers", "And my father before him", 4, "5", 49),
	new Card("The Dancer", blue, "The one perfect move", "Fifteen minutes of glory", 5, "6", 50),
	new Card("The Station", blue, "Get on board", "On the wrong side of the tracks", 6, "7", 51),
	new Card("The Fortress", blue, "Protected", "Disappeared", 7, "8", 52),
	new Card("The Palace", blue, "Let my Justice be done", "You have your orders", 8, "9", 53),
	new Card("The Wait", blue, "Something will come up", "Fresh meat", 9, "10", 54),
	new Card("The Burning", blue, "Leave the past to the past", "To think is to disobey", 10, "11", 55),
	new Card("The War", blue, "Nothing new", "Diplomacy has failed", 11, "12", 56),
	new Card("The Faithful Ones", blue, "Never shall we falter", "We are Legion", 12, "13", 57),
	new Card("The School Students", blue, "I didn't do it, I swear!", "I'll catch you on the greasy side", 13, "14", 58),
	new Card("The Workers", blue, "United, we shouldn't be defeated", "Back to work", 14, "15", 59),
	new Card("The Industry", gold, "The Wheel is turning", "Smells like progress", 0, "1", 60),
	new Card("The Trading Grounds", gold, "Unlimited riches", "The Bank always wins", 1, "2", 61),
	new Card("The Outpost", gold, "Heaven, one brick at a time", "Who cares about the cost?", 2, "3", 62),
	new Card("The Patron of Arts", gold, "To raise the soul", "Industrializing hope", 3, "4", 63),
	new Card("The Authority", gold, "This is how to use talent", "In time", 4, "5", 64),
	new Card("The Thinker", gold, "An Age of Wonders", "Blessed be the ones who listen", 5, "6", 65),
	new Card("The Opera", gold, "Where will music lead us?", "Losing oneself for an instant", 6, "7", 66),
	new Card("The Curio Cabinet", gold, "Collecting mysteries", "There is place for you", 7, "8", 67),
	new Card("The Gallery", gold, "How may I help you?", "The new temple", 8, "9", 68),
	new Card("The Graduation", gold, "Years of work", "Just a formality", 9, "10", 69),
	new Card("The Progress", gold, "It's painless", "We build the new man", 10, "11", 70),
	new Card("The Betrayal", gold, "The rules are simple", "Loyalty is a luxury", 11, "12", 71),
	new Card("The Myths", gold, "The time of legends is over", "Unworthy of us", 12, "13", 72),
	new Card("The Leadership", gold, "You shall be protected", "Unrefined brutes", 13, "14", 73),
	new Card("Those Who Have", gold, "Among us", "Poverty is a sin", 14, "15", 74),
	new Card("The Mistress of Games", black, "Life is a Bet", "Change the Rules", 0, "I", 75),
	new Card("The Nihilist", black, "History is a Myth", "Out with the Old, in with Chaos", 1, "II", 76),
	new Card("The Socialite", black, "Love Lost", "Lost By Love", 2, "III", 77),
	new Card("The Boogey People", black, "Who Wants to Play?", "You had been warned", 3, "IIII", 78),
	new Card("The Gentleman of Fortune", black, "No one escapes my Destiny", "An offer you can't refuse", 4, "V", 79),
	new Card("The Merciful One", black, "Your best, your only, your final friend", "No heroes in this story", 5, "VI", 80),
	new Card("The Visionary", black, "Let me tell you about the future", "Dreams are written in stone", 6, "VII", 81),
	new Card("The Despair", black, "Forget the stars", "In the Heart of Darkness", 7, "VIII", 82),
	new Card("The Propagandist", black, "Words can Fly", "Past Perfected", 8, "VIIII", 83),
	new Card("The Professor", black, "Behold my generosity", "My feather is mightier than all your swords", 9, "X", 84),
	new Card("The Innovator", black, "Quicker, easier, more seductive", "No ruin, no gain", 10, "XI", 85),
	new Card("The Philosopher", black, "Reduce the world to concepts", "And in darkness, bind them", 11, "XII", 86),
	new Card("The Denial", black, "Why know?", "Who limit oneself?", 12, "XIII", 87),
	new Card("The Thought", black, "Much too dangerous for the masses", "Let the opposition deconstruct itself", 13, "XIIII", 88),
	new Card("The Divine", black, "At the beginning, they scream", "At the end, they die", 14, "XV", 89)
]

// Initialize.
export const deck = new Deck(window.localStorage.getItem("deck"));
