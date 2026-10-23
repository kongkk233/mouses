import type { AppState, Mouse } from "./types.js";
export interface GeneticRule {
  id: string;
  locus: string;
  version: string;
  strain: string;
  parentGenotypes: [string, string];
  allowedOffspring: string[];
  message: string;
}
/** A consistency hint against user-supplied lab rules; never an inference engine. */
export function consistencyWarnings(
  state: AppState,
  mouse: Pick<
    Mouse,
    | "motherId"
    | "fatherId"
    | "motherStatus"
    | "fatherStatus"
    | "genotype"
    | "strain"
  >,
): string[] {
  if (
    !mouse.genotype ||
    mouse.motherStatus !== "confirmed" ||
    mouse.fatherStatus !== "confirmed"
  )
    return [];
  const mother = state.mice.find((m) => m.id === mouse.motherId),
    father = state.mice.find((m) => m.id === mouse.fatherId);
  if (!mother?.genotype || !father?.genotype) return [];
  return (state.settings.geneticRules || [])
    .filter((rule) => {
      if (rule.strain && rule.strain !== mouse.strain) return false;
      const pair = [mother.genotype, father.genotype].sort();
      return (
        [...rule.parentGenotypes].sort().every((g, i) => g === pair[i]) &&
        !rule.allowedOffspring.includes(mouse.genotype)
      );
    })
    .map((rule) => `${rule.locus} · ${rule.version}：${rule.message}`);
}
