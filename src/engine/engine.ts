// Very Crazy Eights — pure rules engine.
//
// No UI, no networking, no randomness beyond the seeded RNG carried in state.
// The same engine powers solo-vs-bots, the multiplayer host, and the test suite.
//
// Turn model: applyMove(state, playerId, move) validates the move against the
// current context and returns a new state plus the events it produced. Clients
// send intents; whoever holds authority (host) runs applyMove and broadcasts
// the resulting view.

import {
  type Card,
  type Suit,
  type Rank,
  isJoker,
  isStandard,
  isSpade,
  isAceOfSpades,
  createDeck,
  penaltyValue,
} from './cards';
import { shuffle, randomSeed } from './rng';
import { type RuleConfig, makeRules } from './rules';
import type {
  GameState,
  PlayerState,
  Move,
  GameEvent,
  PlayerView,
  OpponentView,
  PlayableOption,
  PlayMode,
  DrawMeaning,
} from './types';

export interface NewGameOptions {
  players: { id: string; name: string; isBot: boolean }[];
  rules?: Partial<RuleConfig>;
  seed?: number;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** A card is only allowed to start the discard pile if it has no special power. */
function isPlainStarter(c: Card): boolean {
  if (isJoker(c)) return false;
  if (isStandard(c)) {
    if (c.suit === 'S' && c.rank === 'A') return false; // A♠
    if (['2', '3', '8', 'J', 'K'].includes(c.rank)) return false;
  }
  return true;
}

export function createGame(opts: NewGameOptions): GameState {
  if (opts.players.length < 2 || opts.players.length > 6) {
    throw new Error('Very Crazy Eights needs 2 to 6 players.');
  }
  const rules = makeRules(opts.rules);
  let seed = (opts.seed ?? randomSeed()) >>> 0;

  let deck: Card[];
  [deck, seed] = shuffle(createDeck(), seed);

  const handSize =
    opts.players.length === 2
      ? rules.startingHandSizeHeadsUp
      : rules.startingHandSize;

  const players: PlayerState[] = opts.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    hand: [],
    eliminated: false,
    finished: false,
  }));

  // Deal.
  for (let r = 0; r < handSize; r++) {
    for (const player of players) {
      player.hand.push(deck.pop()!);
    }
  }

  // Flip a starter; bury any power card to the bottom and flip again.
  let starter = deck.pop()!;
  while (!isPlainStarter(starter)) {
    deck.unshift(starter);
    starter = deck.pop()!;
  }

  const state: GameState = {
    players,
    drawPile: deck,
    discardPile: [starter],
    currentPlayerIndex: 0,
    direction: 1,
    requiredSuit: null,
    requiredRank: null,
    pendingDraw: 0,
    mustCover: false,
    rules,
    rng: seed,
    phase: 'playing',
    finishOrder: [],
    winnerId: null,
    roundScores: null,
    turnCount: 0,
    log: [],
  };
  return state;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function topCard(state: GameState): Card {
  return state.discardPile[state.discardPile.length - 1];
}

function activeCount(state: GameState): number {
  return state.players.filter((p) => !p.finished && !p.eliminated).length;
}

function playerById(state: GameState, id: string): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

/** The suit/rank the next play must match (accounting for wild overrides). */
function matchTarget(state: GameState): { suit: Suit | null; rank: Rank | null } {
  const top = topCard(state);
  let suit = state.requiredSuit;
  let rank = state.requiredRank;
  if (suit == null) suit = isStandard(top) ? top.suit : null;
  if (rank == null) rank = isStandard(top) ? top.rank : null;
  return { suit, rank };
}

/** Does this card match the current top by suit or rank (wilds match anything)? */
function matchesTop(state: GameState, c: Card): boolean {
  if (isJoker(c)) return true;
  if (isSpade(c)) return true;
  const { suit, rank } = matchTarget(state);
  return (isStandard(c) && c.suit === suit) || (isStandard(c) && c.rank === rank);
}

type PlayModeKind = PlayMode['kind'];

