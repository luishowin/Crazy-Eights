// House-rule configuration. The README's "this house's defaults" live in
// DEFAULT_RULES; the ⚙️-marked rules are the ones a room host can toggle.

export interface RuleConfig {
  /** Hand size at which a player busts out. */
  bustLimit: number;
  /** If the card that reaches the bust limit is playable, the player survives. */
  playablePardonsBust: boolean;
  /** Draw cards (2/3/joker) must match suit/rank to stack. Default: false. */
  stackRequiresMatch: boolean;
  /** A cancel (spade / A♠) clears the whole accumulated stack, not just the last. */
  cancelClearsWholeStack: boolean;
  /** You may not draw voluntarily while holding a playable card. */
  noVoluntaryDraw: boolean;
  /** A winning final card still fires its effect on the next player. */
  finalCardEffectFires: boolean;
  /** "Niko Kadi!" — must announce at one card left or take a penalty. */
  nikoKadi: boolean;
  nikoKadiPenalty: number;
  /** In a 2-player game a King skips (you play again) instead of a no-op reverse. */
  kingHeadsUpSkips: boolean;

  startingHandSize: number;
  startingHandSizeHeadsUp: number;
}

export const DEFAULT_RULES: RuleConfig = {
  bustLimit: 15,
  playablePardonsBust: true,
  stackRequiresMatch: false,
  cancelClearsWholeStack: true,
  noVoluntaryDraw: true,
  finalCardEffectFires: true,
  nikoKadi: false,
  nikoKadiPenalty: 2,
  kingHeadsUpSkips: true,
  startingHandSize: 5,
  startingHandSizeHeadsUp: 7,
};

export function makeRules(overrides: Partial<RuleConfig> = {}): RuleConfig {
  return { ...DEFAULT_RULES, ...overrides };
}
