// Wire protocol for host-authoritative P2P play over PeerJS.
//
// One player's browser is the host: it runs the engine and is the single source
// of truth. Guests send *intents* (moves / requests); the host validates them
// with the engine and broadcasts each player a redacted view. A guest can never
// see another player's hand, and an illegal intent is simply rejected.

import type { Move, PlayerView } from '../engine/types';
import type { RuleConfig } from '../engine/rules';

/** Peer-id namespace so our room codes don't collide with other PeerJS apps. */
export const PEER_PREFIX = 'vce8-';

/** Human-facing room code alphabet (no ambiguous 0/O/1/I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode(len = 5): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}
export const peerIdForCode = (code: string) => PEER_PREFIX + code.toUpperCase();

export interface LobbyPlayer {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface MatchInfo {
  totals: Record<string, number>;
  round: number;
  targetScore: number;
}

// Guest -> Host
export type ClientMsg =
  | { k: 'hello'; name: string; playerId?: string }
  | { k: 'move'; move: Move }
  | { k: 'nextRound' }
  | { k: 'newMatch' };

// Host -> Guest
export type HostMsg =
  | {
      k: 'lobby';
      youAre: string;
      players: LobbyPlayer[];
      rules: Partial<RuleConfig>;
      code: string;
      started: boolean;
    }
  | { k: 'view'; view: PlayerView; match: MatchInfo }
  | { k: 'error'; message: string }
  | { k: 'ended'; reason: string };