function effectiveMode(card: Card, asWild: boolean | undefined): PlayModeKind {
  if (isJoker(card)) return 'wild';
  if (isAceOfSpades(card)) return 'ace-super';
  if (isSpade(card)) return asWild ? 'wild' : 'normal';
  return 'normal';
}

// ---------------------------------------------------------------------------
// Legality (context-only: does not check that declaredSuit is present)
// ---------------------------------------------------------------------------

/** Can `card` be played in mode `mode` given the current context? */
function isPlayableInContext(
  state: GameState,
  card: Card,
  mode: PlayModeKind,
): boolean {
  const underAttack = state.pendingDraw > 0;
  const covering = state.mustCover;

  if (covering) {
    // Top is an uncovered 8. Legal covers: same suit as the 8, another 8,
    // any spade (as wild), a joker, or A♠.
    const eightSuit = isStandard(topCard(state)) ? (topCard(state) as any).suit : null;
    if (isJoker(card)) return mode === 'wild';
    if (isAceOfSpades(card)) return mode === 'ace-super';
    if (isSpade(card)) {
      if (mode === 'wild') return true;
      // spade as itself only covers if the 8 is a spade, or this spade is an 8
      return isStandard(card) && (eightSuit === 'S' || card.rank === '8');
    }
    if (isStandard(card)) {
      return mode === 'normal' && (card.suit === eightSuit || card.rank === '8');
    }
    return false;
  }

  if (underAttack) {
    // Must address the stack: stack (2/3/joker), bounce (K), or cancel (spade/A♠).
    if (isJoker(card)) return mode === 'wild'; // stacks +5
    if (isAceOfSpades(card)) return mode === 'ace-super'; // cancel
    if (isSpade(card)) {
      if (mode === 'wild') return true; // cancel
      // spade-as-itself only if it's a counter by rank: 2, 3 (stack) or K (bounce)
      return isStandard(card) && ['2', '3', 'K'].includes(card.rank);
    }
    if (isStandard(card)) {
      if (['2', '3'].includes(card.rank)) {
        return !state.rules.stackRequiresMatch || matchesTop(state, card);
      }
      if (card.rank === 'K') return true; // bounce
      return false;
    }
    return false;
  }

  // Normal turn.
  if (isJoker(card)) return mode === 'wild';
  if (isAceOfSpades(card)) return mode === 'ace-super';
  if (isSpade(card)) return mode === 'normal' || mode === 'wild';
  return mode === 'normal' && matchesTop(state, card);
}

/** All the ways the current player can play, for UI hints and bots. */
export function getLegalPlays(state: GameState, playerId: string): PlayableOption[] {
  const player = playerById(state, playerId);
  if (!player || state.phase !== 'playing') return [];
  if (state.players[state.currentPlayerIndex].id !== playerId) return [];

  const options: PlayableOption[] = [];
  for (const card of player.hand) {
    const modes: PlayMode[] = [];
    const candidateModes: PlayModeKind[] = isJoker(card)
      ? ['wild']
      : isAceOfSpades(card)
        ? ['ace-super']
        : isSpade(card)
          ? ['normal', 'wild']
          : ['normal'];
    for (const kind of candidateModes) {
      if (isPlayableInContext(state, card, kind)) {
        modes.push({
          kind,
          needsSuit: kind === 'wild' || kind === 'ace-super',
          canDeclareRank: kind === 'ace-super',
        });
      }
    }
    if (modes.length > 0) options.push({ cardId: card.id, modes });
  }
  return options;
}

function hasNormalPlay(state: GameState, player: PlayerState): boolean {
  // "Playable" for the purpose of the normal-draw loop (no attack / no cover).
  return player.hand.some((c) => matchesTop(state, c));
}

export function drawInfo(
  state: GameState,
  playerId: string,
): { canDraw: boolean; meaning: DrawMeaning | null } {
  const player = playerById(state, playerId);
  if (!player || state.phase !== 'playing') return { canDraw: false, meaning: null };
  if (state.players[state.currentPlayerIndex].id !== playerId)
    return { canDraw: false, meaning: null };

  if (state.mustCover) return { canDraw: true, meaning: 'giveUp' };
  if (state.pendingDraw > 0) return { canDraw: true, meaning: 'eat' };
  if (!state.rules.noVoluntaryDraw) return { canDraw: true, meaning: 'normal' };
  return { canDraw: !hasNormalPlay(state, player), meaning: 'normal' };
}

