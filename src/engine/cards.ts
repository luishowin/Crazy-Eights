// Card model for Very Crazy Eights.
// A 54-card deck: standard 52 plus two jokers. Every card has a stable `id`
// so moves and UI can reference a specific physical card.

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: readonly Rank[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
];

export interface StandardCard {
  id: string;
  kind: 'standard';
  suit: Suit;
  rank: Rank;
}
export interface JokerCard {
  id: string;
  kind: 'joker';
}
export type Card = StandardCard | JokerCard;

export const isJoker = (c: Card): c is JokerCard => c.kind === 'joker';
export const isStandard = (c: Card): c is StandardCard => c.kind === 'standard';

export const isSpade = (c: Card): boolean => isStandard(c) && c.suit === 'S';
export const isAceOfSpades = (c: Card): boolean =>
  isStandard(c) && c.suit === 'S' && c.rank === 'A';

/** How many cards this card forces the next player to draw (2, 3, joker). */
export function drawValue(c: Card): number {
  if (isJoker(c)) return 5;
  if (isStandard(c) && c.rank === '2') return 2;
  if (isStandard(c) && c.rank === '3') return 3;
  return 0;
}
export const isDrawCard = (c: Card): boolean => drawValue(c) > 0;

/** Penalty points for a card left in hand at round end (see README scoring). */
export function penaltyValue(c: Card): number {
  if (isJoker(c)) return 50;
  if (isStandard(c)) {
    if (c.suit === 'S' && c.rank === 'A') return 30;
    if (c.rank === '8') return 20;
    if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J') return 10;
    if (c.rank === 'A') return 1;
    return parseInt(c.rank, 10); // '2'..'10'
  }
  return 0;
}

/** A fresh, ordered 54-card deck (not shuffled). */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${rank}${suit}`, kind: 'standard', suit, rank });
    }
  }
  cards.push({ id: 'JOKER-A', kind: 'joker' });
  cards.push({ id: 'JOKER-B', kind: 'joker' });
  return cards;
}

// --- Display helpers (used by the UI) ---

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠', // ♠
  H: '♥', // ♥
  D: '♦', // ♦
  C: '♣', // ♣
};
export const SUIT_NAME: Record<Suit, string> = {
  S: 'Spades',
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
};
export const isRedSuit = (s: Suit): boolean => s === 'H' || s === 'D';

export function cardLabel(c: Card): string {
  if (isJoker(c)) return 'Joker';
  return `${c.rank}${SUIT_SYMBOL[c.suit]}`;
}
