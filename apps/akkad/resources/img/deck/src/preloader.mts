import { deck, NUMBER_OF_CARDS } from "./deck.mjs";
import { imgURL } from "./loader.mjs";

let head = window.document.head;

/**
 * Enqueue a single url for background preloading.
 */
function enqueue(url: string) {
    let link = document.createElement("link");
    link.rel = "preload";
    link.href = url;
    link.as = "image";
    head.appendChild(link);
}

/**
 * Preload all images into the cache.
 */
export function preload() {
    // Enqueue downloads, starting with the next images that will be displayed.
    // First, the cards remaining in the draw pile.
    for (let i = deck.nextCards.length - 1; i >= 0; i--) {
        let url = imgURL(deck.nextCards[i]);
        enqueue(url);
    }
    // Then the other cards.
    for (let source of [deck.lockedScene, deck.lockedSession, deck.lockedAct]) {
        for (let index of source) {
            let url = imgURL(index);
            enqueue(url);
        }
    }
}