// ---------------------------------------------------------------------------
// Drawing / reshuffling
// ---------------------------------------------------------------------------

function reshuffleIfNeeded(state: GameState, ev: GameEvent[]): void {
  if (state.drawPile.length > 0) return;
  if (state.discardPile.length <= 1) return; // nothing to recycle
  const top = state.discardPile.pop()!;
  let recycled: Card[];
  [recycled, state.rng] = shuffle(state.discardPile, state.rng);
  state.drawPile = recycled;
  state.discardPile = [top];
  ev.push({ t: 'reshuffled' });
}

/** Draw a single card, reshuffling if the pile is empty. null if truly out. */
function drawOne(state: GameState, ev: GameEvent[]): Card | null {
  if (state.drawPile.length === 0) reshuffleIfNeeded(state, ev);
  return state.drawPile.pop() ?? null;
}

/** Draw exactly n cards into a hand; eliminate the player if they bust. */
function drawN(state: GameState, player: PlayerState, n: number, ev: GameEvent[]): number {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const c = drawOne(state, ev);
    if (!c) break;
    player.hand.push(c);
    drawn++;
  }
  if (player.hand.length >= state.rules.bustLimit && !player.finished) {
    player.eliminated = true;
    ev.push({ t: 'eliminated', playerId: player.id });
  }
  return drawn;
}

// ---------------------------------------------------------------------------
// Turn advancement
// ---------------------------------------------------------------------------

function advanceTurn(state: GameState, extraSkips = 0): void {
  if (activeCount(state) === 0) return;
  const n = state.players.length;
  let idx = state.currentPlayerIndex;
  let steps = 1 + extraSkips;
  // Guard against an all-inactive loop.
  let guard = 0;
  while (steps > 0 && guard < n * 4) {
    idx = (idx + state.direction + n) % n;
    const p = state.players[idx];
    if (!p.finished && !p.eliminated) steps--;
    guard++;
  }
  state.currentPlayerIndex = idx;
}

// ---------------------------------------------------------------------------
// Round end / scoring
// ---------------------------------------------------------------------------

export function computeScores(state: GameState): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const p of state.players) {
    scores[p.id] = p.hand.reduce((sum, c) => sum + penaltyValue(c), 0);
  }
  return scores;
}

function endRound(state: GameState, ev: GameEvent[]): void {
  // A winning final card still fires: let the designated next player eat any
  // pending draw so scoring reflects it.
  if (state.rules.finalCardEffectFires && state.pendingDraw > 0) {
    const victim = state.players[state.currentPlayerIndex];
    if (victim && !victim.finished && !victim.eliminated) {
      drawN(state, victim, state.pendingDraw, ev);
    }
  }
  state.pendingDraw = 0;
  const lastSurvivor = state.players.find((p) => !p.finished && !p.eliminated);
  state.winnerId = state.finishOrder[0] ?? lastSurvivor?.id ?? null;
  state.phase = 'roundOver';
  state.roundScores = computeScores(state);
  ev.push({ t: 'roundOver', winnerId: state.winnerId });
}

function maybeEndRound(state: GameState, ev: GameEvent[]): void {
  if (state.phase === 'roundOver') return;
  if (state.finishOrder.length >= 1 || activeCount(state) <= 1) {
    endRound(state, ev);
  }
}

// ---------------------------------------------------------------------------
// applyMove
// ---------------------------------------------------------------------------

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

