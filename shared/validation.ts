import type { AppState } from "./types.js";
import { daysBetween } from "./dates.js";

export const MIN_BIRTH_DATE = "2000-01-01";
export const EARLY_WEAN_DAYS = 18;
export const TEXT_LIMITS: Record<string, number> = {
  code: 64,
  nickname: 40,
  genotype: 120,
  strain: 120,
  personality: 20,
  observer: 80,
  convention: 120,
  photoUrl: 2048,
};
export const textLimit = (field: string) => TEXT_LIMITS[field] ?? 2000;

export function careExceptions(
  state: AppState,
  selected: string[],
  destinations: Record<string, string>,
  on: string,
  wean: boolean,
): string[] {
  const warnings: string[] = [];
  const mice = new Map(state.mice.map((m) => [m.id, m]));
  const selectedIds = new Set(selected);
  const position = (id: string) => destinations[id] ?? mice.get(id)?.cageId;
  for (const m of state.mice.filter((m) => m.status === "active")) {
    if (wean && selectedIds.has(m.id)) {
      if (daysBetween(m.dob, on) < EARLY_WEAN_DAYS)
        warnings.push(`${m.code} 在 ${daysBetween(m.dob, on)} 日龄登记断奶`);
      continue;
    }
    if (m.weaningStatus !== "unweaned") continue;
    const caregiver = m.fosterMotherId || m.motherId;
    const moved = selectedIds.has(m.id) && position(m.id) !== m.cageId;
    const caregiverMoved =
      caregiver &&
      selectedIds.has(caregiver) &&
      position(caregiver) !== m.cageId;
    if (
      (moved || caregiverMoved) &&
      (!caregiver || position(m.id) !== position(caregiver))
    )
      warnings.push(`${m.code} 尚未断奶，本次转笼将与哺育母鼠分开`);
  }
  return warnings;
}
