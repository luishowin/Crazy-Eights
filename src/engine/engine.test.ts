import { describe, it, expect } from 'vitest';
import {
  createDeck,
  penaltyValue,
  isJoker,
  type Card,
  type Suit,
  type Rank,
} from './cards';
import { makeRules, type RuleConfig } from './rules';
import type { GameState, PlayerState } from './types';
import {
  createGame,
  applyMove,
  getLegalPlays,
  drawInfo,
  viewFor,
  topCard,
} from './engine';
import { chooseBotMove } from './bot';
import { nextRandom } from './rng';

// --- helpers -------------------------------------------------------------

const DECK = createDeck();
function card(id: string): Card {
  const c = DECK.find((x) => x.id === id);
  if (!c) throw new Error('no such card ' + id);
  return structuredClone(c);
}
function hand(...ids: string[]): Card[] {
  return ids.map(card);
}
function mkPlayers(
  specs: { id: string; hand: Card[]; bot?: boolean }[],
): PlayerState[] {
  return specs.map((s) => ({
    id: s.id,
    name: s.id,
    isBot: !!s.bot,
    hand: s.hand,
    eliminated: false,
    finished: false,
    onKadi: false,
  }));
}
function mkState(opts: {
  players: PlayerState[];
  top: Card;
  draw?: Card[];
  current?: number;
  pendingDraw?: number;
  mustCover?: boolean;
  requiredSuit?: Suit | null;
  requiredRank?: Rank | null;
  direction?: 1 | -1;
  rules?: Partial<RuleConfig>;
}): GameState {
  return {
    players: opts.players,
    drawPile: opts.draw ?? [],
    discardPile: [opts.top],
    currentPlayerIndex: opts.current ?? 0,
    direction: opts.direction ?? 1,
    requiredSuit: opts.requiredSuit ?? null,
    requiredRank: opts.requiredRank ?? null,
    pendingDraw: opts.pendingDraw ?? 0,
    mustCover: opts.mustCover ?? false,
    mayPass: false,
    stallTurns: 0,
    rules: makeRules(opts.rules),
    rng: 999,
    phase: 'playing',
    finishOrder: [],
    winnerId: null,
    roundScores: null,
    turnCount: 0,
    log: [],
    eventSeq: 0,
  };
}
function ids(cards: { cardId: string }[]): string[] {
  return cards.map((c) => c.cardId).sort();
}

// --- deck & scoring ------------------------------------------------------

describe('deck', () => {
  it('has 54 cards including two jokers', () => {
    expect(DECK.length).toBe(54);
    expect(DECK.filter(isJoker).length).toBe(2);
  });

  it('scores penalties per the house table', () => {
    expect(penaltyValue(card('JOKER-A'))).toBe(50);
    expect(penaltyValue(card('AS'))).toBe(30);
    expect(penaltyValue(card('8H'))).toBe(20);
    expect(penaltyValue(card('KD'))).toBe(10);
    expect(penaltyValue(card('QC'))).toBe(10);
    expect(penaltyValue(card('AH'))).toBe(1);
    expect(penaltyValue(card('7D'))).toBe(7);
    expect(penaltyValue(card('10S'))).toBe(10);
  });
});

// --- setup ---------------------------------------------------------------

describe('createGame', () => {
  it('deals 5 to each in a 3+ player game, 7 heads-up', () => {
    const g3 = createGame({
      players: [
        { id: 'a', name: 'a', isBot: false },
        { id: 'b', name: 'b', isBot: true },
        { id: 'c', name: 'c', isBot: true },
      ],
      seed: 1,
    });
    expect(g3.players.every((p) => p.hand.length === 5)).toBe(true);

    const g2 = createGame({
      players: [
        { id: 'a', name: 'a', isBot: false },
        { id: 'b', name: 'b', isBot: true },
      ],
      seed: 1,
    });
    expect(g2.players.every((p) => p.hand.length === 7)).toBe(true);
  });

  it('starts on a plain card and is deterministic per seed', () => {
    const opts = {
      players: [
        { id: 'a', name: 'a', isBot: false },
        { id: 'b', name: 'b', isBot: true },
      ],
      seed: 42,
    };
    const a = createGame(opts);
    const b = createGame(opts);
    const top = topCard(a);
    expect(top).toEqual(topCard(b));
    // plain starter: not a power card
    if (top.kind === 'standard') {
      expect(['2', '3', '8', 'J', 'K']).not.toContain(top.rank);
      expect(top.id).not.toBe('AS');
    } else {
      throw new Error('starter should not be a joker');
    }
  });
});

