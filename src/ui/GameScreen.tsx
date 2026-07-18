import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  type Card,
  SUIT_SYMBOL,
  isRedSuit,
  isJoker,
  cardLabel,
  drawValue,
} from '../engine/cards';
import type { GameEvent, Move, PlayerView } from '../engine/types';
import { CardFace, CardBack } from './Card';
import { PlayDialog } from './PlayDialog';
import { FxLayer } from './fx/FxLayer';
import { useGameFx } from './fx/useGameFx';
import { registerAnchor, rectOf, prefersReducedMotion } from './fx/anchors';
import { sfx, isMuted, setMuted } from './sound';

export interface MatchView {
  totals: Record<string, number>;
  round: number;
}

interface Props {
  view: PlayerView;
  match: MatchView;
  targetScore: number;
  onMove: (move: Move) => void;
  onNextRound: () => void;
  onNewMatch: () => void;
  onExit: () => void;
  /** In online play, only the host can advance/reset; guests just request. */
  waitingForHost?: boolean;
  /** Transient non-fatal message from the room (e.g. a rejected move). */
  notice?: { id: number; message: string } | null;
}

/** Touch-first devices commit in two taps; pointer devices in one click. */
const TWO_STEP =
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).has('touch') ||
    (window.matchMedia?.('(hover: none)').matches ?? false));

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  text: string;
  error?: boolean;
}

