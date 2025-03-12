export function imgURL(index) {
    let value = (index + 1) * 2;
    let key;
    if (value < 10) {
        key = `00${value}`;
    }
    else if (value < 100) {
        key = `0${value}`;
    }
    else {
        key = `${value}`;
    }
    return `./resources/img/deck/Deck of Memories - pod-page${key}.png`;
}
