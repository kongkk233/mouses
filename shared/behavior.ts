import type { Appearance, Mouse } from "./types.js";

export type Pose =
  "idle" | "sleep" | "eat" | "explore" | "drink" | "groom" | "stretch" | "baby";

const routine: Pose[] = [
  "sleep",
  "idle",
  "eat",
  "groom",
  "explore",
  "stretch",
  "drink",
  "idle",
];
const personalities: Record<string, Pose[]> = {
  安静: [...routine, "idle", "sleep", "idle", "groom"],
  好奇: [...routine, "explore", "idle", "explore", "groom"],
  爱睡: [...routine, "sleep", "sleep", "idle", "sleep", "sleep"],
  爱筑巢: [...routine, "groom", "idle", "groom", "sleep"],
  贪吃: [...routine, "eat", "drink", "eat", "eat"],
  社交: [...routine, "idle", "explore", "idle", "stretch"],
};

// This deterministic presentation schedule never records observed behavior.
// Life-stage restrictions take priority over every personality preference.
export function decorativePose(
  mouse: Pick<Mouse, "avatarSeed" | "weaningStatus" | "personality">,
  phase: number,
  options: {
    nursing?: boolean;
    pregnant?: boolean;
    personalities?: boolean;
  } = {},
): Pose {
  if (mouse.weaningStatus === "unweaned") return "baby";
  const at = (cycle: Pose[]) =>
    cycle[(mouse.avatarSeed + phase) % cycle.length];
  if (mouse.weaningStatus === "unknown") return at(["idle", "sleep", "groom"]);
  if (options.nursing) return at(["sleep", "sleep", "sleep", "groom"]);
  if (options.pregnant)
    return at(["idle", "sleep", "groom", "stretch", "idle", "sleep"]);
  return at(
    options.personalities !== false
      ? personalities[mouse.personality] || routine
      : routine,
  );
}

export function portraitPose(
  mouse?: Pick<Mouse, "weaningStatus">,
  appearance?: Pick<Appearance, "expression">,
): Pose {
  if (mouse?.weaningStatus === "unweaned") return "baby";
  return appearance?.expression === "sleepy"
    ? "sleep"
    : appearance?.expression === "gentle"
      ? "groom"
      : "idle";
}
