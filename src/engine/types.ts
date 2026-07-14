import type { Card, Suit, Rank } from './cards';
import type { RuleConfig } from './rules';

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  hand: Card[];
  /** Busted out (hit the bust limit). Cards are kept for scoring. */
  eliminated: boolean;
  /** Emptied their hand. */
  finished: boolean;
}

export interface GameState {
  players: PlayerState[];
  drawPile: Card[]; // top of pile = last element
  discardPile: Card[]; // top of pile = last element
  currentPlayerIndex: number;
  direction: 1 | -1;

  /** Suit that play must continue in, when a wild overrode the top card's suit. */
  requiredSuit: Suit | null;
  /** Rank that play must continue in, when A♠ declared one. */
  requiredRank: Rank | null;

  /** Accumulated forced draw from a 2/3/joker stack aimed at the current player. */
  pendingDraw: number;
  /** True when the top card is an uncovered 8 that must be answered. */
  mustCover: boolean;

  rules: RuleConfig;
  rng: number;

  phase: 'playing' | 'roundOver';
  finishOrder: string[]; // player ids, in the order they emptied their hands
  winnerId: string | null;
  /** Penalty points this round, by player id (present once the round is over). */
  roundScores: Record<string, number> | null;

  turnCount: number;
  log: GameEvent[];
}

export type Move =
  | {
      type: 'play';
      cardId: string;
      /** For a spade: play it as a wild (declare a suit) rather than as itself. */
      asWild?: boolean;
      declaredSuit?: Suit;
      declaredRank?: Rank;
      /** Set when this play brings you to one card and Niko Kadi is on. */
      announceKadi?: boolean;
    }
  | { type: 'draw' };

// --- Legal-move description (for UI hints and bots) ---

export type PlayModeKind = 'normal' | 'wild' | 'ace-super';

export interface PlayMode {
  kind: PlayModeKind;
  /** Caller must supply declaredSuit. */
  needsSuit: boolean;
  /** Caller may optionally supply declaredRank (A♠ only). */
  canDeclareRank: boolean;
}

export interface PlayableOption {
  cardId: string;
  modes: PlayMode[];
}

export type DrawMeaning = 'normal' | 'eat' | 'giveUp';

// --- Events (append-only log the UI renders) ---

export type GameEvent =
  | { t: 'played'; playerId: string; card: Card; asWild?: boolean; suit?: Suit; rank?: Rank }
  | { t: 'drew'; playerId: string; count: number; reason: DrawMeaning }
  | { t: 'stackPassed'; playerId: string; total: number }
  | { t: 'bounced'; playerId: string; total: number }
  | { t: 'canceled'; playerId: string }
  | { t: 'skipped'; playerId: string }
  | { t: 'reversed'; playerId: string }
  | { t: 'mustCover'; playerId: string }
  | { t: 'covered'; playerId: string }
  | { t: 'reshuffled' }
  | { t: 'kadiMissed'; playerId: string; penalty: number }
  | { t: 'eliminated'; playerId: string }
  | { t: 'finished'; playerId: string }
  | { t: 'roundOver'; winnerId: string | null };

/** Redacted per-player projection — safe to send over the wire. */
export interface OpponentView {
  id: string;
  name: string;
  isBot: boolean;
  handCount: number;
  eliminated: boolean;
  finished: boolean;
}

export interface PlayerView {
  you: string;
  yourHand: Card[];
  players: OpponentView[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  topCard: Card | null;
  requiredSuit: Suit | null;
  requiredRank: Rank | null;
  pendingDraw: number;
  mustCover: boolean;
  drawPileCount: number;
  phase: 'playing' | 'roundOver';
  winnerId: string | null;
  finishOrder: string[];
  roundScores: Record<string, number> | null;
  yourTurn: boolean;
  legalPlays: PlayableOption[];
  canDraw: boolean;
  drawMeaning: DrawMeaning | null;
  log: GameEvent[];
}
