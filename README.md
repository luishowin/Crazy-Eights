![Banner](banner.png)

# 🎴 Very Crazy Eights
A chaotic, strategic, and occasionally cruel variant of Crazy Eights.



## Objective
    - Be the first player to discard all cards from your hand.

## Setup
    - Shuffle a standard 52-card deck.
    - Deal 5 cards to each player (7 if there are only 2 players).
    - Place the remaining cards face down to form the draw pile.
    - Turn the top card face up to start the discard pile(Cannot be an 8, K, Q, J, 2, 3 or joker).
    - The player to the dealer's left goes first.
  
## Turn
    play order: clockwise
    actions: 
      - Play one card that matches the top card of the discard pile by suit or rank.
      - If you cannot play, draw cards from the draw pile until you can play or reach the max-card-hold, at which you  get eliminated.
      - If the draw pile runs out, reshuffle all but the top card of the discard pile to form a new draw pile.
      - After playing, the next player takes their turn."


## cardPlayRules
      match criteria:
      A card can be played if it matches the rank or suit of the top card on the discard pile, or if it is an eight (wild).

      wildCard: 
      suit: ace of spades
      effect: An ace of spades may be played on any card. The player who plays it chooses the suit and rank that continues play. Or negates a draw-card's effect.

      suit: Ranked spade
      effect: Can be played on any card, the player who plays it chooses the suit that continues to play.  Or negates a draw-card's effect.

      rank: 2
      effect: Next player draws 2. Stackable

      rank: 3
      effect: Next player draws 3. Stackable

      rank: 8
      - When a player plays an 8, they must immediately “cover” it with another card of the same suit.
      - If they cannot, they draw one card and their turn ends.
      - If the next player faces an uncovered 8 (e.g., from a skip, reverse, or draw chain ending on it), they must also cover it or draw one.
      - 8s do not act as wilds in this version.

      suit: K
      effect: Kickback/reverse order of play & reverse a draw-card's effect


      suit: J
      effect: Skips the next player

      suit: joker
      effect: draw 5. Stackable.

      ## 🃏 Special Card Effects — Very Crazy Eights

| Card  | Effect | Stackable | Notes |
|-------|---------|------------|-------|
| **2**         | Next player draws 2 cards. | ✅ | Can be stacked with other 2s, 3s, or Jokers. Total draw value accumulates. |
| **3**         | Next player draws 3 cards. | ✅ | Stackable with other 2s, 3s, or Jokers. |
| **J (Jack)** | Skips the next player's turn. | ❌ | Simple skip, no stacking. |
| **K (King)** | Reverses the order of play **and** reverses any active draw effect. | ❌ | Powerful defensive card. |
| **8** | Must be **covered** immediately by a card of the **same suit**. If you can’t, draw 1 card and end your turn. | ❌ | Adds a risk–reward mechanic. If an uncovered 8 remains on top, the next player must also cover or draw. |
| **Joker** | Next player draws 5 cards. | ✅ | Stackable with 2s, 3s, and other Jokers. Brutal in chains. |
| **Ace of Spades** | Wild supercard. Can be played on any card. Choose both **suit and rank** for next play **or** cancel any draw effect. | ❌ | The ultimate control or defense card. |
| **Any other Spade (2–K)** | Wild suit card. Can be played on any card; choose the **new suit** for play **or** cancel a draw effect. | ❌ | Gives Spades a strategic edge. |


      


    
    🧩 draw rule:
    - If you can’t play, draw one at a time until you find a playable card or hit 15 cards total — at which point you’re out.
    - If a draw effect (2, 3, or Joker) targets you:
    - You may stack with another draw card to pass it forward.
    - Otherwise, you draw the total (sum of all stacked effects).

  
## 🧮 scoring(optional)
      If scoring is used, each other player scores penalty points equal to the value of the cards left in their hand (Eights = 50, Face cards = 10, Number cards = face value, Aces = 1).
  