// --- basic play ----------------------------------------------------------

describe('normal play', () => {
  it('accepts a suit or rank match and advances the turn', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('5H', '9C') },
        { id: 'b', hand: hand('KD') },
      ]),
      top: card('5D'), // matches 5H by rank
    });
    const { state } = applyMove(s, 'a', { type: 'play', cardId: '5H' });
    expect(topCard(state).id).toBe('5H');
    expect(state.currentPlayerIndex).toBe(1);
  });

  it('rejects an out-of-turn move', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('5H') },
        { id: 'b', hand: hand('KD') },
      ]),
      top: card('5D'),
    });
    expect(() => applyMove(s, 'b', { type: 'play', cardId: 'KD' })).toThrow();
  });
});

// --- draw stacks ---------------------------------------------------------

describe('draw stacks', () => {
  it('accumulates 2s and 3s regardless of suit', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('3C', '9D') },
        { id: 'b', hand: hand('KD') },
      ]),
      top: card('2S'),
      pendingDraw: 2,
    });
    const { state } = applyMove(s, 'a', { type: 'play', cardId: '3C' });
    expect(state.pendingDraw).toBe(5);
    expect(state.currentPlayerIndex).toBe(1);
  });

  it('eats the whole stack when you cannot counter', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('9H') },
        { id: 'b', hand: hand('KD') },
      ]),
      top: card('2S'),
      pendingDraw: 5,
      draw: hand('9D', '9C', '7D', '7C', '6D', '6C'),
    });
    const { state } = applyMove(s, 'a', { type: 'draw' });
    expect(state.players[0].hand.length).toBe(1 + 5);
    expect(state.pendingDraw).toBe(0);
    expect(state.currentPlayerIndex).toBe(1);
  });

  it('cancels the entire stack with a spade played as wild', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('5S', '9D') },
        { id: 'b', hand: hand('KD') },
      ]),
      top: card('2S'),
      pendingDraw: 6,
    });
    const { state } = applyMove(s, 'a', {
      type: 'play',
      cardId: '5S',
      asWild: true,
      declaredSuit: 'H',
    });
    expect(state.pendingDraw).toBe(0);
    expect(state.requiredSuit).toBe('H');
    expect(state.currentPlayerIndex).toBe(1);
  });

  it('bounces the stack back at the attacker with a King', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('KH', '9D') },
        { id: 'b', hand: hand('9C') },
        { id: 'c', hand: hand('7C') },
      ]),
      top: card('2S'),
      pendingDraw: 2,
      current: 0,
      direction: 1,
    });
    const { state } = applyMove(s, 'a', { type: 'play', cardId: 'KH' });
    expect(state.direction).toBe(-1);
    expect(state.pendingDraw).toBe(2);
    expect(state.currentPlayerIndex).toBe(2); // bounced to the player "behind"
  });

  it('under attack, only counters are legal', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('5H', 'KD', '3C', 'AS') },
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('2S'),
      pendingDraw: 2,
    });
    expect(ids(getLegalPlays(s, 'a'))).toEqual(['3C', 'AS', 'KD']);
  });
});

// --- jokers --------------------------------------------------------------

describe('joker', () => {
  it('forces a draw-5 and declares the continuing suit', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('JOKER-A', '9D') },
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('5D'),
    });
    const { state } = applyMove(s, 'a', {
      type: 'play',
      cardId: 'JOKER-A',
      declaredSuit: 'C',
    });
    expect(state.pendingDraw).toBe(5);
    expect(state.requiredSuit).toBe('C');
  });
});

// --- skips & reverses ----------------------------------------------------

describe('J and K', () => {
  it('J skips the next player', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('JD', '9D') },
        { id: 'b', hand: hand('9C') },
        { id: 'c', hand: hand('7C') },
      ]),
      top: card('5D'),
    });
    const { state } = applyMove(s, 'a', { type: 'play', cardId: 'JD' });
    expect(state.currentPlayerIndex).toBe(2);
  });

  it('K reverses direction with 3+ players', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('KD', '9D') },
        { id: 'b', hand: hand('9C') },
        { id: 'c', hand: hand('7C') },
      ]),
      top: card('5D'),
    });
    const { state } = applyMove(s, 'a', { type: 'play', cardId: 'KD' });
    expect(state.direction).toBe(-1);
    expect(state.currentPlayerIndex).toBe(2);
  });

  it('K makes you play again heads-up', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('KD', '9H') },
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('5D'),
    });
    const { state } = applyMove(s, 'a', { type: 'play', cardId: 'KD' });
    expect(state.currentPlayerIndex).toBe(0);
  });
});