export function applyMove(prev: GameState, playerId: string, move: Move): ApplyResult {
  const state: GameState = structuredClone(prev);
  const ev: GameEvent[] = [];

  if (state.phase !== 'playing') throw new Error('The round is over.');
  const player = playerById(state, playerId);
  if (!player) throw new Error(`Unknown player ${playerId}.`);
  if (state.players[state.currentPlayerIndex].id !== playerId) {
    throw new Error('Not your turn.');
  }

  if (move.type === 'draw') {
    applyDraw(state, player, ev);
  } else {
    applyPlay(state, player, move, ev);
  }

  state.turnCount++;
  maybeEndRound(state, ev);
  state.log.push(...ev);
  return { state, events: ev };
}

function applyDraw(state: GameState, player: PlayerState, ev: GameEvent[]): void {
  const { canDraw, meaning } = drawInfo(state, player.id);
  if (!canDraw || !meaning) throw new Error('You cannot draw right now.');

  if (meaning === 'giveUp') {
    // Facing an uncovered 8 you can't (or won't) answer: draw 1, 8 stays.
    drawN(state, player, 1, ev);
    ev.push({ t: 'drew', playerId: player.id, count: 1, reason: 'giveUp' });
    if (!player.eliminated) advanceTurn(state); // mustCover stays true
    return;
  }

  if (meaning === 'eat') {
    const n = state.pendingDraw;
    state.pendingDraw = 0;
    drawN(state, player, n, ev);
    ev.push({ t: 'drew', playerId: player.id, count: n, reason: 'eat' });
    advanceTurn(state);
    return;
  }

  // Normal draw: one at a time until a playable card appears or you bust.
  let count = 0;
  for (;;) {
    const c = drawOne(state, ev);
    if (!c) break; // deck exhausted
    player.hand.push(c);
    count++;
    const playable = hasNormalPlay(state, player);
    if (player.hand.length >= state.rules.bustLimit) {
      if (playable && state.rules.playablePardonsBust) break; // survives, must play
      player.eliminated = true;
      ev.push({ t: 'eliminated', playerId: player.id });
      break;
    }
    if (playable) break; // survives, must now play
  }
  if (count > 0) ev.push({ t: 'drew', playerId: player.id, count, reason: 'normal' });

  // If the player survived and now has a playable card, the turn stays with
  // them (they must play). Otherwise (busted, or deck empty & stuck) pass on.
  if (player.eliminated || !hasNormalPlay(state, player)) {
    advanceTurn(state);
  }
}

