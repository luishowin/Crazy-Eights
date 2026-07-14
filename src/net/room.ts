// Host-authoritative P2P room controller.
//
// The host runs the engine and holds all hidden state; guests are thin clients
// that send intents and render the redacted view the host sends back. The same
// GameScreen renders both sides because both consume a PlayerView.

import Peer, { type DataConnection } from 'peerjs';
import { createGame, applyMove, viewFor } from '../engine/engine';
import { chooseBotMove, type BotLevel } from '../engine/bot';
import { randomSeed } from '../engine/rng';
import type { GameState, Move, PlayerView } from '../engine/types';
import type { RuleConfig } from '../engine/rules';
import {
  type ClientMsg,
  type HostMsg,
  type LobbyPlayer,
  type MatchInfo,
  peerIdForCode,
} from './protocol';

export type RoomStatus = 'connecting' | 'lobby' | 'playing' | 'error' | 'ended';

export interface RoomSnapshot {
  status: RoomStatus;
  error: string | null;
  code: string;
  isHost: boolean;
  youAre: string | null;
  lobbyPlayers: LobbyPlayer[];
  rules: Partial<RuleConfig>;
  view: PlayerView | null;
  match: MatchInfo | null;
}

export interface RoomOptions {
  role: 'host' | 'guest';
  name: string;
  code: string;
  rules?: Partial<RuleConfig>;
  targetScore?: number;
  onUpdate: (snap: RoomSnapshot) => void;
}

const BOT_NAMES = ['Otieno', 'Wanjiru', 'Kamau', 'Achieng', 'Mwangi'];
const AUTO_MOVE_MS = 800;
const CONNECT_TIMEOUT_MS = 10000;

export class Room {
  readonly isHost: boolean;
  private readonly onUpdate: (s: RoomSnapshot) => void;
  private readonly selfName: string;
  code: string;

  private peer: Peer | null = null;
  private status: RoomStatus = 'connecting';
  private error: string | null = null;
  private youAre: string | null = null;

  // Host state
  private players: LobbyPlayer[] = [];
  private rules: Partial<RuleConfig>;
  private targetScore: number;
  private game: GameState | null = null;
  private match: MatchInfo;
  private started = false;
  private connByPlayer = new Map<string, DataConnection>();
  private playerByConn = new Map<string, string>();
  private botLevels = new Map<string, BotLevel>();
  private guestCounter = 0;
  private botCounter = 0;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;

