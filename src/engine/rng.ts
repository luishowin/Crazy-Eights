// Deterministic, seeded RNG (mulberry32). Storing the seed in game state makes
// every shuffle reproducible — essential for the multiplayer host to stay
// authoritative and for turning bug reports into replayable tests.

/** Advance the generator: returns [random in [0,1), nextState]. */
export function nextRandom(state: number): [number, number] {
  let a = state | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [r, a];
}

/** Fisher–Yates shuffle. Returns a new array and the advanced seed. */
export function shuffle<T>(arr: readonly T[], seed: number): [T[], number] {
  const a = arr.slice();
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    let r: number;
    [r, s] = nextRandom(s);
    const j = Math.floor(r * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [a, s];
}

/** A reasonable non-crypto seed for a new game when none is supplied. */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) | 0) >>> 0;
}
