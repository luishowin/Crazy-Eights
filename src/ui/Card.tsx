// Card rendering: pure inline SVG (no image assets, no emoji glyphs) so faces
// look identical on every platform and stay crisp from 44px to 84px wide.

import type { ReactElement } from 'react';
import { type Card, type Suit, type Rank, isJoker, isRedSuit, cardLabel } from '../engine/cards';

/**
 * Shared <defs>: suit pips and court motifs, referenced via <use>.
 * Mount exactly once (App does this).
 */
export function CardDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        <symbol id="pip-H" viewBox="0 0 24 24">
          <path d="M12 21 C7 16.5 2.5 12.8 2.5 8.5 C2.5 5.5 4.8 3.5 7.3 3.5 C9.2 3.5 11 4.6 12 6.3 C13 4.6 14.8 3.5 16.7 3.5 C19.2 3.5 21.5 5.5 21.5 8.5 C21.5 12.8 17 16.5 12 21 Z" />
        </symbol>
        <symbol id="pip-D" viewBox="0 0 24 24">
          <path d="M12 2 L18.5 12 L12 22 L5.5 12 Z" />
        </symbol>
        <symbol id="pip-S" viewBox="0 0 24 24">
          <path d="M12 2 C8 6.5 3.5 9.8 3.5 13.8 C3.5 16.4 5.5 18.3 7.8 18.3 C9.1 18.3 10.2 17.8 11 16.9 C10.8 18.8 10 20.4 8.6 21.8 L15.4 21.8 C14 20.4 13.2 18.8 13 16.9 C13.8 17.8 14.9 18.3 16.2 18.3 C18.5 18.3 20.5 16.4 20.5 13.8 C20.5 9.8 16 6.5 12 2 Z" />
        </symbol>
        <symbol id="pip-C" viewBox="0 0 24 24">
          <circle cx="12" cy="7.2" r="4.5" />
          <circle cx="6.8" cy="13.8" r="4.5" />
          <circle cx="17.2" cy="13.8" r="4.5" />
          <path d="M11 13.5 C10.9 17 10.1 19.6 8.6 21.8 L15.4 21.8 C13.9 19.6 13.1 17 13 13.5 Z" />
        </symbol>
        <symbol id="motif-crown" viewBox="0 0 24 24">
          <path d="M4 16.5 L5.2 7.5 L9.2 11 L12 5 L14.8 11 L18.8 7.5 L20 16.5 Z M4 18 H20 V20 H4 Z" />
        </symbol>
        <symbol id="motif-gems" viewBox="0 0 24 24">
          <path d="M12 4.5 L15.2 9 L12 13.5 L8.8 9 Z M4.5 8 L6.8 11 L4.5 14 L2.2 11 Z M19.5 8 L21.8 11 L19.5 14 L17.2 11 Z" />
        </symbol>
        <symbol id="motif-shield" viewBox="0 0 24 24">
          <path d="M12 3 L19 5.8 V11.5 C19 16.5 16 19.5 12 21 C8 19.5 5 16.5 5 11.5 V5.8 Z" />
        </symbol>
      </defs>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pip layouts for number cards (viewBox 100×140; columns 32/50/68).
// The optional flag marks pips rendered upside-down (bottom half).
// ---------------------------------------------------------------------------

type PipSpot = readonly [x: number, y: number, flipped?: 1];
const PIP_LAYOUTS: Partial<Record<Rank, readonly PipSpot[]>> = {
  '2': [[50, 34], [50, 106, 1]],
  '3': [[50, 34], [50, 70], [50, 106, 1]],
  '4': [[32, 34], [68, 34], [32, 106, 1], [68, 106, 1]],
  '5': [[32, 34], [68, 34], [50, 70], [32, 106, 1], [68, 106, 1]],
  '6': [[32, 34], [68, 34], [32, 70], [68, 70], [32, 106, 1], [68, 106, 1]],
  '7': [[32, 34], [68, 34], [50, 52], [32, 70], [68, 70], [32, 106, 1], [68, 106, 1]],
  '8': [
    [32, 34], [68, 34], [50, 52], [32, 70], [68, 70], [50, 88, 1], [32, 106, 1], [68, 106, 1],
  ],
  '9': [
    [32, 31], [68, 31], [32, 57], [68, 57], [50, 70], [32, 83, 1], [68, 83, 1], [32, 109, 1],
    [68, 109, 1],
  ],
  '10': [
    [32, 29], [68, 29], [50, 43], [32, 57], [68, 57], [32, 83, 1], [68, 83, 1], [50, 97, 1],
    [32, 111, 1], [68, 111, 1],
  ],
};

const SERIF = "Georgia, 'Times New Roman', serif";

function Pip({ suit, x, y, size, flipped }: { suit: Suit; x: number; y: number; size: number; flipped?: boolean }) {
  const use = (
    <use href={`#pip-${suit}`} x={x - size / 2} y={y - size / 2} width={size} height={size} />
  );
  return flipped ? <g transform={`rotate(180 ${x} ${y})`}>{use}</g> : use;
}

function CornerIndex({ rank, suit }: { rank: Rank; suit: Suit }) {
  const ten = rank === '10';
  return (
    <g>
      <text
        x={13}
        y={20}
        textAnchor="middle"
        fontSize={ten ? 13.5 : 16.5}
        fontWeight={800}
        fontFamily={SERIF}
        fill="currentColor"
      >
        {rank}
      </text>
      <Pip suit={suit} x={13} y={30.5} size={13.5} />
    </g>
  );
}

