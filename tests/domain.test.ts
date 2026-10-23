import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store.js";
import {
  emptyState,
  applyCommand,
  reconcile,
  commonAncestors,
} from "../server/domain.js";
import {
  addDays,
  ageText,
  daysBetween,
  todayIn,
  validDate,
} from "../shared/dates.js";
import { appearanceFor, litterAppearance } from "../shared/appearance.js";
import { notificationRefs } from "../server/notifications.js";
const setup = () => {
  const s = emptyState();
  const run = (t: string, p: any) => applyCommand(s, t, p);
  const c = run("cage.create", { code: "A001" }).id as string;
  const m = run("mouse.create", {
    code: "M001",
    cageId: c,
    dob: addDays(s.today, -140),
    sex: "female",
  }).id as string;
  return { s, run, c, m };
};
test("phenotype evidence preserves date, observer and photo independently from decorative appearance", () => {
  const { s, run, c, m } = setup();
  const appearance = structuredClone(s.mice[0].appearance);
  run("care.record", {
    cageIds: [c],
    mouseId: m,
    kind: "phenotype",
    date: s.today,
    observer: "记录人",
    notes: "背部白斑",
    photoUrl: "https://example.invalid/photo.jpg",
    experimentalFact: false,
  });
  const observation = s.events.find((e) => e.type === "care.record")!;
  assert.equal(observation.date, s.today);
  assert.equal(observation.notes, "背部白斑");
  assert.equal(observation.details.observer, "记录人");
  assert.equal(
    observation.details.photoUrl,
    "https://example.invalid/photo.jpg",
  );
  assert.equal(observation.details.experimentalFact, false);
  assert.deepEqual(s.mice[0].appearance, appearance);
  const evidence = JSON.stringify(observation);
  run("mouse.appearance", {
    id: m,
    appearance: appearanceFor(2),
    locked: true,
  });
  assert.equal(JSON.stringify(observation), evidence);
  for (const photoUrl of [
    "javascript:alert(1)",
    "http://example.invalid/a.jpg",
    "https://user:password@example.invalid/a.jpg",
  ]) {
    const before = s.events.length;
    assert.throws(() =>
      run("care.record", {
        cageIds: [c],
        mouseId: m,
        kind: "phenotype",
        date: s.today,
        notes: "观察",
        photoUrl,
      }),
    );
    assert.equal(s.events.length, before);
  }
  assert.throws(() =>
    run("care.record", {
      cageIds: [c],
      kind: "phenotype",
      date: s.today,
      notes: "观察",
    }),
  );
  const db = new Store(":memory:");
  try {
    db.save(s);
    assert.equal(
      JSON.stringify(db.read().events.find((e) => e.id === observation.id)),
      evidence,
    );
  } finally {
    db.close();
  }
});
test("calendar date arithmetic, leap years and time zones", () => {
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2);
  assert.equal(validDate("2025-02-29"), false);
  assert.equal(
    todayIn("Asia/Shanghai", new Date("2026-10-23T16:00:00Z")),
    "2026-10-24",
  );
  for (const n of [69, 70, 139, 140])
    assert.equal(
      ageText(addDays("2026-10-24", -n), "2026-10-24"),
      `${Math.floor(n / 7)}周${n % 7}天`,
    );
});
test("age reminders use days, remain stable across birthday correction and archive", () => {
  const { s, run, m } = setup();
  reconcile(s);
  const r = s.reminders.find((r) => r.subjectId === m && r.kind === "age140")!;
  assert.equal(r.dueOn, s.today);
  run("reminder.handle", { ids: [r.id] });
  run("mouse.update", { id: m, dob: addDays(s.today, -139) });
  reconcile(s);
  assert.equal(r.status, "handled");
  assert.equal(r.basisChanged, true);
  assert.equal(r.dueOn, addDays(s.today, 1));
  const before = s.reminders.length;
  reconcile(s);
  assert.equal(s.reminders.length, before);
  run("mouse.archive", { mouseIds: [m], date: s.today, status: "transferred" });
  reconcile(s);
  assert.equal(
    s.reminders.find((x) => x.kind === "age70")?.status,
    "cancelled",
  );
});
test("cleaning schedules use actual completion, historical supplements do not overwrite", () => {
  const { s, run, c } = setup();
  run("cleaning.complete", { cageIds: [c], date: addDays(s.today, -6) });
  run("plan.set", { cageIds: [c], intervalDays: 7 });
  reconcile(s);
  assert.equal(s.occurrences[0].scheduledOn, addDays(s.today, 1));
  run("cleaning.complete", { cageIds: [c], date: s.today });
  reconcile(s);
  assert.equal(
    s.occurrences.filter((o) => o.status === "pending")[0].scheduledOn,
    addDays(s.today, 7),
  );
  run("cleaning.complete", { cageIds: [c], date: addDays(s.today, -10) });
  reconcile(s);
  assert.equal(s.cages[0].lastCleanedOn, s.today);
  assert.equal(s.occurrences.filter((o) => o.status === "pending").length, 1);
});
test("reschedule keeps instance, original overdue date and cleaning fact", () => {
  const { s, run, c } = setup();
  run("plan.set", {
    cageIds: [c],
    intervalDays: 7,
    firstDueOn: addDays(s.today, -2),
  });
  reconcile(s);
  const o = s.occurrences[0],
    id = o.id;
  run("plan.reschedule", { id, date: addDays(s.today, 2), reason: "安排调整" });
  assert.equal(o.id, id);
  assert.equal(o.originalDueOn, addDays(s.today, -2));
  assert.equal(s.cages[0].lastCleanedOn, null);
  assert.throws(() => run("reminder.handle", { ids: [`clean:${id}`] }));
});
test("transfer keeps parentage and cleaning date; empty cages pause", () => {
  const { s, run, c, m } = setup();
  const target = run("cage.create", { code: "B002" }).id as string;
  run("cleaning.complete", { cageIds: [target], date: addDays(s.today, -5) });
  run("plan.set", { cageIds: [c], intervalDays: 7, firstDueOn: s.today });
  reconcile(s);
  const seed = s.mice[0].avatarSeed;
  run("mouse.transfer", { mouseIds: [m], cageId: target, date: s.today });
  reconcile(s);
  assert.equal(s.mice[0].cageId, target);
  assert.equal(s.mice[0].avatarSeed, seed);
  assert.equal(s.cages[1].lastCleanedOn, addDays(s.today, -5));
  assert.equal(s.cages[0].plan?.paused, true);
});
test("capacity overflow needs explicit reason", () => {
  const { s, run, c } = setup();
  s.cages[0].capacity = 1;
  assert.throws(() =>
    run("mouse.create", { code: "M002", cageId: c, dob: s.today }),
  );
  // Domain commands are transaction-bound; discard failed draft as Store does.
});
test("observations cannot confirm pregnancy and lack of baseline remains unknown", () => {
  const { s, run, m } = setup();
  const id = run("breeding.create", {
    motherId: m,
    date: s.today,
    candidateFatherIds: [],
  }).id;
  run("breeding.update", {
    id,
    action: "observe",
    date: s.today,
    evidence: "见栓",
  });
  assert.equal(s.breedings[0].status, "observing");
  assert.equal(s.breedings[0].baselineDate, null);
  assert.throws(() =>
    run("breeding.update", {
      id,
      action: "confirm",
      date: s.today,
      evidence: "",
    }),
  );
  run("breeding.update", {
    id,
    action: "confirm",
    date: s.today,
    evidence: "人工复核",
  });
  assert.equal(s.breedings[0].status, "confirmed");
  assert.equal(s.breedings[0].dueFrom, null);
});
test("litter makes exactly living count, candidate father stays candidate, batched weaning", () => {
  const { s, run, c, m } = setup();
  s.cages[0].capacity = 8;
  const father = run("mouse.create", {
    code: "DAD",
    cageId: c,
    dob: addDays(s.today, -200),
    sex: "male",
  }).id;
  const id = run("litter.create", {
    code: "L001",
    bornOn: addDays(s.today, -20),
    bornAlive: 3,
    birthTotal: 4,
    differenceNote: "历史失仔1只",
    cageId: c,
    motherId: m,
    fatherId: father,
    fatherStatus: "candidate",
    nursing: true,
    appearanceConfirmed: true,
    avatarSeed: 123,
  }).id;
  const babies = s.mice.filter((x) => x.birthLitterId === id);
  assert.equal(babies.length, 3);
  assert.equal(babies[0].fatherStatus, "candidate");
  assert.equal(babies[0].weaningStatus, "unweaned");
  const activePregnancy = run("breeding.create", {
    motherId: m,
    date: s.today,
    candidateFatherIds: [],
  }).id;
  assert.ok(activePregnancy);
  run("litter.wean", { mouseIds: [babies[0].id], date: s.today });
  assert.equal(babies[0].weaningStatus, "weaned");
  assert.equal(babies[1].weaningStatus, "unweaned");
  assert.equal(s.litters[0].nursing, true);
});
test("zero living litter creates no fictitious mice", () => {
  const { s, run, c, m } = setup();
  const n = s.mice.length;
  run("litter.create", {
    code: "L0",
    bornOn: s.today,
    bornAlive: 0,
    birthTotal: 2,
    differenceNote: "均未存活",
    cageId: c,
    motherId: m,
  });
  assert.equal(s.mice.length, n);
});
test("self ancestry, sex mismatch and descendant cycles are rejected", () => {
  const { s, run, c, m } = setup();
  assert.throws(() =>
    run("mouse.update", { id: m, motherId: m, reason: "错误" }),
  );
  const fresh = setup();
  const son = fresh.run("mouse.create", {
    code: "SON",
    cageId: fresh.c,
    dob: fresh.s.today,
    sex: "male",
    motherId: fresh.m,
  }).id;
  assert.throws(() =>
    fresh.run("mouse.update", { id: fresh.m, fatherId: son, reason: "错误" }),
  );
});
test("shared litter correction leaves stable IDs and updates all birthdays", () => {
  const { s, run, c, m } = setup();
  const id = run("litter.create", {
    code: "L",
    bornOn: addDays(s.today, -1),
    bornAlive: 2,
    cageId: c,
    motherId: m,
    appearanceConfirmed: true,
  }).id;
  const old = s.mice.filter((x) => x.birthLitterId === id).map((x) => x.id);
  run("litter.update", {
    id,
    bornOn: addDays(s.today, -2),
    reason: "复核登记日期",
  });
  assert.deepEqual(
    s.mice.filter((x) => x.birthLitterId === id).map((x) => x.id),
    old,
  );
  assert.ok(
    s.mice
      .filter((x) => x.birthLitterId === id)
      .every((x) => x.dob === addDays(s.today, -2)),
  );
});
test("appearance seed, litter similarity and archive family are stable", () => {
  assert.deepEqual(appearanceFor(233), appearanceFor(233));
  assert.equal(litterAppearance(33, 0).coat, litterAppearance(33, 1).coat);
  const { s, m } = setup();
  assert.deepEqual(commonAncestors(s, m, m), [m]);
});
test("database atomic rollback, optimistic conflict and idempotency", () => {
  const db = new Store(":memory:");
  try {
    let s = db.snapshot();
    const command = {
      type: "cage.create",
      payload: { code: "A" },
      opId: randomUUID(),
      expectedRevision: s.revision,
    };
    let result = db.execute(command);
    const id = result.result.id as string;
    assert.equal(db.execute(command).replayed, true);
    assert.equal(db.read().cages.length, 1);
    assert.throws(
      () =>
        db.execute({ ...command, opId: randomUUID(), payload: { code: "B" } }),
      /其他窗口/,
    );
    s = result.state;
    db.execute({
      type: "mouse.create",
      payload: { code: "M1", dob: s.today, cageId: id },
      expectedRevision: s.revision,
      opId: randomUUID(),
    });
    const before = JSON.stringify(db.read());
    assert.throws(() =>
      db.execute({
        type: "mouse.create",
        payload: { code: "M1", dob: s.today, cageId: id },
        expectedRevision: db.read().revision,
        opId: randomUUID(),
      }),
    );
    assert.equal(JSON.stringify(db.read()), before);
  } finally {
    db.close();
  }
});
test("batch operations rollback entirely and allow overflow with cause", () => {
  const db = new Store(":memory:");
  try {
    let s = db.snapshot();
    const run = (type: string, payload: any) => {
      const r = db.execute({
        type,
        payload,
        opId: randomUUID(),
        expectedRevision: s.revision,
      });
      s = r.state;
      return r.result;
    };
    const a = run("cage.create", { code: "A", capacity: 1 }).id;
    const b = run("cage.create", { code: "B", capacity: 1 }).id;
    const m1 = run("mouse.create", {
      code: "M1",
      dob: addDays(s.today, -1),
      cageId: a,
    }).id;
    const m2 = run("mouse.create", {
      code: "M2",
      dob: addDays(s.today, -1),
      cageId: b,
    }).id;
    assert.throws(() =>
      run("mouse.transfer", { mouseIds: [m1], cageId: b, date: s.today }),
    );
    assert.equal(db.read().mice[0].cageId, a);
    run("mouse.transfer", {
      mouseIds: [m1],
      cageId: b,
      date: s.today,
      capacityReason: "如实补录现状",
    });
    assert.equal(db.read().mice.filter((m) => m.cageId === b).length, 2);
    assert.ok(m2);
  } finally {
    db.close();
  }
});
test("notification nodes observe quiet hours, no future age threshold and paused cleaning", () => {
  const { s, run, c } = setup();
  s.settings.timezone = "UTC";
  s.settings.quietStart = "22:00";
  s.settings.quietEnd = "08:00";
  reconcile(s, new Date(s.today + "T09:00:00Z"));
  assert.equal(notificationRefs(s, new Date(s.today + "T23:00:00Z")).length, 0);
  const refs = notificationRefs(s, new Date(s.today + "T09:00:00Z"));
  assert.ok(refs.some((x) => x.reminderId.endsWith(":140")));
  run("plan.set", {
    cageIds: [c],
    intervalDays: 7,
    firstDueOn: s.today,
    paused: true,
  });
  reconcile(s, new Date(s.today + "T09:00:00Z"));
  assert.ok(
    !notificationRefs(s, new Date(s.today + "T09:00:00Z")).some((x) =>
      x.reminderId.startsWith("clean:"),
    ),
  );
});
test("deferred interval changes keep current due date and still apply pause", () => {
  const { s, run, c } = setup();
  run("plan.set", { cageIds: [c], intervalDays: 7, firstDueOn: s.today });
  reconcile(s);
  const o = s.occurrences[0];
  run("plan.set", {
    cageIds: [c],
    intervalDays: 10,
    apply: "next",
    paused: true,
  });
  reconcile(s);
  assert.equal(s.cages[0].plan?.intervalDays, 7);
  assert.equal(s.cages[0].plan?.futureIntervalDays, 10);
  assert.equal(o.scheduledOn, s.today);
  assert.equal(o.status, "paused");
});
test("empty erroneous cages can be deleted, and archiving cancels future care", () => {
  const s = emptyState();
  const id = applyCommand(s, "cage.create", { code: "EMPTY" }).id;
  applyCommand(s, "cage.delete", { id });
  assert.equal(s.cages.length, 0);
  const c = applyCommand(s, "cage.create", { code: "CARE" }).id;
  applyCommand(s, "care.plan", { cageIds: [c], kind: "water", date: s.today });
  applyCommand(s, "cage.archive", { id: c });
  reconcile(s);
  assert.equal(s.careTasks[0].status, "cancelled");
  assert.ok(!s.reminders.some((r) => r.status === "pending"));
});