// --- the 8 ---------------------------------------------------------------

describe('the 8', () => {
  it('must be covered by the same player, effect of the cover fires', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('8H', '2H', '9D') },
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('5H'),
    });
    const afterEight = applyMove(s, 'a', { type: 'play', cardId: '8H' });
    expect(afterEight.state.mustCover).toBe(true);
    expect(afterEight.state.currentPlayerIndex).toBe(0); // still player a

    const afterCover = applyMove(afterEight.state, 'a', {
      type: 'play',
      cardId: '2H',
    });
    expect(afterCover.state.mustCover).toBe(false);
    expect(afterCover.state.pendingDraw).toBe(2); // cover's effect fired
    expect(afterCover.state.currentPlayerIndex).toBe(1);
  });

  it('give up: draw 1 and the uncovered 8 passes on', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('4C') }, // cannot cover a heart 8
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('8H'),
      mustCover: true,
      draw: hand('9D', '9S'),
    });
    expect(drawInfo(s, 'a').meaning).toBe('giveUp');
    const { state } = applyMove(s, 'a', { type: 'draw' });
    expect(state.players[0].hand.length).toBe(2);
    expect(state.mustCover).toBe(true);
    expect(state.currentPlayerIndex).toBe(1);
  });

  it('cannot win on an 8 — playing it as your last card forces a draw', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('8H') },
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('5H'),
      draw: hand('9D', '9S'),
    });
    const { state } = applyMove(s, 'a', { type: 'play', cardId: '8H' });
    expect(state.players[0].finished).toBe(false);
    expect(state.players[0].hand.length).toBe(1);
    expect(state.phase).toBe('playing');
    expect(state.currentPlayerIndex).toBe(1);
  });
});

// --- spades --------------------------------------------------------------

describe('spades', () => {
  it('played as wild change the suit and suppress the rank effect', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('2S', '9D') },
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('5H'),
    });
    const { state } = applyMove(s, 'a', {
      type: 'play',
      cardId: '2S',
      asWild: true,
      declaredSuit: 'D',
    });
    expect(state.pendingDraw).toBe(0); // draw-2 suppressed
    expect(state.requiredSuit).toBe('D');
  });

  it('played as themselves fire their rank effect', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('2S', '9D') },
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('5H'),
    });
    const { state } = applyMove(s, 'a', { type: 'play', cardId: '2S' });
    expect(state.pendingDraw).toBe(2);
    expect(state.requiredSuit).toBe(null); // continues in spades naturally
  });

  it('A♠ supercard sets suit and rank; next player matches either', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('AS', '9D') },
        { id: 'b', hand: hand('KC', '3D') },
      ]),
      top: card('5H'),
    });
    const { state } = applyMove(s, 'a', {
      type: 'play',
      cardId: 'AS',
      declaredSuit: 'H',
      declaredRank: 'K',
    });
    expect(state.requiredSuit).toBe('H');
    expect(state.requiredRank).toBe('K');
    // b can play KC (rank K) but not 3D
    expect(ids(getLegalPlays(state, 'b'))).toEqual(['KC']);
  });
});

// --- busting -------------------------------------------------------------

describe('busting', () => {
  it('eliminates a player who reaches the bust limit with no play', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('5H', '6H', '7H', '9H', '10H') },
        { id: 'b', hand: hand('9C') },
        { id: 'c', hand: hand('7C') },
      ]),
      top: card('4C'),
      draw: hand('9D'), // not playable on 4C
      rules: { bustLimit: 6 },
    });
    const { state } = applyMove(s, 'a', { type: 'draw' });
    expect(state.players[0].eliminated).toBe(true);
  });

  it('pardons a bust when the limit-reaching card is playable', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('5H', '6H', '7H', '9H', '10H') },
        { id: 'b', hand: hand('9C') },
        { id: 'c', hand: hand('7C') },
      ]),
      top: card('4C'),
      draw: hand('4H'), // matches 4C by rank
      rules: { bustLimit: 6 },
    });
    const { state } = applyMove(s, 'a', { type: 'draw' });
    expect(state.players[0].eliminated).toBe(false);
    expect(state.currentPlayerIndex).toBe(0); // must now play
  });
});

// --- winning -------------------------------------------------------------

