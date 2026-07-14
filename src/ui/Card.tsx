import { type Card, SUIT_SYMBOL, isRedSuit, isJoker } from '../engine/cards';

export function CardFace({ card, className = '' }: { card: Card; className?: string }) {
  if (isJoker(card)) {
    return (
      <div className={`card joker ${className}`}>
        <span className="corner tl">🃏</span>
        <span className="pip">🃏</span>
        <span className="corner br">🃏</span>
      </div>
    );
  }
  const red = isRedSuit(card.suit);
  const sym = SUIT_SYMBOL[card.suit];
  return (
    <div className={`card ${red ? 'red' : ''} ${className}`}>
      <span className="corner tl">
        {card.rank}
        {sym}
      </span>
      <span className="pip">{sym}</span>
      <span className="corner br">
        {card.rank}
        {sym}
      </span>
    </div>
  );
}

export function CardBack({ className = '' }: { className?: string }) {
  return <div className={`card back ${className}`} />;
}
