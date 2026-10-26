// A small seeded random-number generator (REQ-SEED-01). Never use Math.random in tools/seed.

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** A uniform float in [min, max). */
  float(min: number, max: number): number;
  /** `count` lower-case hexadecimal characters. */
  hex(count: number): string;
  /** A new array with the items in random order (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32: fast, 32-bit state, good enough for test data, and identical on every platform. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const next = () => nextUint32() / 4294967296;
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    hex(count) {
      let out = "";
      while (out.length < count) out += nextUint32().toString(16).padStart(8, "0");
      return out.slice(0, count);
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j] as (typeof copy)[number], copy[i] as (typeof copy)[number]];
      }
      return copy;
    },
  };
}

/** Round half up (SPEC §2). */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}
