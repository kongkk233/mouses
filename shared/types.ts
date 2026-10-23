export type Sex = 'male' | 'female' | 'unknown';
export type Weaning = 'unknown' | 'unweaned' | 'weaned';
export type Coat = 'ivory' | 'cream' | 'silver' | 'cocoa';
export interface Appearance {
  coat: Coat; pattern: 'solid' | 'cap' | 'socks' | 'blaze'; ears: 'round' | 'large';
  eyes: 'black' | 'brown' | 'ruby'; face: 'round' | 'pointed'; body: 'round' | 'slender';
  tail: 'curl' | 'long'; expression: 'curious' | 'sleepy' | 'gentle';
  provenance: Record<string, string>;
}
export interface Mouse {
  id: string; code: string; aliases: string[]; nickname: string; genotype: string; strain: string;
  dob: string; dobEstimated: boolean; sex: Sex; cageId: string | null;
  status: 'active' | 'transferred' | 'deceased' | 'retired';
  motherId: string | null; fatherId: string | null; motherStatus: 'confirmed' | 'candidate'; fatherStatus: 'confirmed' | 'candidate';
  fosterMotherId: string | null; birthLitterId: string | null; weaningStatus: Weaning; weanedOn: string | null;
  avatarSeed: number; appearance: Appearance; appearanceLocked: boolean; personality: string;
  phenotype: string; notes: string; breedingStopped: boolean; version: number;
}
export interface CarePlan {
  intervalDays: number; paused: boolean; pauseReason: string; resumeOn: string | null;
  reminderTime: string; aheadDays: number; overdue: boolean; firstDueOn: string | null; futureIntervalDays?: number;
}
export interface Cage {
  id: string; code: string; nickname: string; capacity: number; purpose: 'normal' | 'breeding' | 'nursery' | 'other';
  lastCleanedOn: string | null; plan: CarePlan | null; archived: boolean; notes: string; version: number;
}
export interface BreedingObservation { date: string; evidence: string; confidence: 'observation' | 'confirmed' }
export interface Breeding {
  id: string; motherId: string; candidateFatherIds: string[]; cageId: string | null;
  status: 'paired' | 'observing' | 'confirmed' | 'ended'; pairedOn: string;
  observations: BreedingObservation[]; confirmedOn: string | null; confirmationEvidence: string;
  baselineDate: string | null; baselineValue: number; convention: string;
  dueFrom: string | null; dueTo: string | null; reviewOn: string | null;
  endedOn: string | null; outcome: string; litterId: string | null; notes: string; version: number;
}
export interface Litter {
  id: string; code: string; bornOn: string; dobEstimated: boolean; cageId: string;
  motherId: string | null; fatherId: string | null; fatherStatus: 'confirmed' | 'candidate'; candidateFatherIds: string[];
  fosterMotherId: string | null; birthTotal: number; bornAlive: number; differenceNote: string;
  nursing: boolean; nursingEndedOn: string | null; weanDueOn: string | null;
  breedingId: string | null; appearanceChoice: number; notes: string; version: number;
}
export interface CareOccurrence {
  id: string; cageId: string; originalDueOn: string; scheduledOn: string;
  status: 'pending' | 'completed' | 'paused' | 'cancelled'; completedOn: string | null;
  eventId: string | null; sourceId: string | null; intervalDays: number;
  adjustmentReason: string; snoozedUntil: string | null; revision: number;
}
export interface Event {
  id: string; type: string; date: string; createdAt: string; mouseIds: string[]; cageIds: string[];
  litterId?: string; breedingId?: string; title: string; notes: string; details: Record<string, unknown>;
  voided?: boolean;
}
export interface Reminder {
  id: string; kind: 'age70' | 'age140' | 'cleaning' | 'review' | 'birth' | 'weaning' | 'care';
  subjectId: string; dueOn: string; title: string; status: 'pending' | 'handled' | 'cancelled';
  handledAt: string | null; snoozedUntil: string | null; basisChanged: boolean; cancelReason: string;
}
export interface CareTask {
  id: string; cageId: string; mouseId: string | null; kind: string; dueOn: string;
  status: 'pending' | 'completed'; notes: string; value: number | null; eventId: string | null;
}
export interface Settings {
  timezone: string; defaultCapacity: number; defaultIntervalDays: number; reminderTime: string;
  quietStart: string; quietEnd: string; motion: 'full' | 'gentle' | 'static';
  stories: boolean; personalities: boolean; anniversaries: boolean; pushEnabled: boolean;
}
export interface AppState {
  revision: number; today: string; demo: boolean; settings: Settings;
  mice: Mouse[]; cages: Cage[]; breedings: Breeding[]; litters: Litter[];
  occurrences: CareOccurrence[]; events: Event[]; reminders: Reminder[]; careTasks: CareTask[];
}
export interface Command { type: string; payload: Record<string, any>; opId: string; expectedRevision: number }
export const sexLabel = { male: '♂ 雄', female: '♀ 雌', unknown: '待确认' };
export const purposeLabel = { normal: '日常小窝', breeding: '配种小窝', nursery: '育幼小窝', other: '其他用途' };
export const statusLabel = { active: '在笼', transferred: '已转出', deceased: '已死亡', retired: '已结束实验' };
export const careLabel: Record<string, string> = { water: '换水', food: '喂食', weight: '称重', observation: '健康观察', nesting: '整理窝材', phenotype: '表型观察', milestone: '成长纪念' };
