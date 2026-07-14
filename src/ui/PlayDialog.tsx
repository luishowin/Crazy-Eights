import { useState } from 'react';
import {
  type Card,
  type Suit,
  type Rank,
  SUITS,
  RANKS,
  SUIT_SYMBOL,
  SUIT_NAME,
  isRedSuit,
  isJoker,
  isAceOfSpades,
} from '../engine/cards';
import type { Move, PlayableOption, PlayModeKind } from '../engine/types';

interface Props {
  card: Card;
  option: PlayableOption;
  underAttack: boolean;
  onPlay: (move: Move) => void;
  onCancel: () => void;
}

/** Short description of what a spade's "as itself" play does. */
function spadeEffect(card: Card): string {
  if (isJoker(card) || card.kind !== 'standard') return '';
  switch (card.rank) {
    case '2':
      return 'make them draw 2';
    case '3':
      return 'make them draw 3';
    case '8':
      return 'question (cover it)';
    case 'J':
      return 'skip next player';
    case 'K':
      return 'reverse';
    default:
      return 'keep spades';
  }
}

function SuitRow({ onPick }: { onPick: (s: Suit) => void }) {
  return (
    <div className="row">
      {SUITS.map((s) => (
        <button
          key={s}
          className={`suit-btn ${isRedSuit(s) ? 'red' : 'black'}`}
          onClick={() => onPick(s)}
          aria-label={SUIT_NAME[s]}
        >
          {SUIT_SYMBOL[s]}
        </button>
      ))}
    </div>
  );
}

export function PlayDialog({ card, option, underAttack, onPlay, onCancel }: Props) {
  const hasNormal = option.modes.some((m) => m.kind === 'normal');
  const hasWild = option.modes.some((m) => m.kind === 'wild');
  const isAce = isAceOfSpades(card);

  // Decide the opening step.
  const needsModeChoice = (hasNormal && hasWild) || (isAce && underAttack);
  const [step, setStep] = useState<'mode' | 'suit' | 'rank'>(
    needsModeChoice ? 'mode' : 'suit',
  );
  const [mode, setMode] = useState<PlayModeKind>(
    isAce ? 'ace-super' : hasNormal && !hasWild ? 'normal' : 'wild',
  );
  const [suit, setSuit] = useState<Suit | null>(null);

  const playNormalSpade = () => onPlay({ type: 'play', cardId: card.id, asWild: false });
  const cancelWithAce = () => onPlay({ type: 'play', cardId: card.id });

  const finish = (chosenSuit: Suit, rank?: Rank) => {
    const move: Extract<Move, { type: 'play' }> = {
      type: 'play',
      cardId: card.id,
      declaredSuit: chosenSuit,
    };
    if (!isAce) move.asWild = true;
    if (rank) move.declaredRank = rank;
    onPlay(move);
  };

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        {step === 'mode' && (
          <>
            <h2>How do you want to play it?</h2>
            <div className="row" style={{ flexDirection: 'column' }}>
              {isAce && underAttack && (
                <button className="primary" onClick={cancelWithAce}>
                  🛡️ Cancel the draw stack
                </button>
              )}
              {isAce && (
                <button
                  onClick={() => {
                    setMode('ace-super');
                    setStep('suit');
                  }}
                >
                  ✨ Supercard — choose suit & rank
                </button>
              )}
              {!isAce && hasNormal && (
                <button onClick={playNormalSpade}>
                  ♠ Play as itself ({spadeEffect(card)})
                </button>
              )}
              {!isAce && hasWild && (
                <button
                  onClick={() => {
                    setMode('wild');
                    setStep('suit');
                  }}
                >
                  🌈 Wild — change the suit
                </button>
              )}
            </div>
            <button className="link" onClick={onCancel}>
              Cancel
            </button>
          </>
        )}

        {step === 'suit' && (
          <>
            <h2>Choose the suit to continue in</h2>
            <SuitRow
              onPick={(s) => {
                if (mode === 'ace-super') {
                  setSuit(s);
                  setStep('rank');
                } else {
                  finish(s);
                }
              }}
            />
            <button className="link" onClick={onCancel}>
              Cancel
            </button>
          </>
        )}

        {step === 'rank' && suit && (
          <>
            <h2>
              Continue in {SUIT_SYMBOL[suit]} — lock a rank?
            </h2>
            <div className="rank-grid">
              {RANKS.map((r) => (
                <button key={r} onClick={() => finish(suit, r)}>
                  {r}
                </button>
              ))}
            </div>
            <button className="ghost" onClick={() => finish(suit)}>
              Suit only (any rank)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
