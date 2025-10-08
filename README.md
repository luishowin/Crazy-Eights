# Crazyy Eights
A variant of Crazy Eights.


Objective:
    - Be the first player to discard all cards from your hand."

Setup: 
    - Shuffle a standard 52-card deck.
    - Deal 5 cards to each player (7 if there are only 2 players).
    - Place the remaining cards face down to form the draw pile.
    - Turn the top card face up to start the discard pile.
    - The player to the dealer's left goes first.
  
Turn: 
    order: "clockwise"
    actions: 
      - Play one card that matches the top card of the discard pile by suit or rank.
      - If you cannot play, draw cards from the draw pile until you can play or the pile is exhausted.
      - If the draw pile runs out, reshuffle all but the top card of the discard pile to form a new draw pile.
      - After playing, the next player takes their turn."


  cardPlayRules: 
    matchCriteria:
      "A card can be played if it matches the rank or suit of the top card on the discard pile, or if it is an eight (wild).",

    wildCard: 
      suit: ace
      effect: An ace may be played on any card. The player who plays it chooses the suit that continues play.

      rank: 2
      effect: Next player draws 2

      rank: 3
      effect: Next player draws 3

      suit: K
      effect: Kickback/reverse order of play

      suit: J
      effect: Skips the next player

      suit: joker
      effect: draw 5


    
    drawRule:
      - If a player cannot play, they draw one card at a time until they find a playable card or until the accumulate a total of 15 cards then they are eliminated.

  

    scoring:
      "If scoring is used, each other player scores penalty points equal to the value of the cards left in their hand (Eights = 50, Face cards = 10, Number cards = face value, Aces = 1)."
  


