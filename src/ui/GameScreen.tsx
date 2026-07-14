import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Card,
  type Suit,
  SUIT_SYMBOL,
  isRedSuit,
  cardLabel,
} from '../engine/cards';
import type { GameEvent, Move, PlayerView } from '../engine/types';
import { CardFace, CardBack } from './Card';
import { PlayDialog } from './PlayDialog';

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
}

// --- transient toasts from the game log ---------------------------------

interface Toast {
  id: number;
  text: string;
}

function useToasts(view: PlayerView) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(0);
  const nid = useRef(0);

  const nameOf = useMemo(() => {
    const map = new Map(view.players.map((p) => [p.id, p.id === view.you ? 'You' : p.name]));
    return (id: string) => map.get(id) ?? id;
  }, [view.players, view.you]);

  useEffect(() => {
    const log = view.log;
    if (log.length < seen.current) seen.current = 0; // new round reset
    const fresh = log.slice(seen.current);
    seen.current = log.length;
    const msgs = fresh.map((e) => messageFor(e, nameOf)).filter((m): m is string => !!m);
    if (msgs.length === 0) return;
    const added = msgs.map((text) => ({ id: nid.current++, text }));
    setToasts((t) => [...t, ...added].slice(-4));
    const timer = setTimeout(() => {
      setToasts((t) => t.slice(added.length));
    }, 2600);
    return () => clearTimeout(timer);
  }, [view.log, nameOf]);

  return toasts;
}

function messageFor(e: GameEvent, nameOf: (id: string) => string): string | null {
  switch (e.t) {
    case 'canceled':
      return `${nameOf(e.playerId)} canceled the stack 🛡️`;
    case 'bounced':
      return `${nameOf(e.playerId)} bounced it back! (${e.total})`;
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
    case 'kadiMissed':
      return `${nameOf(e.playerId)} forgot Niko Kadi! +${e.penalty}`;
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

// --- pieces --------------------------------------------------------------

function Seat({
  name,
  count,
  current,
  out,
  isHuman,
}: {
  name: string;
  count: number;
  current: boolean;
  out: boolean;
  isHuman: boolean;
}) {
  return (
    <div className={`seat ${current ? 'current' : ''} ${out ? 'out' : ''}`}>
      <div className="minihand">
        {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
          <div className="mini" key={i} />
        ))}
      </div>
      <div className="name">{isHuman ? 'You' : name}</div>
      <div className="meta">{out ? 'out' : `${count} card${count === 1 ? '' : 's'}`}</div>
    </div>
  );
}

function RequiredBadge({ suit, rank }: { suit: Suit | null; rank: string | null }) {
  if (!suit && !rank) return null;
  return (
    <div className="status-bubble">
      Play:{' '}
      {suit && (
        <span
          className="required-suit"
          style={{ color: isRedSuit(suit) ? 'var(--card-red)' : '#fff' }}
        >
          {SUIT_SYMBOL[suit]}
        </span>
      )}
      {suit && rank ? ' or ' : ''}
      {rank && <strong>{rank}</strong>}
    </div>
  );
}

// --- screen --------------------------------------------------------------

