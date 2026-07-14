// Heuristic bot. Reads only its own hand and public state (never opponents'
// hands), so the same function is safe to run on a client or the host.

import {
  type Card,
  type Suit,
  SUITS,
  isJoker,
  isStandard,
  isSpade,
  isAceOfSpades,
  penaltyValue,
  drawValue,
} from './cards';
import { type GameState, type Move, type PlayableOption } from './types';
import { getLegalPlays, drawInfo } from './engine';

export type BotLevel = 'easy' | 'normal' | 'hard';

function findCard(hand: Card[], id: string): Card {
  return hand.find((c) => c.id === id)!;
}

/** Suit the bot holds the most of — where it wants play to continue. */
function bestSuit(hand: Card[], exclude?: string): Suit {
  const counts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) {
    if (c.id === exclude) continue;
    if (isStandard(c)) counts[c.suit]++;
  }
  let best: Suit = 'S';
  for (const s of SUITS) if (counts[s] > counts[best]) best = s;
  return best;
}

/** How much we'd rather keep this card around as a defensive tool (higher = keep). */
function defensiveWeight(c: Card): number {
  if (isAceOfSpades(c)) return 100;
  if (isSpade(c)) return 40;
  if (isStandard(c) && c.rank === 'K') return 30;
  if (isJoker(c)) return 20; // strong attack, worth timing
  return 0;
}

function randomOf<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/**
 * Choose a move for the current player. `rand` defaults to Math.random but can
 * be injected for deterministic tests.
 */
export function chooseBotMove(
  state: GameState,
  playerId: string,
  level: BotLevel = 'normal',
  rand: () => number = Math.random,
): Move {
  const player = state.players.find((p) => p.id === playerId)!;
  const plays = getLegalPlays(state, playerId);
  const { canDraw } = drawInfo(state, playerId);

  if (plays.length === 0) {
    return { type: 'draw' };
  }

  // Easy bots just play something legal at random (or draw sometimes).
  if (level === 'easy') {
    if (canDraw && rand() < 0.15) return { type: 'draw' };
    return concreteMove(state, player.hand, randomOf(plays, rand), rand, level);
  }

  const underAttack = state.pendingDraw > 0;
  const covering = state.mustCover;

  if (underAttack) {
    return chooseUnderAttack(state, player.hand, plays, rand, level);
  }
  if (covering) {
    return chooseCover(state, player.hand, plays, rand, level);
  }
  return chooseNormal(state, player.hand, plays, rand, level);
}

function chooseUnderAttack(
  state: GameState,
  hand: Card[],
  plays: PlayableOption[],
  rand: () => number,
  level: 'normal' | 'hard',
): Move {
  const big = state.pendingDraw >= 4;
  const byCard = (id: string) => findCard(hand, id);

  // Prefer to pass the buck cheaply: stack a 2/3/joker.
  const stackers = plays.filter((o) => {
    const c = byCard(o.cardId);
    return drawValue(c) > 0 && o.modes.some((m) => m.kind !== 'wild' || isJoker(c));
  });
  // Bounce with a King.
  const kings = plays.filter((o) => {
    const c = byCard(o.cardId);
    return isStandard(c) && c.rank === 'K';
  });
  // Cancel with a spade / A♠.
  const cancels = plays.filter((o) =>
    o.modes.some((m) => m.kind === 'wild' || m.kind === 'ace-super'),
  );

  // Cheapest stacker first (a 2 over a joker) to keep strong cards in hand.
  if (stackers.length) {
    stackers.sort((a, b) => drawValue(byCard(a.cardId)) - drawValue(byCard(b.cardId)));
    return concreteMove(state, hand, stackers[0], rand, level);
  }
  if (kings.length) return concreteMove(state, hand, kings[0], rand, level);
  // Only spend a spade to cancel when the incoming stack actually hurts.
  if (cancels.length && (big || hand.length >= state.rules.bustLimit - 3)) {
    return concreteMove(state, hand, cancels[0], rand, level);
  }
  // Otherwise take the hit.
  return { type: 'draw' };
}

function chooseCover(
  state: GameState,
  hand: Card[],
  plays: PlayableOption[],
  rand: () => number,
  level: 'normal' | 'hard',
): Move {
  const byCard = (id: string) => findCard(hand, id);
  // Prefer a plain same-suit cover; avoid burning spades/jokers/aces.
  const ranked = [...plays].sort((a, b) => {
    const ca = byCard(a.cardId);
    const cb = byCard(b.cardId);
    // Avoid re-triggering with another 8.
    const eightA = isStandard(ca) && ca.rank === '8' ? 1 : 0;
    const eightB = isStandard(cb) && cb.rank === '8' ? 1 : 0;
    if (eightA !== eightB) return eightA - eightB;
    return defensiveWeight(ca) - defensiveWeight(cb);
  });
  return concreteMove(state, hand, ranked[0], rand, level);
}

function chooseNormal(
  state: GameState,
  hand: Card[],
  plays: PlayableOption[],
  rand: () => number,
  level: 'normal' | 'hard',
): Move {
  const byCard = (id: string) => findCard(hand, id);
  // Dump the highest-penalty card we can, but hold defensive tools when the
  // hand is still comfortable (hard bots hold longer).
  const holdDefense = level === 'hard' ? hand.length > 3 : hand.length > 5;

  const scored = plays.map((o) => {
    const c = byCard(o.cardId);
    let score = penaltyValue(c); // prefer shedding points
    if (holdDefense) score -= defensiveWeight(c); // but keep counters
    return { o, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return concreteMove(state, hand, scored[0].o, rand, level);
}

/** Turn a PlayableOption into a concrete Move, picking a mode and declarations. */
function concreteMove(
  state: GameState,
  hand: Card[],
  option: PlayableOption,
  rand: () => number,
  level: BotLevel,
): Move {
  const card = findCard(hand, option.cardId);
  // Prefer a non-wild mode when available, to preserve suit-changing flexibility,
  // unless the card is inherently wild (joker / A♠).
  const mode =
    option.modes.find((m) => m.kind === 'normal') ??
    option.modes[0];

  const move: Extract<Move, { type: 'play' }> = {
    type: 'play',
    cardId: option.cardId,
    asWild: mode.kind === 'wild',
  };

  if (mode.needsSuit) {
    move.declaredSuit = level === 'easy' ? randomOf([...SUITS], rand) : bestSuit(hand, card.id);
  }
  if (mode.kind === 'ace-super' && level !== 'easy') {
    // Declare a rank we could follow up on, if we have a non-spade to chase.
    const follow = hand.find((c) => isStandard(c) && c.id !== card.id && !isSpade(c));
    if (follow && isStandard(follow)) {
      move.declaredSuit = follow.suit;
      move.declaredRank = follow.rank;
    }
  }

  // Announce Kadi if this play leaves us on one card.
  if (state.rules.nikoKadi && hand.length - 1 === 1) {
    move.announceKadi = true;
  }
  return move;
}
