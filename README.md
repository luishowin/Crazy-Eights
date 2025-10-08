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
      rank: "8
      effect:
        - An eight may be played on any card. The player who plays it chooses the suit that continues play.
    
    drawRule:
      - If a player cannot play, they draw one card at a time until they find a playable card or the draw pile is    empty.
  

  winning: 
    condition:
      "The first player to play all their cards wins the round.",
    scoring:
      "If scoring is used, each other player scores penalty points equal to the value of the cards left in their hand (Eights = 50, Face cards = 10, Number cards = face value, Aces = 1)."
  

  variations: 
    "Some versions allow drawing only once per turn if no playable card is drawn.",
    "Some versions skip reshuffling when the draw pile is empty — play stops immediately.",
    "Point target games: play multiple rounds until a player reaches 100 points.",
    "Optional power cards (e.g., Skip, Reverse, Draw Two) are *not* part of standard rules but common in variants."
