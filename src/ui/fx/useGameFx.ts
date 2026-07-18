// Single dispatcher that turns per-move engine events into animations and
// sounds. Consumes the view's capped log via eventSeq diffing (StrictMode-safe)
// so local and online play behave identically. Purely decorative: state is
// always rendered instantly; this layer only decorates the transition.

import { useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import type { PlayerView, GameEvent } from '../../engine/types';
import { drawValue } from '../../engine/cards';
import { fx } from './FxLayer';
import { rectOf, prefersReducedMotion } from './anchors';
import { sfx } from '../sound';

export interface GameFx {
  /** Top discard card is mid-flight; render it hidden. */
  hiddenDiscard: boolean;
  /** New-round deal-in is running (apply the 'dealing' class to the hand). */
  dealing: boolean;
  /** Rising-edge your-turn flash (apply to the handzone). */
  turnFlash: boolean;
  /** Changes when a play lands — key the discard card on it for the settle pop. */
  settleKey: number;
}

export function useGameFx(
  view: PlayerView,
  playRectRef: MutableRefObject<DOMRect | null>,
): GameFx {
  const [hiddenDiscard, setHiddenDiscard] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [turnFlash, setTurnFlash] = useState(false);
  const [settleKey, setSettleKey] = useState(0);

  const seenSeq = useRef(-1);
  const prevHandIds = useRef<Set<string>>(new Set());
  const prevYourTurn = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup any pending timers on unmount.
  useLayoutEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  useLayoutEffect(() => {
    const later = (ms: number, f: () => void) => {
      timers.current.push(setTimeout(f, ms));
    };
    const currentIds = new Set(view.yourHand.map((c) => c.id));
    const runDealIn = () => {
      if (prefersReducedMotion()) return;
      setDealing(true);
      for (let i = 0; i < Math.min(view.yourHand.length, 7); i++) later(60 * i, () => sfx.deal());
      later(1200, () => setDealing(false));
    };

    // First mount: never replay history — except a truly fresh game (seq 0),
    // which gets the deal-in.
    if (seenSeq.current === -1) {
      seenSeq.current = view.eventSeq;
      prevHandIds.current = currentIds;
      prevYourTurn.current = view.yourTurn;
      if (view.eventSeq === 0 && view.phase === 'playing') runDealIn();
      return;
    }
    // Sequence went backwards ⇒ a new round/game replaced the state.
    if (view.eventSeq < seenSeq.current) {
      seenSeq.current = view.eventSeq;
      prevHandIds.current = currentIds;
      prevYourTurn.current = view.yourTurn;
      if (view.phase === 'playing') runDealIn();
      return;
    }

    const freshCount = view.eventSeq - seenSeq.current;
    seenSeq.current = view.eventSeq;
    const fresh: GameEvent[] =
      freshCount > 0 ? view.log.slice(Math.max(0, view.log.length - freshCount)) : [];

    for (const e of fresh) dispatchEvent(e);

    // Your-turn rising edge.
    if (view.yourTurn && !prevYourTurn.current && view.phase === 'playing') {
      sfx.yourTurn();
      setTurnFlash(true);
      later(750, () => setTurnFlash(false));
    }
    prevYourTurn.current = view.yourTurn;
    prevHandIds.current = currentIds;

    function dispatchEvent(e: GameEvent): void {
      switch (e.t) {
        case 'played': {
          sfx.play();
          const to = rectOf('discard');
          const from =
            e.playerId === view.you
              ? playRectRef.current
              : rectOf(`seat:${e.playerId}`);
          playRectRef.current = null;
          if (from && to) {
            setHiddenDiscard(true);
            fx.fly({
              card: e.card,
              from,
              to,
              onDone: () => {
                setHiddenDiscard(false);
                setSettleKey((k) => k + 1);
              },
            });
            // Safety: never leave the discard hidden.
            later(900, () => setHiddenDiscard(false));
          } else {
            setSettleKey((k) => k + 1);
          }
          if (drawValue(e.card) > 0) sfx.attack();
          break;
        }
        case 'drew': {
          sfx.draw();
          const from = rectOf('draw');
          if (!from) break;
          if (e.playerId === view.you) {
            const fresh = view.yourHand.filter((c) => !prevHandIds.current.has(c.id));
            fresh.slice(0, 6).forEach((c, i) => {
              const to = rectOf(`hand:${c.id}`);
              if (to) fx.fly({ from, to, delayMs: i * 70 });
            });
          } else {
            const to = rectOf(`seat:${e.playerId}`);
            if (to) {
              for (let i = 0; i < Math.min(e.count, 4); i++) {
                fx.fly({ from, to, delayMs: i * 70, durMs: 280 });
              }
            }
          }
          break;
        }
        case 'stackPassed': {
          const at = rectOf('discard');
          if (at) fx.pop({ at, text: `+${e.total}` });
          break;
        }
        case 'bounced': {
          sfx.reverse();
          const at = rectOf('discard');
          if (at) fx.pop({ at, text: `↩ +${e.total}` });
          break;
        }
        case 'canceled': {
          sfx.select();
          const at = rectOf('discard');
          if (at) fx.pop({ at, text: '✕' });
          break;
        }
        case 'reversed':
          sfx.reverse();
          break;
        case 'kadi': {
          sfx.attack();
          const at = rectOf(`seat:${e.playerId}`);
          if (at) fx.pop({ at, text: 'KADI!' });
          break;
        }
        case 'kadiMissed':
        case 'eliminated':
          sfx.error();
          break;
        case 'reshuffled':
          sfx.draw();
          break;
        case 'roundOver':
          sfx.win();
          break;
        default:
          break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  return { hiddenDiscard, dealing, turnFlash, settleKey };
}