describe('winning', () => {
  it('finishing empties the hand, ends the round, and the final effect fires', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('2H') },
        { id: 'b', hand: hand('9C') },
        { id: 'c', hand: hand('7C') },
      ]),
      top: card('5H'),
      draw: hand('9D', '9S', 'QD', 'QC'),
    });
    const { state } = applyMove(s, 'a', { type: 'play', cardId: '2H' });
    expect(state.players[0].finished).toBe(true);
    expect(state.winnerId).toBe('a');
    expect(state.phase).toBe('roundOver');
    // final 2 still fired: player b ate 2
    expect(state.players[1].hand.length).toBe(3);
    expect(state.roundScores).not.toBeNull();
  });
});

// --- views ---------------------------------------------------------------

describe('viewFor', () => {
  it('hides opponent hands but shows counts', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('5H', '9C') },
        { id: 'b', hand: hand('KD', 'QD', '3S') },
      ]),
      top: card('5D'),
    });
    const view = viewFor(s, 'a');
    expect(view.yourHand.length).toBe(2);
    const opp = view.players.find((p) => p.id === 'b')!;
    expect(opp.handCount).toBe(3);
    expect((opp as unknown as Record<string, unknown>).hand).toBeUndefined();
  });
});

// --- niko kadi -------------------------------------------------------------

describe('niko kadi', () => {
  const base = () =>
    mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('5H', '9D') },
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('5D'),
      draw: hand('QD', 'QC', 'JC'),
      rules: { nikoKadi: true },
    });

  it('announcing on the play to one card sets the badge, no penalty', () => {
    const { state } = applyMove(base(), 'a', {
      type: 'play',
      cardId: '5H',
      announceKadi: true,
    });
    expect(state.players[0].hand.length).toBe(1);
    expect(state.players[0].onKadi).toBe(true);
    expect(state.log.some((e) => e.t === 'kadi')).toBe(true);
    const view = viewFor(state, 'b');
    expect(view.players.find((p) => p.id === 'a')!.onKadi).toBe(true);
  });

  it('forgetting the announcement draws the penalty and clears the badge', () => {
    const { state } = applyMove(base(), 'a', { type: 'play', cardId: '5H' });
    expect(state.players[0].hand.length).toBe(1 + 2);
    expect(state.players[0].onKadi).toBe(false);
    expect(state.log.some((e) => e.t === 'kadiMissed')).toBe(true);
  });

  it('the badge clears when the hand grows again', () => {
    const announced = applyMove(base(), 'a', {
      type: 'play',
      cardId: '5H',
      announceKadi: true,
    }).state;
    // b attacks a... simulate a forced draw by giving b a 2 and letting a eat.
    expect(announced.players[0].onKadi).toBe(true);
    const withAttack = { ...structuredClone(announced), pendingDraw: 2, currentPlayerIndex: 0 };
    const { state } = applyMove(withAttack, 'a', { type: 'draw' });
    expect(state.players[0].onKadi).toBe(false);
  });
});

// --- forced cover ----------------------------------------------------------

describe('forced cover', () => {
  it('give-up draw is illegal while holding a legal cover (default rules)', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('4H', '9C') }, // 4H covers the 8H
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('8H'),
      mustCover: true,
      draw: hand('QD'),
    });
    expect(drawInfo(s, 'a').canDraw).toBe(false);
    expect(() => applyMove(s, 'a', { type: 'draw' })).toThrow();
  });

  it('give-up draw is allowed when no cover exists', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('4C', '9C') },
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('8H'),
      mustCover: true,
      draw: hand('QD'),
    });
    expect(drawInfo(s, 'a').canDraw).toBe(true);
  });

  it('give-up with a cover in hand is allowed when voluntary draws are on', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('4H', '9C') },
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('8H'),
      mustCover: true,
      draw: hand('QD'),
      rules: { noVoluntaryDraw: false },
    });
    expect(drawInfo(s, 'a').canDraw).toBe(true);
  });
});

// --- voluntary draw & pass ---------------------------------------------------