function CourtArt({ rank, suit }: { rank: Rank; suit: Suit }) {
  const motif = rank === 'K' ? 'motif-crown' : rank === 'Q' ? 'motif-gems' : 'motif-shield';
  return (
    <g>
      <use href={`#${motif}`} x={40} y={17} width={20} height={20} fill="currentColor" />
      <rect x={28} y={40} width={44} height={62} rx={5} fill="none" stroke="currentColor" strokeWidth={1.8} />
      <Pip suit={suit} x={50} y={53} size={12} />
      <text
        x={50}
        y={81.5}
        textAnchor="middle"
        fontSize={30}
        fontWeight={700}
        fontFamily={SERIF}
        fill="currentColor"
      >
        {rank}
      </text>
      <Pip suit={suit} x={50} y={92} size={12} flipped />
    </g>
  );
}

function AceArt({ suit }: { suit: Suit }) {
  if (suit === 'S') {
    // The supercard: oversized spade with a gold echo and radiating spokes.
    return (
      <g>
        <g stroke="var(--gold-dim)" strokeWidth={1.2} opacity={0.55}>
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI) / 4 + Math.PI / 8;
            return (
              <line
                key={i}
                x1={50 + Math.cos(a) * 26}
                y1={70 + Math.sin(a) * 26}
                x2={50 + Math.cos(a) * 33}
                y2={70 + Math.sin(a) * 33}
              />
            );
          })}
        </g>
        <use href="#pip-S" x={24} y={44} width={52} height={52} fill="var(--gold)" />
        <use href="#pip-S" x={27} y={47} width={46} height={46} fill="currentColor" />
      </g>
    );
  }
  return <Pip suit={suit} x={50} y={70} size={40} />;
}

function JokerArt({ variant }: { variant: 'A' | 'B' }) {
  const cap = variant === 'A' ? 'var(--card-red)' : 'var(--card-black)';
  return (
    <g>
      {/* jester cap: three lobes + band */}
      <path
        d="M30 76 C31 62 35 52 41.5 50 C44.5 49.2 47 51.6 47.5 55.8 C48.6 47.4 49.6 42 50 42 C50.4 42 51.4 47.4 52.5 55.8 C53 51.6 55.5 49.2 58.5 50 C65 52 69 62 70 76 Z"
        fill={cap}
      />
      <rect x={29} y={76} width={42} height={6.5} rx={3} fill="var(--card-black)" />
      <circle cx={41.5} cy={49.5} r={3.4} fill="var(--gold)" />
      <circle cx={50} cy={41.5} r={3.4} fill="var(--gold)" />
      <circle cx={58.5} cy={49.5} r={3.4} fill="var(--gold)" />
      {/* collar star */}
      <path
        d="M50 92 L52.6 99 L60 99.4 L54.2 104 L56.2 111 L50 107 L43.8 111 L45.8 104 L40 99.4 L47.4 99 Z"
        fill={cap}
      />
    </g>
  );
}

function JokerCorner() {
  return (
    <g fontFamily={SERIF} fontWeight={800} fontSize={9.5} fill="currentColor" textAnchor="middle">
      {['J', 'O', 'K', 'E', 'R'].map((ch, i) => (
        <text key={i} x={11} y={16 + i * 10}>
          {ch}
        </text>
      ))}
    </g>
  );
}

function CardArt({ card }: { card: Card }): ReactElement {
  if (isJoker(card)) {
    const variant = card.id === 'JOKER-A' ? 'A' : 'B';
    return (
      <svg viewBox="0 0 100 140" aria-hidden focusable="false">
        <JokerCorner />
        <g transform="rotate(180 50 70)">
          <JokerCorner />
        </g>
        <JokerArt variant={variant} />
      </svg>
    );
  }
  const { rank, suit } = card;
  const pips = PIP_LAYOUTS[rank];
  return (
    <svg viewBox="0 0 100 140" aria-hidden focusable="false">
      <CornerIndex rank={rank} suit={suit} />
      <g transform="rotate(180 50 70)">
        <CornerIndex rank={rank} suit={suit} />
      </g>
      {rank === 'A' ? (
        <AceArt suit={suit} />
      ) : pips ? (
        <g>
          {pips.map(([x, y, f], i) => (
            <Pip key={i} suit={suit} x={x} y={y} size={17} flipped={!!f} />
          ))}
        </g>
      ) : (
        <CourtArt rank={rank} suit={suit} />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Public API (unchanged shape: CardFace / CardBack)
// ---------------------------------------------------------------------------

export function CardFace({ card, className = '' }: { card: Card; className?: string }) {
  const red = !isJoker(card) && isRedSuit(card.suit);
  const joker = isJoker(card);
  const aceSpade = card.id === 'AS';
  const jokerRed = joker && card.id === 'JOKER-A';
  return (
    <div
      className={`card ${red || jokerRed ? 'red' : ''} ${joker ? 'joker' : ''} ${aceSpade ? 'ace-spade' : ''} ${className}`}
      role="img"
      aria-label={cardLabel(card)}
    >
      <CardArt card={card} />
    </div>
  );
}

export function CardBack({ className = '' }: { className?: string }) {
  return <div className={`card back ${className}`} aria-hidden />;
}
