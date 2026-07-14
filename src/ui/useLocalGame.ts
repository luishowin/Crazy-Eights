import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGame, applyMove, viewFor } from '../engine/engine';
import { chooseBotMove, type BotLevel } from '../engine/bot';
import { randomSeed } from '../engine/rng';
import type { GameState, Move, PlayerView } from '../engine/types';
import type { RuleConfig } from '../engine/rules';

export const HUMAN_ID = 'you';
export const BOT_THINK_MS = 750;

export interface LocalConfig {
  humanName: string;
  bots: { name: string; level: BotLevel }[];
  rules: Partial<RuleConfig>;
  targetScore: number;
}

export interface MatchScores {
  totals: Record<string, number>;
  round: number;
}

function buildGame(config: LocalConfig, seed: number): GameState {
  const players = [
    { id: HUMAN_ID, name: config.humanName || 'You', isBot: false },
    ...config.bots.map((b, i) => ({ id: `bot${i + 1}`, name: b.name, isBot: true })),
  ];
  return createGame({ players, rules: config.rules, seed });
}

export function useLocalGame(config: LocalConfig) {
  const [state, setState] = useState<GameState>(() => buildGame(config, randomSeed()));
  const [match, setMatch] = useState<MatchScores>({ totals: {}, round: 1 });
  const botLevels = useMemo(() => {
    const m: Record<string, BotLevel> = {};
    config.bots.forEach((b, i) => (m[`bot${i + 1}`] = b.level));
    return m;
  }, [config.bots]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const view: PlayerView = useMemo(() => viewFor(state, HUMAN_ID), [state]);

  // Drive bot turns automatically.
  useEffect(() => {
    if (state.phase !== 'playing') return;
    const current = state.players[state.currentPlayerIndex];
    if (!current || !current.isBot) return;
    const timer = setTimeout(() => {
      const s = stateRef.current;
      if (s.phase !== 'playing') return;
      const cur = s.players[s.currentPlayerIndex];
      if (!cur || !cur.isBot) return;
      const move = chooseBotMove(s, cur.id, botLevels[cur.id] ?? 'normal');
      try {
        setState(applyMove(s, cur.id, move).state);
      } catch {
        // Defensive: if a bot somehow produced an illegal move, draw instead.
        setState(applyMove(s, cur.id, { type: 'draw' }).state);
      }
    }, BOT_THINK_MS);
    return () => clearTimeout(timer);
  }, [state, botLevels]);

  const humanMove = useCallback((move: Move) => {
    const s = stateRef.current;
    if (s.phase !== 'playing') return;
    if (s.players[s.currentPlayerIndex].id !== HUMAN_ID) return;
    setState(applyMove(s, HUMAN_ID, move).state);
  }, []);

  const nextRound = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== 'roundOver' || !s.roundScores) {
      setState(buildGame(config, randomSeed()));
      return;
    }
    const scores = s.roundScores;
    setMatch((m) => {
      const totals = { ...m.totals };
      for (const p of s.players) totals[p.id] = (totals[p.id] ?? 0) + (scores[p.id] ?? 0);
      return { totals, round: m.round + 1 };
    });
    setState(buildGame(config, randomSeed()));
  }, [config]);

  const newMatch = useCallback(() => {
    setMatch({ totals: {}, round: 1 });
    setState(buildGame(config, randomSeed()));
  }, [config]);

  return { state, view, match, humanMove, nextRound, newMatch };
}