export function GameScreen({
  view,
  match,
  targetScore,
  onMove,
  onNextRound,
  onNewMatch,
  onExit,
  waitingForHost = false,
}: Props) {
  const toasts = useToasts(view);
  const [dialogCard, setDialogCard] = useState<Card | null>(null);

  const playable = useMemo(() => {
    const m = new Map(view.legalPlays.map((o) => [o.cardId, o]));
    return m;
  }, [view.legalPlays]);

  const nameOf = (id: string) => {
    const p = view.players.find((x) => x.id === id);
    return p ? (id === view.you ? 'You' : p.name) : id;
  };

  const currentName = nameOf(view.players[view.currentPlayerIndex]?.id ?? '');
  const topCard = view.topCard;

  const handleCardClick = (card: Card) => {
    if (!view.yourTurn) return;
    const option = playable.get(card.id);
    if (!option) return;
    const single = option.modes.length === 1 ? option.modes[0] : null;
    if (single && single.kind === 'normal') {
      onMove({ type: 'play', cardId: card.id, asWild: false });
      return;
    }
    setDialogCard(card);
  };

  const dialogOption = dialogCard ? playable.get(dialogCard.id) : undefined;

  // Draw button label.
  let drawLabel = '';
  if (view.canDraw) {
    if (view.drawMeaning === 'eat') drawLabel = `Eat ${view.pendingDraw} cards`;
    else if (view.drawMeaning === 'giveUp') drawLabel = 'Draw 1 (give up)';
    else drawLabel = 'Draw a card';
  }

  const opponents = view.players.filter((p) => p.id !== view.you);

  return (
    <div className="table">
      <div className="topbar">
        <button className="link" onClick={onExit}>
          ← Menu
        </button>
        <div className="title">Round {match.round}</div>
        <div style={{ width: 60, textAlign: 'right', fontSize: 12, color: 'var(--ink-dim)' }}>
          Draw: {view.drawPileCount}
        </div>
      </div>

      <div className="opponents">
        {opponents.map((p) => (
          <Seat
            key={p.id}
            name={p.name}
            count={p.handCount}
            current={view.players[view.currentPlayerIndex]?.id === p.id}
            out={p.eliminated || p.finished}
            isHuman={false}
          />
        ))}
      </div>

      <div className="center">
        {view.pendingDraw > 0 && (
          <div className="status-bubble attack">
            ⚠️ Draw stack: {view.pendingDraw} — counter or eat!
          </div>
        )}
        {view.pendingDraw === 0 && view.mustCover && (
          <div className="status-bubble attack">🎴 Uncovered 8 — cover it or draw 1</div>
        )}
        {view.pendingDraw === 0 && !view.mustCover && (
          <RequiredBadge suit={view.requiredSuit} rank={view.requiredRank} />
        )}

        <div className="pile">
          <div className="label">Draw</div>
          <button
            style={{ padding: 0, background: 'none' }}
            disabled={!(view.yourTurn && view.canDraw)}
            onClick={() => onMove({ type: 'draw' })}
            aria-label="Draw pile"
          >
            <CardBack />
          </button>
          <div className="count">{view.drawPileCount} left</div>
        </div>

        <div className="pile">
          <div className="label">Discard</div>
          {topCard ? <CardFace card={topCard} /> : <div className="card" />}
          <div className="count">{cardLabel(topCard ?? { id: '', kind: 'joker' })}</div>
        </div>
      </div>

      <div className="handzone">
        <div className={`turn-hint ${view.yourTurn ? 'you' : ''}`}>
          {view.phase === 'roundOver'
            ? 'Round over'
            : view.yourTurn
              ? view.mustCover
                ? 'Cover the 8 or draw'
                : view.pendingDraw > 0
                  ? 'Under attack — counter or eat'
                  : 'Your turn'
              : `Waiting for ${currentName}…`}
        </div>

        <div className="hand">
          {view.yourHand.map((card) => {
            const isPlayable = view.yourTurn && playable.has(card.id);
            return (
              <div
                key={card.id}
                className={`slot ${isPlayable ? 'playable' : view.yourTurn ? 'dim' : ''}`}
                onClick={() => handleCardClick(card)}
              >
                <CardFace card={card} />
              </div>
            );
          })}
        </div>

        <div className="controls">
          {view.yourTurn && view.canDraw && (
            <button className="primary" onClick={() => onMove({ type: 'draw' })}>
              {drawLabel}
            </button>
          )}
        </div>
      </div>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
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
            onMove(move);
          }}
          onCancel={() => setDialogCard(null)}
        />
      )}

      {view.phase === 'roundOver' && (
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
  // Projected match totals including this round.
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
            <div className="winner">🏆 {matchWinner} wins the match!</div>
            <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>
              First to {targetScore} loses — lowest score takes it.
            </div>
          </>
        ) : (
          <div className="winner">
            {roundWinner ? `${roundWinner} went out!` : 'Round over'}
          </div>
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
