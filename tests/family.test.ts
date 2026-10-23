import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, applyCommand } from "../server/domain.js";
import { addDays } from "../shared/dates.js";
import { familyRelations } from "../src/selectors.js";
test("family projections keep candidate fathers, confirmed descendants, mates and cage membership distinct", () => {
  const s = emptyState(),
    run = (type: string, payload: Record<string, unknown>) =>
      applyCommand(s, type, payload);
  const c = run("cage.create", { code: "A", capacity: 10 }).id;
  const create = (code: string, sex: string) =>
    run("mouse.create", { code, cageId: c, sex, dob: addDays(s.today, -200) })
      .id as string;
  const mother = create("MOM", "female"),
    father = create("DAD", "male"),
    candidate = create("CANDIDATE", "male"),
    other = create("ROOMMATE", "male");
  const litter = run("litter.create", {
    code: "L",
    bornOn: addDays(s.today, -10),
    bornAlive: 2,
    birthTotal: 2,
    cageId: c,
    motherId: mother,
    candidateFatherIds: [father, candidate],
    appearanceConfirmed: true,
  }).id;
  const child = s.mice.find((m) => m.birthLitterId === litter)!;
  const get = (id: string) => s.mice.find((m) => m.id === id)!;
  const facts = JSON.stringify(s);
  assert.deepEqual(
    familyRelations(s, child).candidateFathers.map((m) => m.id),
    [father, candidate],
  );
  assert.equal(familyRelations(s, get(father)).litters.length, 0);
  assert.equal(familyRelations(s, get(father)).candidateLitters.length, 1);
  assert.equal(familyRelations(s, get(other)).candidateLitters.length, 0);
  assert.equal(familyRelations(s, get(mother)).partners.length, 0);
  assert.equal(JSON.stringify(s), facts);
  run("mouse.update", {
    id: child.id,
    fatherId: father,
    fatherStatus: "confirmed",
    reason: "已完成人工核对",
  });
  assert.equal(familyRelations(s, child).candidateFathers.length, 0);
  assert.equal(familyRelations(s, get(father)).litters.length, 1);
  assert.equal(familyRelations(s, get(candidate)).litters.length, 0);
  assert.equal(familyRelations(s, get(candidate)).candidateLitters.length, 1);
  const direct = run("mouse.create", {
    code: "DIRECT",
    dob: addDays(s.today, -30),
    cageId: c,
    fatherId: father,
    fatherStatus: "confirmed",
  }).id;
  assert.ok(
    familyRelations(s, get(father)).ungroupedChildren.some(
      (m) => m.id === direct,
    ),
  );
  run("breeding.create", {
    motherId: mother,
    candidateFatherIds: [father],
    date: s.today,
  });
  assert.deepEqual(
    familyRelations(s, get(mother)).partners.map((m) => m.id),
    [father],
  );
  assert.ok(
    familyRelations(s, get(mother)).cageMates.some((m) => m.id === other),
  );
});
