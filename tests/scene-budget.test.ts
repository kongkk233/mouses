import test from "node:test";
import assert from "node:assert/strict";
import { SceneBudget } from "../src/scene-budget.js";

test("six visible scenes share one budget, scroll releases slots and details take priority", () => {
  const budget = new SceneBudget(6),
    active = new Set<string>();
  let peak = 0;
  const observe = (id: string) => (on: boolean) => {
    if (on) active.add(id);
    else active.delete(id);
    peak = Math.max(peak, active.size);
  };
  const release = Array.from({ length: 12 }, (_, i) =>
    budget.register(`cage-${i}`, observe(`cage-${i}`)),
  );
  for (let i = 0; i < 6; i++) budget.update(`cage-${i}`, true, 0, i);
  assert.equal(active.size, 6);
  budget.update("cage-0", false, 0, 0);
  budget.update("cage-6", true, 0, 6);
  assert.ok(active.has("cage-6"));
  const closeDetail = budget.register("detail", observe("detail"));
  budget.update("detail", true, 1, 0);
  assert.ok(active.has("detail"));
  assert.equal(active.size, 6);
  assert.equal(active.has("cage-6"), false);
  closeDetail();
  assert.ok(active.has("cage-6"));
  for (let i = 1; i < 7; i++) budget.update(`cage-${i}`, false, 0, i);
  for (let i = 7; i < 12; i++) budget.update(`cage-${i}`, true, 0, i);
  assert.deepEqual(
    [...active],
    ["cage-7", "cage-8", "cage-9", "cage-10", "cage-11"],
  );
  for (const unregister of release) unregister();
  closeDetail();
  assert.equal(active.size, 0);
  assert.equal(peak, 6);
});