function useToasts(view: PlayerView, notice: Props['notice']) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenSeq = useRef(-1);
  const seenNotice = useRef(-1);
  const nid = useRef(0);

  const nameOf = useMemo(() => {
    const map = new Map(view.players.map((p) => [p.id, p.id === view.you ? 'You' : p.name]));
    return (id: string) => map.get(id) ?? id;
  }, [view.players, view.you]);

  const push = (items: Omit<Toast, 'id'>[]) => {
    if (items.length === 0) return;
    const added = items.map((t) => ({ ...t, id: nid.current++ }));
    setToasts((t) => [...t, ...added].slice(-4));
    setTimeout(() => {
      setToasts((t) => t.filter((x) => !added.some((a) => a.id === x.id)));
    }, 2600);
  };

  useEffect(() => {
    if (seenSeq.current === -1 || view.eventSeq < seenSeq.current) {
      seenSeq.current = view.eventSeq;
      return;
    }
    const freshCount = view.eventSeq - seenSeq.current;
    seenSeq.current = view.eventSeq;
    if (freshCount <= 0) return;
    const fresh = view.log.slice(Math.max(0, view.log.length - freshCount));
    push(
      fresh
        .map((e) => messageFor(e, nameOf))
        .filter((m): m is string => !!m)
        .map((text) => ({ text })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, nameOf]);

  useEffect(() => {
    if (!notice || notice.id === seenNotice.current) return;
    seenNotice.current = notice.id;
    sfx.error();
    push([{ text: notice.message, error: true }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  return toasts;
}

function messageFor(e: GameEvent, nameOf: (id: string) => string): string | null {
  switch (e.t) {
    case 'canceled':
      return `${nameOf(e.playerId)} canceled the stack 🛡️`;
    case 'bounced':
      return `${nameOf(e.playerId)} bounced it back! (+${e.total})`;
    case 'reversed':
      return `🔄 ${nameOf(e.playerId)} reversed play`;
    case 'skipped':
      return `⏭️ ${nameOf(e.playerId)} skipped the next player`;
    case 'mustCover':
      return `${nameOf(e.playerId)} must cover the 8`;
    case 'drew':
      if (e.reason === 'eat') return `${nameOf(e.playerId)} ate ${e.count} cards`;
      if (e.reason === 'giveUp') return `${nameOf(e.playerId)} drew 1`;
      return null;
    case 'kadi':
      return `🎴 ${nameOf(e.playerId)}: "Niko Kadi!"`;
    case 'kadiMissed':
      return `${nameOf(e.playerId)} forgot Niko Kadi! +${e.penalty}`;
    case 'passed':
      return `${nameOf(e.playerId)} passed`;
    case 'stalemate':
      return `🔒 Deadlock — round ends`;
    case 'reshuffled':
      return `♻️ Draw pile reshuffled`;
    case 'eliminated':
      return `💥 ${nameOf(e.playerId)} busted out!`;
    case 'finished':
      return `🏆 ${nameOf(e.playerId)} went out!`;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function DirectionArc({ direction }: { direction: 1 | -1 }) {
  return (
    <div className={`direction ${direction === -1 ? 'rev' : ''}`} key={direction} aria-hidden>
      <svg viewBox="0 0 40 40">
        <path
          d="M 20 6 A 14 14 0 1 1 7.6 26.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path d="M2.5 23.5 L12 27.5 L5 34.5 Z" fill="currentColor" />
      </svg>
    </div>
  );
}

function Seat({
  p,
  displayName,
  current,
}: {
  p: PlayerView['players'][number];
  displayName: string;
  current: boolean;
}) {
  const out = p.eliminated || p.finished;
  const initial = (displayName[0] ?? '?').toUpperCase();
  return (
    <div
      className={`seat ${p.isBot ? 'bot' : ''} ${current ? 'current' : ''} ${out ? 'out' : ''}`}
      ref={registerAnchor(`seat:${p.id}`)}
    >
      {p.onKadi && !out && <span className="kadi-badge">KADI!</span>}
      <div className="avatar">
        {initial}
        <span className="count-chip">{p.handCount}</span>
      </div>
      <div className="name">{displayName}</div>
      <div className="status-tag">
        {p.eliminated ? '💥 out' : p.finished ? '🏆 done' : p.isBot ? 'bot' : ''}
      </div>
    </div>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6.5 9 H3 v6 h3.5 L11 19 Z" fill="currentColor" stroke="none" />
      {muted ? (
        <>
          <line x1="15" y1="9.5" x2="21" y2="14.5" />
          <line x1="21" y1="9.5" x2="15" y2="14.5" />
        </>
      ) : (
        <>
          <path d="M14.5 9.5 a4 4 0 0 1 0 5" />
          <path d="M17 7 a7.5 7.5 0 0 1 0 10" />
        </>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function GameScreen({
  view,
  match,
  targetScore,
  onMove,
  onNextRound,
  onNewMatch,
  onExit,
  waitingForHost = false,
  notice = null,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogCard, setDialogCard] = useState<Card | null>(null);
  const [kadiArmed, setKadiArmed] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [showResults, setShowResults] = useState(false);
  const playRectRef = useRef<DOMRect | null>(null);

  const toasts = useToasts(view, notice);
  const { hiddenDiscard, dealing, turnFlash, settleKey } = useGameFx(view, playRectRef);

  const playable = useMemo(
    () => new Map(view.legalPlays.map((o) => [o.cardId, o])),
    [view.legalPlays],
  );

  const nameOf = (id: string) => {
    const p = view.players.find((x) => x.id === id);
    return p ? (id === view.you ? 'You' : p.name) : id;
  };
  const currentName = nameOf(view.players[view.currentPlayerIndex]?.id ?? '');
  const topCard = view.topCard;
  const kadiRelevant =
    view.rules.nikoKadi && view.phase === 'playing' && view.yourHand.length <= 2;

  // Selection hygiene: drop it the moment the view stops supporting it.
  useEffect(() => {
    if (selectedId && (!view.yourTurn || !playable.has(selectedId))) setSelectedId(null);
  }, [view, selectedId, playable]);
  useEffect(() => {
    if (!kadiRelevant && kadiArmed) setKadiArmed(false);
  }, [kadiRelevant, kadiArmed]);

  // Let the winning card land before the results overlay drops.
  useEffect(() => {
    if (view.phase !== 'roundOver') {
      setShowResults(false);
      return;
    }
    if (prefersReducedMotion()) {
      setShowResults(true);
      return;
    }
    const t = setTimeout(() => setShowResults(true), 750);
    return () => clearTimeout(t);
  }, [view.phase]);

  const sendMove = (move: Move) => {
    if (move.type === 'play' && kadiArmed) move = { ...move, announceKadi: true };
    setKadiArmed(false);
    setSelectedId(null);
    onMove(move);
  };

  const commitPlay = (card: Card) => {
    const option = playable.get(card.id);
    if (!option) return;
    playRectRef.current = rectOf(`hand:${card.id}`);
    const single = option.modes.length === 1 ? option.modes[0] : null;
    if (single && single.kind === 'normal') {
      sendMove({ type: 'play', cardId: card.id, asWild: false });
    } else {
      setDialogCard(card); // wild / spade / A♠ choices — selection kept until decided
    }
  };

  const handleCardClick = (card: Card) => {
    if (!view.yourTurn) return;
    if (!playable.has(card.id)) {
      sfx.error();
      return;
    }
    sfx.select();
    if (!TWO_STEP || selectedId === card.id) commitPlay(card);
    else setSelectedId(card.id);
  };

  /** Contextual verb for the action bar's commit button. */
  const playLabel = (card: Card): string => {
    const option = playable.get(card.id);
    const more = (option?.modes.length ?? 1) > 1 ? '…' : '';
    const name = cardLabel(card);
    if (view.mustCover) return `Cover with ${name}${more}`;
    if (view.pendingDraw > 0) {
      const dv = drawValue(card);
      if (dv > 0) return `Stack ${name} (+${dv})`;
      if (!isJoker(card) && card.kind === 'standard' && card.rank === 'K' && !more)
        return `Bounce with ${name}`;
      return `Counter with ${name}${more}`;
    }
    return `Play ${name}${more}`;
  };

  const selectedCard = selectedId
    ? view.yourHand.find((c) => c.id === selectedId) ?? null
    : null;

  let drawLabel = 'Draw a card';
  if (view.drawMeaning === 'eat') drawLabel = `Eat ${view.pendingDraw} cards`;
  else if (view.drawMeaning === 'giveUp') drawLabel = 'Draw 1 (give up)';
  else if (view.legalPlays.length > 0) drawLabel = 'Draw 1';

  const opponents = view.players.filter((p) => p.id !== view.you);
  const dialogOption = dialogCard ? playable.get(dialogCard.id) : undefined;

  const statusContent = (() => {
    if (view.phase === 'roundOver') return <div className="status-bubble">Round over</div>;
    if (view.pendingDraw > 0)
      return (
        <div className="status-bubble attack" key={view.pendingDraw}>
          ⚠️ Draw stack: <strong>{view.pendingDraw}</strong> — counter or eat!
        </div>
      );
    if (view.mustCover)
      return <div className="status-bubble attack">🎴 Uncovered 8 — answer it!</div>;
    if (view.requiredSuit || view.requiredRank)
      return (
        <div className="status-bubble">
          Play:{' '}
          {view.requiredSuit && (
            <span
              className="required-suit"
              style={{ color: isRedSuit(view.requiredSuit) ? 'var(--card-red)' : '#fff' }}
            >
              {SUIT_SYMBOL[view.requiredSuit]}
            </span>
          )}
          {view.requiredSuit && view.requiredRank ? ' or ' : ''}
          {view.requiredRank && <strong>{view.requiredRank}</strong>}
        </div>
      );
    return null;
  })();

  return (
    <div className="table">
      <div className="topbar">
        <button className="link" onClick={onExit}>
          ← {waitingForHost ? 'Leave' : 'Menu'}
        </button>
        <div className="title">Round {match.round}</div>
        <div className="tb-side">
          <button
            className="icon-btn"
            aria-pressed={muted}
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
              if (!next) sfx.select();
            }}
          >
            <SpeakerIcon muted={muted} />
          </button>
        </div>
      </div>

      <div className="opponents">
        {opponents.map((p) => (
          <Seat
            key={p.id}
            p={p}
            displayName={nameOf(p.id)}
            current={view.players[view.currentPlayerIndex]?.id === p.id}
          />
        ))}
      </div>

      <div className="center">
        <div className="status-row">{statusContent}</div>
        <div className="piles">
          <div className="pile">
            <div className="label">Draw</div>
            <button
              className="pile-btn draw-stack"
              ref={registerAnchor('draw')}
              disabled={!(view.yourTurn && view.canDraw)}
              onClick={() => sendMove({ type: 'draw' })}
              aria-label={drawLabel}
            >
              <CardBack />
            </button>
            <div className="count">{view.drawPileCount} left</div>
          </div>
          <DirectionArc direction={view.direction} />
          <div className="pile">
            <div className="label">Discard</div>
            <div
              ref={registerAnchor('discard')}
              style={hiddenDiscard ? { visibility: 'hidden' } : undefined}
            >
              {topCard ? (
                <CardFace key={settleKey} card={topCard} className="settle" />
              ) : (
                <div className="card" />
              )}
            </div>
            <div className="count">
              {view.requiredSuit ? `→ ${SUIT_SYMBOL[view.requiredSuit]}` : ' '}
            </div>
          </div>
        </div>
      </div>

      <div className={`handzone ${turnFlash ? 'your-turn-flash' : ''}`}>
        <div className={`turn-hint ${view.yourTurn ? 'you' : ''}`}>
          {view.phase === 'roundOver'
            ? 'Round over'
            : view.yourTurn
              ? view.mustCover
                ? 'Answer the 8 — cover it or draw'
                : view.pendingDraw > 0
                  ? 'Under attack — counter or eat'
                  : selectedCard
                    ? 'Confirm your play below'
                    : TWO_STEP
                      ? 'Your turn — tap a card'
                      : 'Your turn'
              : `Waiting for ${currentName}…`}
        </div>

        <div className={`hand ${dealing ? 'dealing' : ''}`}>
          {view.yourHand.map((card, i) => {
            const isPlayable = view.yourTurn && playable.has(card.id);
            return (
              <button
                key={card.id}
                ref={registerAnchor(`hand:${card.id}`)}
                className={`slot ${
                  isPlayable ? 'playable' : view.yourTurn ? 'dim' : ''
                } ${selectedId === card.id ? 'selected' : ''}`}
                style={{ '--deal-delay': `${i * 0.05}s` } as CSSProperties}
                onClick={() => handleCardClick(card)}
                aria-label={cardLabel(card)}
                aria-pressed={selectedId === card.id}
              >
                <CardFace card={card} />
              </button>
            );
          })}
        </div>

        <div className="action-bar">
          {view.phase === 'playing' && kadiRelevant && (
            <button
              className={`kadi-chip ${kadiArmed ? 'armed' : ''}`}
              aria-pressed={kadiArmed}
              onClick={() => {
                setKadiArmed((a) => !a);
                sfx.select();
              }}
            >
              🎴 Niko Kadi!
            </button>
          )}
          {view.yourTurn && selectedCard ? (
            <>
              <button className="primary" onClick={() => commitPlay(selectedCard)}>
                {playLabel(selectedCard)}
              </button>
              <button className="ghost" onClick={() => setSelectedId(null)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              {view.yourTurn && view.canDraw && (
                <button className="primary" onClick={() => sendMove({ type: 'draw' })}>
                  {drawLabel}
                </button>
              )}
              {view.yourTurn && view.canPass && (
                <button className="ghost" onClick={() => sendMove({ type: 'pass' })}>
                  Pass
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <FxLayer />

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div className={`toast ${t.error ? 'error' : ''}`} key={t.id}>
            {t.text}
          </div>
        ))}
      </div>

      {dialogCard && dialogOption && (
        <PlayDialog
          card={dialogCard}
          option={dialogOption}
          underAttack={view.pendingDraw > 0}
          onPlay={(move) => {
            setDialogCard(null);
            playRectRef.current = rectOf(`hand:${dialogCard.id}`);
            sendMove(move);
          }}
          onCancel={() => setDialogCard(null)}
        />
      )}

      {view.phase === 'roundOver' && showResults && (
        <ResultsOverlay
          view={view}
          match={match}
          targetScore={targetScore}
          waitingForHost={waitingForHost}
          nameOf={nameOf}
          onNextRound={onNextRound}
          onNewMatch={onNewMatch}
          onExit={onExit}
        />
      )}
    </div>
  );
}

function ResultsOverlay({
  view,
  match,
  targetScore,
  waitingForHost,
  nameOf,
  onNextRound,
  onNewMatch,
  onExit,
}: {
  view: PlayerView;
  match: MatchView;
  targetScore: number;
  waitingForHost: boolean;
  nameOf: (id: string) => string;
  onNextRound: () => void;
  onNewMatch: () => void;
  onExit: () => void;
}) {
  const round = view.roundScores ?? {};
  const totals: Record<string, number> = {};
  for (const p of view.players) {
    totals[p.id] = (match.totals[p.id] ?? 0) + (round[p.id] ?? 0);
  }
  const rows = view.players
    .map((p) => ({ id: p.id, name: nameOf(p.id), round: round[p.id] ?? 0, total: totals[p.id] }))
    .sort((a, b) => a.total - b.total);

  const matchOver = Math.max(...Object.values(totals)) >= targetScore;
  const roundWinner = view.winnerId ? nameOf(view.winnerId) : null;
  const matchWinner = rows[0]?.name;

  return (
    <div className="overlay">
      <div className="dialog results">
        {matchOver ? (
          <>
            <div className="winner">
              🏆 {matchWinner === 'You' ? 'You win the match!' : `${matchWinner} wins the match!`}
            </div>
            <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>
              First to {targetScore} loses — lowest score takes it.
            </div>
          </>
        ) : (
          <div className="winner">{roundWinner ? `${roundWinner} went out!` : 'Round over'}</div>
        )}

        <table className="scoreboard">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Round</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={i === 0 ? 'leader' : ''}>
                <td>{r.name}</td>
                <td className="num">+{r.round}</td>
                <td className="num">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row" style={{ justifyContent: 'center' }}>
          {matchOver ? (
            <button className="primary" onClick={onNewMatch}>
              {waitingForHost ? 'Play again' : 'New match'}
            </button>
          ) : (
            <button className="primary" onClick={onNextRound}>
              Next round
            </button>
          )}
          <button className="ghost" onClick={onExit}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
