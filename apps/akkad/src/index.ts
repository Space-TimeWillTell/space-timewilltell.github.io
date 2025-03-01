import { deck, CardIndex, ShuffleEvent, LockEvent, NUMBER_OF_CARDS } from "./deck.mjs";
import { preload } from "./preloader.mjs";
import { imgURL } from "./loader.mjs";

console.log("Starting deck", deck);


const divVisibleCard = document.getElementById("visibleCard");
const divVisibleCardDescriptionName = document.getElementById("visibleCardName");
const divVisibleCardDescriptionSymbol = document.getElementById("visibleCardSymbol");
const divVisibleCardDescriptionLegend = document.getElementById("visibleCardLegend");
const divVisibleCardDescriptionValue = document.getElementById("visibleCardValue");
const divShuffling = document.getElementById("shuffling");
const btnLockScene = document.getElementById("lockForScene");
const btnLockSession = document.getElementById("lockForSession");
const btnLockAct = document.getElementById("lockForAct");
const btnRefreshScene = document.getElementById("refreshScene");
const btnRefreshSession = document.getElementById("refreshSession");
const btnRefreshAct = document.getElementById("refreshAct");
const btnDeck = document.getElementById("deck");
const btnDiscard = document.getElementById("discard");

function displayCard() {
    let drawn = deck.top();
    let url = `url("${imgURL(drawn.card.index)}")`;
    if (drawn.up) {
        divVisibleCard.style.transform = "";
    } else {
        divVisibleCard.style.transform = "rotate(180deg)";
    }
    divVisibleCard.style.backgroundImage = url;

    let name = drawn.up ? drawn.card.name : `${drawn.card.name} (reversed)`;
    let symbol = drawn.up ? drawn.card.suit.upSymbol : drawn.card.suit.reversedSymbol;
    let legend = drawn.up ? drawn.card.upLegend : drawn.card.reversedLegend;
    let value = `${drawn.card.strValue} of ${drawn.card.suit.name}`;

    divVisibleCardDescriptionName.textContent = name;
    divVisibleCardDescriptionSymbol.textContent = symbol;
    divVisibleCardDescriptionLegend.textContent = `"${legend}"`;
    divVisibleCardDescriptionValue.textContent = value;
}

function displayLocked() {
    btnLockScene.textContent = deck.lockedScene.size > 0 ? `${deck.lockedScene.size}` : "";
    btnLockSession.textContent = deck.lockedSession.size > 0 ?  `${deck.lockedSession.size}` : "";
    btnLockAct.textContent = deck.lockedAct.size > 0 ? `${deck.lockedAct.size}` : "";

    let totalScene = deck.lockedScene.size;
    btnRefreshScene.textContent = totalScene > 0 ? `${totalScene}` : "";

    let totalSession = totalScene + deck.lockedSession.size;
    btnRefreshSession.textContent = totalSession > 0 ? `${totalSession}` : "";

    let totalAct = totalSession + deck.lockedAct.size;
    btnRefreshAct.textContent = totalAct > 0 ? `${totalAct}` : "";
}

function displayRemaining() {
    btnDeck.textContent = `${deck.nextCards.length}`;
    let discard = NUMBER_OF_CARDS - deck.nextCards.length - deck.lockedAct.size - deck.lockedSession.size - deck.lockedScene.size;
    if (discard > 0) {
        btnDiscard.textContent = `${discard}`;
    } else {
        btnDiscard.textContent = "";
    }
}

displayCard();
displayLocked();
displayRemaining();

// Display "shuffling" notifier.
deck.addEventListener({event: "shuffle", callback: function(e: ShuffleEvent) {
    switch (e.event) {
        case "start":
            console.debug("Deck is being shuffled");
            divShuffling.style.opacity = "100%";
            break;
        case "done":
            console.debug("Deck shuffling complete");
            window.setTimeout(() => {
                divShuffling.style.opacity = "0%";
            }, 1000);
            displayRemaining();
            break;
        case "failed":
            console.error("Error shuffling the deck");
            break;
    }
}})

// If we click on the image or the deck, draw a new card.
function onNextCard() {
    deck.next();
    displayCard();
    displayRemaining();
}
divVisibleCard.addEventListener("click", onNextCard);
btnDeck.addEventListener("click", onNextCard);

// If we click on the discard pile, shuffle.
btnDiscard.addEventListener("click", function() {
    deck.shuffle();
});

// Lock cards as needed.
btnLockScene.addEventListener("click", function() {
    deck.lockScene();
    displayCard();
    displayRemaining();
});

btnLockSession.addEventListener("click", function() {
    deck.lockSession();
    displayCard();
    displayRemaining();
});

btnLockAct.addEventListener("click", function() {
    deck.lockAct();
    displayCard();
    displayRemaining();
});

btnRefreshScene.addEventListener("click", function() {
    deck.refreshScene();
    displayRemaining();
});

btnRefreshSession.addEventListener("click", function() {
    deck.refreshSession();
    displayRemaining();
});

btnRefreshAct.addEventListener("click", function() {
    deck.refreshAct();
    displayRemaining();
});


deck.addEventListener({event: "locked", callback: function(event: LockEvent) {
    displayLocked();
}});

// Useful for debugging.
(window as any).deck = deck;

// Launch background download of images into the cache.
preload();
