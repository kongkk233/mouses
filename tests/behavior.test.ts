import test from "node:test";
import assert from "node:assert/strict";
import { decorativePose, portraitPose } from "../shared/behavior.js";
import type { Mouse } from "../shared/types.js";

const mouse: Pick<Mouse, "avatarSeed" | "weaningStatus" | "personality"> = {
  avatarSeed: 739,
  weaningStatus: "weaned",
  personality: "",
};
const sample = (personality: string, options = {}) =>
  Array.from({ length: 312 }, (_, phase) =>
    decorativePose({ ...mouse, personality }, phase, options),
  );
test("personalities bias decorative routines and can be disabled without changing identity", () => {
  const neutral = sample(""),
    count = (poses: string[], pose: string) =>
      poses.filter((p) => p === pose).length;
  assert.ok(count(sample("爱睡"), "sleep") > count(neutral, "sleep") * 2);
  assert.ok(count(sample("好奇"), "explore") > count(neutral, "explore") * 1.5);
  assert.ok(count(sample("贪吃"), "eat") > count(neutral, "eat") * 2);
  for (const personality of ["安静", "好奇", "爱睡", "爱筑巢", "贪吃", "社交"])
    assert.deepEqual(sample(personality, { personalities: false }), neutral);
  assert.deepEqual(sample("好奇"), sample("好奇"));
  assert.deepEqual(mouse, {
    avatarSeed: 739,
    weaningStatus: "weaned",
    personality: "",
  });
});
test("life-stage boundaries override personality and portraits preserve the registered weaning state", () => {
  for (const personality of ["", "好奇", "贪吃", "爱睡"]) {
    for (let phase = 0; phase < 30; phase++) {
      assert.equal(
        decorativePose(
          { ...mouse, personality, weaningStatus: "unweaned" },
          phase,
        ),
        "baby",
      );
      assert.ok(
        ["idle", "sleep", "groom"].includes(
          decorativePose(
            { ...mouse, personality, weaningStatus: "unknown" },
            phase,
          ),
        ),
      );
      assert.ok(
        ["sleep", "groom"].includes(
          decorativePose({ ...mouse, personality }, phase, {
            nursing: true,
            pregnant: true,
          }),
        ),
      );
      assert.ok(
        ["idle", "sleep", "groom", "stretch"].includes(
          decorativePose({ ...mouse, personality }, phase, { pregnant: true }),
        ),
      );
    }
  }
  assert.equal(
    portraitPose({ weaningStatus: "unweaned" }, { expression: "sleepy" }),
    "baby",
  );
  assert.equal(
    portraitPose({ weaningStatus: "weaned" }, { expression: "sleepy" }),
    "sleep",
  );
  assert.equal(
    portraitPose({ weaningStatus: "unknown" }, { expression: "curious" }),
    "idle",
  );
});