function applyPlay(
  state: GameState,
  player: PlayerState,
  move: Extract<Move, { type: 'play' }>,
  ev: GameEvent[],
): void {
  const idx = player.hand.findIndex((c) => c.id === move.cardId);
  if (idx === -1) throw new Error('You do not hold that card.');
  const card = player.hand[idx];
  const mode = effectiveMode(card, move.asWild);

  if (!isPlayableInContext(state, card, mode)) {
    throw new Error('That card cannot be played right now.');
  }
  // Validate declared suit where required.
  const needsSuit =
    mode === 'wild' ||
    (mode === 'ace-super' && !(state.pendingDraw > 0 && move.declaredSuit == null));
  if (needsSuit && !move.declaredSuit) {
    throw new Error('You must declare a suit.');
  }

  const underAttack = state.pendingDraw > 0;
  const wasCovering = state.mustCover;

  // Place the card.
  player.hand.splice(idx, 1);
  state.discardPile.push(card);
  state.mustCover = false;
  state.requiredSuit = null;
  state.requiredRank = null;
  ev.push({
    t: 'played',
    playerId: player.id,
    card,
    asWild: mode !== 'normal',
    suit: move.declaredSuit,
    rank: move.declaredRank,
  });

  let extraSkips = 0;
  let holdTurn = false; // true when the same player must now cover an 8

  if (isJoker(card)) {
    state.pendingDraw += 5;
    state.requiredSuit = move.declaredSuit!;
    ev.push({ t: 'stackPassed', playerId: player.id, total: state.pendingDraw });
  } else if (mode === 'wild') {
    // Spade played as a wild: change suit, suppress rank effect. Cancels a stack.
    state.requiredSuit = move.declaredSuit!;
    if (underAttack) {
      state.pendingDraw = 0;
      ev.push({ t: 'canceled', playerId: player.id });
    }
  } else if (isAceOfSpades(card)) {
    if (underAttack && move.declaredSuit == null) {
      state.pendingDraw = 0;
      ev.push({ t: 'canceled', playerId: player.id });
    } else {
      if (underAttack) {
        state.pendingDraw = 0;
        ev.push({ t: 'canceled', playerId: player.id });
      }
      state.requiredSuit = move.declaredSuit ?? null;
      state.requiredRank = move.declaredRank ?? null;
    }
  } else if (isStandard(card)) {
    switch (card.rank) {
      case '2':
        state.pendingDraw += 2;
        ev.push({ t: 'stackPassed', playerId: player.id, total: state.pendingDraw });
        break;
      case '3':
        state.pendingDraw += 3;
        ev.push({ t: 'stackPassed', playerId: player.id, total: state.pendingDraw });
        break;
      case '8':
        state.mustCover = true;
        holdTurn = true;
        ev.push({ t: 'mustCover', playerId: player.id });
        break;
      case 'J':
        extraSkips = 1;
        ev.push({ t: 'skipped', playerId: player.id });
        break;
      case 'K':
        state.direction = (state.direction * -1) as 1 | -1;
        ev.push({ t: 'reversed', playerId: player.id });
        if (underAttack) {
          ev.push({ t: 'bounced', playerId: player.id, total: state.pendingDraw });
        } else if (activeCount(state) <= 2 && state.rules.kingHeadsUpSkips) {
          extraSkips = 1;
        }
        break;
      default:
        break; // 4-7, 9, 10, Q, non-spade A: plain
    }
  }

  // An 8 played as your last card can't be covered → forced give-up (draw 1).
  if (holdTurn && player.hand.length === 0) {
    drawN(state, player, 1, ev);
    ev.push({ t: 'drew', playerId: player.id, count: 1, reason: 'giveUp' });
    holdTurn = false;
    if (!player.eliminated) advanceTurn(state);
    return;
  }

  // If this play answered a previously-uncovered 8, note it.
  if (wasCovering && !holdTurn) {
    ev.push({ t: 'covered', playerId: player.id });
  }

  // Niko Kadi: reaching one card without announcing.
  if (state.rules.nikoKadi && player.hand.length === 1 && !move.announceKadi) {
    drawN(state, player, state.rules.nikoKadiPenalty, ev);
    ev.push({ t: 'kadiMissed', playerId: player.id, penalty: state.rules.nikoKadiPenalty });
  }

  // Win check (can't win while still owing a cover).
  if (player.hand.length === 0 && !holdTurn) {
    player.finished = true;
    state.finishOrder.push(player.id);
    ev.push({ t: 'finished', playerId: player.id });
  }

  if (!holdTurn) advanceTurn(state, extraSkips);
}

// ---------------------------------------------------------------------------
// Views (redaction for the network)
// ---------------------------------------------------------------------------

export function viewFor(state: GameState, playerId: string): PlayerView {
  const you = playerById(state, playerId);
  const players: OpponentView[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    handCount: p.hand.length,
    eliminated: p.eliminated,
    finished: p.finished,
  }));
  const yourTurn =
    state.phase === 'playing' &&
    state.players[state.currentPlayerIndex]?.id === playerId;
  const { canDraw, meaning } = drawInfo(state, playerId);

  return {
    you: playerId,
    yourHand: you ? you.hand.slice() : [],
    players,
    currentPlayerIndex: state.currentPlayerIndex,
    direction: state.direction,
    topCard: state.discardPile.length ? topCard(state) : null,
    requiredSuit: state.requiredSuit,
    requiredRank: state.requiredRank,
    pendingDraw: state.pendingDraw,
    mustCover: state.mustCover,
    drawPileCount: state.drawPile.length,
    phase: state.phase,
    winnerId: state.winnerId,
    finishOrder: state.finishOrder.slice(),
    roundScores: state.roundScores,
    yourTurn,
    legalPlays: yourTurn ? getLegalPlays(state, playerId) : [],
    canDraw,
    drawMeaning: meaning,
    log: state.log,
  };
}
