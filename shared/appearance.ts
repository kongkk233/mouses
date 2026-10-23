import type { Appearance, Coat } from "./types.js";
export const coats: Coat[] = ["ivory", "cream", "silver", "cocoa"];
export const coatLabels: Record<Coat, string> = {
  ivory: "云朵白",
  cream: "燕麦奶油",
  silver: "月光银灰",
  cocoa: "可可棕",
};
export function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export function appearanceFor(
  seed: number,
  mother?: Appearance,
  father?: Appearance,
  choice = 0,
): Appearance {
  const rng = random(seed + choice * 7919);
  const pick = <T>(values: T[]) => values[Math.floor(rng() * values.length)];
  const base = choice === 0 ? mother : choice === 1 ? father : undefined;
  const provenance: Record<string, string> = {};
  const inherit = <T>(key: keyof Appearance, values: T[]): T => {
    if (base && rng() < 0.68) {
      provenance[key] = choice === 0 ? "妈妈相似" : "爸爸相似";
      return base[key] as T;
    }
    provenance[key] = "随机生成";
    return pick(values);
  };
  return {
    coat: inherit("coat", coats),
    pattern: inherit("pattern", ["solid", "solid", "cap", "socks", "blaze"]),
    ears: inherit("ears", ["round", "large"]),
    eyes: inherit("eyes", ["black", "brown", "ruby"]),
    face: inherit("face", ["round", "pointed"]),
    body: inherit("body", ["round", "slender"]),
    tail: inherit("tail", ["curl", "long"]),
    expression: inherit("expression", ["curious", "sleepy", "gentle"]),
    provenance,
  };
}
export function litterAppearance(
  seed: number,
  index: number,
  mother?: Appearance,
  father?: Appearance,
  choice = 0,
): Appearance {
  const shared = appearanceFor(seed, mother, father, choice);
  const individual = appearanceFor(
    seed + (index + 1) * 107,
    mother,
    father,
    choice,
  );
  individual.coat = shared.coat;
  individual.provenance.coat =
    shared.provenance.coat === "随机生成"
      ? "同窝共享 · 随机生成"
      : `同窝共享 · ${shared.provenance.coat}`;
  if (index % 2 === 0) {
    individual.pattern = shared.pattern;
    individual.provenance.pattern = "同窝共享";
  }
  return individual;
}