  // Guest state
  private hostConn: DataConnection | null = null;
  private view: PlayerView | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: RoomOptions) {
    this.isHost = opts.role === 'host';
    this.onUpdate = opts.onUpdate;
    // Raw name (may be empty). Guests send it as-is so the host can assign a
    // unique "Player N" when blank; the host falls back to "Host" for itself.
    this.selfName = (opts.name ?? '').trim();
    this.code = opts.code.toUpperCase();
    this.rules = opts.rules ?? {};
    this.targetScore = opts.targetScore ?? 100;
    this.match = { totals: {}, round: 1, targetScore: this.targetScore };

    if (this.isHost) {
      this.players = [
        { id: 'host', name: this.selfName || 'Host', isBot: false, connected: true, isHost: true },
      ];
      this.youAre = 'host';
      this.createHostPeer(0);
    } else {
      this.createGuestPeer();
    }
  }

  // ---------------------------------------------------------------- shared

  private emit() {
    this.onUpdate({
      status: this.status,
      error: this.error,
      code: this.code,
      isHost: this.isHost,
      youAre: this.youAre,
      lobbyPlayers: this.players,
      rules: this.rules,
      view: this.isHost ? (this.game ? viewFor(this.game, 'host') : null) : this.view,
      match: this.match,
    });
  }

  destroy() {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.peer = null;
  }

  // ---------------------------------------------------------------- host

  private createHostPeer(attempt: number) {
    const peer = new Peer(peerIdForCode(this.code));
    this.peer = peer;
    peer.on('open', () => {
      this.status = 'lobby';
      this.emit();
    });
    peer.on('connection', (conn) => this.onGuestConn(conn));
    peer.on('error', (e: { type?: string; message?: string }) => {
      if (e.type === 'unavailable-id' && attempt < 3) {
        try {
          peer.destroy();
        } catch {
          /* ignore */
        }
        setTimeout(() => this.createHostPeer(attempt + 1), 500);
        return;
      }
      this.status = 'error';
      this.error = `Could not open room (${e.type ?? 'error'})`;
      this.emit();
    });
  }

  private onGuestConn(conn: DataConnection) {
    conn.on('data', (d) => this.onClientMsg(conn, d as ClientMsg));
    conn.on('close', () => this.onGuestClose(conn));
    conn.on('error', () => this.onGuestClose(conn));
  }

  private onClientMsg(conn: DataConnection, msg: ClientMsg) {
    switch (msg.k) {
      case 'hello':
        this.handleHello(conn, msg.name, msg.playerId);
        break;
      case 'move': {
        const pid = this.playerByConn.get(conn.peer);
        if (pid && this.game) {
          try {
            this.commit(applyMove(this.game, pid, msg.move).state);
          } catch (e) {
            this.sendTo(conn, { k: 'error', message: (e as Error).message });
          }
        }
        break;
      }
      case 'nextRound':
        this.doNextRound();
        break;
      case 'newMatch':
        this.doNewMatch();
        break;
    }
  }

  private handleHello(conn: DataConnection, name: string, wantId?: string) {
    const existing = wantId ? this.players.find((p) => p.id === wantId && !p.isBot) : undefined;

    if (this.started) {
      if (existing) {
        // Reconnect to an existing seat.
        existing.connected = true;
        if (name) existing.name = name;
        this.bindConn(conn, existing.id);
        this.sendLobbyTo(conn);
        if (this.game) this.sendTo(conn, { k: 'view', view: viewFor(this.game, existing.id), match: this.match });
        this.scheduleAuto();
      } else {
        this.sendTo(conn, { k: 'error', message: 'Game already in progress.' });
        setTimeout(() => conn.close(), 200);
      }
      return;
    }

    let id: string;
    if (existing) {
      id = existing.id;
      existing.connected = true;
      if (name) existing.name = name;
    } else {
      if (this.players.length >= 6) {
        this.sendTo(conn, { k: 'error', message: 'Room is full (6 players).' });
        setTimeout(() => conn.close(), 200);
        return;
      }
      id = `g${++this.guestCounter}`;
      this.players.push({ id, name: name || `Player ${this.guestCounter}`, isBot: false, connected: true, isHost: false });
    }
    this.bindConn(conn, id);
    this.broadcastLobby();
  }

  private bindConn(conn: DataConnection, playerId: string) {
    this.connByPlayer.set(playerId, conn);
    this.playerByConn.set(conn.peer, playerId);
  }

  private onGuestClose(conn: DataConnection) {
    const pid = this.playerByConn.get(conn.peer);
    if (!pid) return;
    this.playerByConn.delete(conn.peer);
    const p = this.players.find((x) => x.id === pid);
    if (p) p.connected = false;
    if (this.connByPlayer.get(pid) === conn) this.connByPlayer.delete(pid);
    if (this.started) {
      // Keep their seat (they may rejoin); auto-play so the game doesn't stall.
      this.scheduleAuto();
      this.emit();
    } else {
      // Drop from the lobby entirely.
      this.players = this.players.filter((x) => x.id !== pid);
      this.broadcastLobby();
    }
  }

  private sendTo(conn: DataConnection, msg: HostMsg) {
    if (conn.open) conn.send(msg);
  }

  private sendLobbyTo(conn: DataConnection) {
    const pid = this.playerByConn.get(conn.peer);
    this.sendTo(conn, {
      k: 'lobby',
      youAre: pid ?? '',
      players: this.players,
      rules: this.rules,
      code: this.code,
      started: this.started,
    });
  }

  private broadcastLobby() {
    for (const [, conn] of this.connByPlayer) this.sendLobbyTo(conn);
    this.emit();
  }

  private commit(state: GameState) {
    this.game = state;
    this.status = 'playing';
    for (const [pid, conn] of this.connByPlayer) {
      if (conn.open) conn.send({ k: 'view', view: viewFor(state, pid), match: this.match });
    }
    this.emit();
    this.scheduleAuto();
  }

  private scheduleAuto() {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    const g = this.game;
    if (!g || g.phase !== 'playing') return;
    const cur = g.players[g.currentPlayerIndex];
    const seat = this.players.find((p) => p.id === cur.id);
    const auto = cur.isBot || (seat != null && !seat.connected);
    if (!auto) return;
    this.autoTimer = setTimeout(() => {
      if (!this.game || this.game.phase !== 'playing') return;
      const id = this.game.players[this.game.currentPlayerIndex].id;
      const level = this.botLevels.get(id) ?? 'normal';
      try {
        this.commit(applyMove(this.game, id, chooseBotMove(this.game, id, level)).state);
      } catch {
        this.commit(applyMove(this.game, id, { type: 'draw' }).state);
      }
    }, AUTO_MOVE_MS);
  }

  private doNextRound() {
    if (!this.isHost || !this.game) return;
    if (this.game.phase === 'roundOver' && this.game.roundScores) {
      const scores = this.game.roundScores;
      for (const p of this.game.players) {
        this.match.totals[p.id] = (this.match.totals[p.id] ?? 0) + (scores[p.id] ?? 0);
      }
      this.match = { ...this.match, round: this.match.round + 1 };
    }
    this.startNewGame();
  }

  private doNewMatch() {
    if (!this.isHost) return;
    this.match = { totals: {}, round: 1, targetScore: this.targetScore };
    this.startNewGame();
  }

  private startNewGame() {
    this.game = createGame({
      players: this.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })),
      rules: this.rules,
      seed: randomSeed(),
    });
    this.commit(this.game);
  }

  // ------------------------------------------------------------ host actions

  addBot() {
    if (!this.isHost || this.started || this.players.length >= 6) return;
    const id = `bot${++this.botCounter}`;
    const name = BOT_NAMES[(this.botCounter - 1) % BOT_NAMES.length];
    this.players.push({ id, name, isBot: true, connected: true, isHost: false });
    this.botLevels.set(id, 'normal');
    this.broadcastLobby();
  }

  removeBot(id: string) {
    if (!this.isHost || this.started) return;
    const p = this.players.find((x) => x.id === id);
    if (!p || !p.isBot) return;
    this.players = this.players.filter((x) => x.id !== id);
    this.broadcastLobby();
  }

  setRule<K extends keyof RuleConfig>(key: K, value: RuleConfig[K]) {
    if (!this.isHost || this.started) return;
    this.rules = { ...this.rules, [key]: value };
    this.broadcastLobby();
  }

  startGame() {
    if (!this.isHost || this.started) return;
    if (this.players.length < 2) return;
    this.started = true;
    this.startNewGame();
  }

  // ---------------------------------------------------------------- guest

  private savedIdKey() {
    return `vce8-${this.code}-pid`;
  }

  private createGuestPeer() {
    const peer = new Peer();
    this.peer = peer;
    peer.on('open', () => this.connectToHost());
    peer.on('error', (e: { type?: string }) => {
      if (this.status === 'playing' || this.status === 'lobby') return;
      this.status = 'error';
      this.error = e.type === 'peer-unavailable' ? 'Room not found — check the code.' : `Connection error (${e.type ?? 'error'})`;
      this.emit();
    });
  }

  private connectToHost() {
    if (!this.peer) return;
    let savedId: string | undefined;
    try {
      savedId = sessionStorage.getItem(this.savedIdKey()) ?? undefined;
    } catch {
      /* ignore */
    }
    const conn = this.peer.connect(peerIdForCode(this.code), { reliable: true });
    this.hostConn = conn;
    conn.on('open', () => {
      conn.send({ k: 'hello', name: this.selfName, playerId: savedId } satisfies ClientMsg);
    });
    conn.on('data', (d) => this.onHostMsg(d as HostMsg));
    conn.on('close', () => {
      if (this.status === 'lobby' || this.status === 'playing') {
        this.status = 'ended';
        this.error = 'Disconnected from the host.';
        this.emit();
      }
    });
    conn.on('error', () => {});

    this.connectTimer = setTimeout(() => {
      if (this.status === 'connecting') {
        this.status = 'error';
        this.error = 'Could not reach the room. Is the code right?';
        this.emit();
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private onHostMsg(msg: HostMsg) {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    switch (msg.k) {
      case 'lobby':
        this.youAre = msg.youAre;
        this.players = msg.players;
        this.rules = msg.rules;
        this.code = msg.code;
        try {
          sessionStorage.setItem(this.savedIdKey(), msg.youAre);
        } catch {
          /* ignore */
        }
        if (!msg.started) this.status = 'lobby';
        this.emit();
        break;
      case 'view':
        this.view = msg.view;
        this.match = msg.match;
        this.status = 'playing';
        this.emit();
        break;
      case 'error':
        // Non-fatal (e.g. a rejected move). The UI only offers legal moves,
        // so this is informational; surface via console for debugging.
        console.warn('[room]', msg.message);
        break;
      case 'ended':
        this.status = 'ended';
        this.error = msg.reason;
        this.emit();
        break;
    }
  }

  // ----------------------------------------------------------- game actions

  move(m: Move) {
    if (this.isHost) {
      if (!this.game) return;
      try {
        this.commit(applyMove(this.game, 'host', m).state);
      } catch {
        /* host UI only surfaces legal moves */
      }
    } else if (this.hostConn?.open) {
      this.hostConn.send({ k: 'move', move: m } satisfies ClientMsg);
    }
  }

  nextRound() {
    if (this.isHost) this.doNextRound();
    else this.hostConn?.open && this.hostConn.send({ k: 'nextRound' } satisfies ClientMsg);
  }

  newMatch() {
    if (this.isHost) this.doNewMatch();
    else this.hostConn?.open && this.hostConn.send({ k: 'newMatch' } satisfies ClientMsg);
  }
}