describe('voluntary draw', () => {
  const base = () =>
    mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('5H', '9C') }, // 5H is playable on 5D
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('5D'),
      draw: hand('QD', 'QC'),
      rules: { noVoluntaryDraw: false },
    });

  it('draws exactly one card and allows play-or-pass', () => {
    const { state } = applyMove(base(), 'a', { type: 'draw' });
    expect(state.players[0].hand.length).toBe(3); // one card, not a dig
    expect(state.currentPlayerIndex).toBe(0); // turn stays
    expect(state.mayPass).toBe(true);
    expect(viewFor(state, 'a').canPass).toBe(true);

    // a second voluntary draw the same turn is illegal
    expect(drawInfo(state, 'a').canDraw).toBe(false);

    // passing ends the turn
    const after = applyMove(state, 'a', { type: 'pass' }).state;
    expect(after.currentPlayerIndex).toBe(1);
    expect(after.mayPass).toBe(false);
  });

  it('playing after the voluntary draw also works', () => {
    const drawn = applyMove(base(), 'a', { type: 'draw' }).state;
    const { state } = applyMove(drawn, 'a', { type: 'play', cardId: '5H' });
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.mayPass).toBe(false);
  });

  it('pass is illegal without a voluntary draw first', () => {
    expect(() => applyMove(base(), 'a', { type: 'pass' })).toThrow();
  });

  it('voluntary draws stay illegal under default rules', () => {
    const s = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('5H', '9C') },
        { id: 'b', hand: hand('9C') },
      ]),
      top: card('5D'),
      draw: hand('QD'),
    });
    expect(drawInfo(s, 'a').canDraw).toBe(false);
  });
});

// --- stalemate guard ---------------------------------------------------------

describe('stalemate', () => {
  it('ends the round when nobody can play or draw', () => {
    // Empty draw pile, single discard, hands that can never match 4C.
    let state = mkState({
      players: mkPlayers([
        { id: 'a', hand: hand('9H', '10H') },
        { id: 'b', hand: hand('9D', '10D', 'QD') },
        { id: 'c', hand: hand('QH', '7H', '6H') },
      ]),
      top: card('4C'),
      draw: [],
    });
    let guard = 0;
    while (state.phase === 'playing' && guard < 12) {
      const pid = state.players[state.currentPlayerIndex].id;
      state = applyMove(state, pid, { type: 'draw' }).state;
      guard++;
    }
    expect(state.phase).toBe('roundOver');
    expect(state.log.some((e) => e.t === 'stalemate')).toBe(true);
    // cheapest hand wins: a holds 19, b holds 29, c holds 23
    expect(state.winnerId).toBe('a');
  });
});

// --- log cap -----------------------------------------------------------------

describe('event log', () => {
  it('stays capped while eventSeq keeps counting', () => {
    let state = createGame({
      players: [
        { id: 'a', name: 'A', isBot: true },
        { id: 'b', name: 'B', isBot: true },
        { id: 'c', name: 'C', isBot: true },
      ],
      seed: 7,
    });
    let guard = 0;
    while (state.phase === 'playing' && guard < 500) {
      const pid = state.players[state.currentPlayerIndex].id;
      state = applyMove(state, pid, chooseBotMove(state, pid, 'normal', () => 0.5)).state;
      guard++;
    }
    expect(state.log.length).toBeLessThanOrEqual(60);
    expect(state.eventSeq).toBeGreaterThanOrEqual(state.log.length);
  });
});

// --- bot integration -----------------------------------------------------

describe('bot self-play', () => {
  function seededRand(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      const [r, ns] = nextRandom(s);
      s = ns;
      return r;
    };
  }

  it('plays full games to completion without illegal moves', () => {
    for (let seed = 0; seed < 25; seed++) {
      let state = createGame({
        players: [
          { id: 'a', name: 'A', isBot: true },
          { id: 'b', name: 'B', isBot: true },
          { id: 'c', name: 'C', isBot: true },
          { id: 'd', name: 'D', isBot: true },
        ],
        seed,
      });
      const rand = seededRand(seed + 1000);
      let guard = 0;
      while (state.phase === 'playing' && guard < 3000) {
        const pid = state.players[state.currentPlayerIndex].id;
        const move = chooseBotMove(state, pid, 'normal', rand);
        state = applyMove(state, pid, move).state;
        guard++;
      }
      expect(state.phase).toBe('roundOver');
      expect(state.winnerId).toBeTruthy();
      expect(guard).toBeLessThan(3000);
    }
  });

  it('heads-up games also terminate', () => {
    for (let seed = 0; seed < 15; seed++) {
      let state = createGame({
        players: [
          { id: 'a', name: 'A', isBot: true },
          { id: 'b', name: 'B', isBot: true },
        ],
        seed: seed + 500,
      });
      const rand = seededRand(seed);
      let guard = 0;
      while (state.phase === 'playing' && guard < 3000) {
        const pid = state.players[state.currentPlayerIndex].id;
        state = applyMove(state, pid, chooseBotMove(state, pid, 'hard', rand)).state;
        guard++;
      }
      expect(state.phase).toBe('roundOver');
    }
  });
});
