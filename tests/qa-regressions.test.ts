import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store.js";
import { DomainError } from "../server/domain.js";
import { addDays } from "../shared/dates.js";

function fixture(t: TestContext) {
  const db = new Store(":memory:");
  t.after(() => db.close());
  const run = (type: string, payload: Record<string, unknown>) =>
    db.execute({
      type,
      payload,
      opId: randomUUID(),
      expectedRevision: db.read().revision,
    });
  const cage = run("cage.create", { code: "QA-A", capacity: 20 }).result
    .id as string;
  const today = db.read().today;
  const mouse = (code: string, extra: Record<string, unknown> = {}) =>
    run("mouse.create", {
      code,
      cageId: cage,
      dob: addDays(today, -200),
      sex: "female",
      ...extra,
    }).result.id as string;
  const rejected = (
    type: string,
    payload: Record<string, unknown>,
    field: string,
    message?: RegExp,
  ) => {
    const before = db.read();
    assert.throws(
      () => run(type, payload),
      (error) =>
        error instanceof DomainError &&
        error.field === field &&
        (!message || message.test(error.message)),
    );
    assert.deepEqual(
      db.read(),
      before,
      "Rejected command must leave every collection and revision intact",
    );
  };
  return { db, run, cage, today, mouse, rejected };
}

test("historical age thresholds stay silent, while an existing future reminder can become overdue", (t) => {
  const { db, mouse, today } = fixture(t);
  const old = mouse("OLD");
  assert.equal(
    db.read().reminders.filter((r) => r.subjectId === old).length,
    0,
  );
  const young = mouse("YOUNG", { dob: addDays(today, -69) });
  assert.equal(
    db.read().reminders.filter((r) => r.subjectId === young).length,
    2,
  );
  const later = db.snapshot(new Date(addDays(today, 3) + "T04:00:00Z"));
  const due = later.reminders.find(
    (r) => r.subjectId === young && r.kind === "age70",
  )!;
  assert.equal(due.status, "pending");
  assert.equal(due.dueOn, addDays(today, 1));
});

test("legacy registration-time overdue milestones are cancelled without clearing real overdue reminders", (t) => {
  const { db, mouse, today } = fixture(t);
  const old = mouse("OLD");
  const state = db.read();
  state.reminders.push({
    id: `age:${old}:70`,
    subjectId: old,
    kind: "age70",
    dueOn: addDays(today, -130),
    title: "old",
    status: "pending",
    handledAt: null,
    snoozedUntil: null,
    basisChanged: false,
    cancelReason: "",
  });
  db.save(state);
  assert.equal(db.snapshot().reminders[0].status, "cancelled");
});

test("birth dates have the same lower bound on mouse create, update and litter create", (t) => {
  const { run, cage, today, mouse, rejected } = fixture(t);
  rejected(
    "mouse.create",
    { code: "BAD", cageId: cage, dob: "1900-01-01" },
    "dob",
  );
  const id = mouse("VALID");
  rejected("mouse.update", { id, dob: "1999-12-31" }, "dob");
  rejected(
    "litter.create",
    { code: "BAD-L", cageId: cage, bornOn: "1900-01-01", bornAlive: 0 },
    "bornOn",
  );
  rejected(
    "mouse.create",
    { code: "FUTURE", cageId: cage, dob: addDays(today, 1) },
    "dob",
  );
  run("mouse.create", { code: "HISTORY", cageId: cage, dob: "2000-01-01" });
  const litter = run("litter.create", {
    code: "EMPTY-L",
    cageId: cage,
    bornOn: today,
    bornAlive: 0,
  }).result.id;
  rejected(
    "litter.update",
    { id: litter, bornOn: "1900-01-01", reason: "更正" },
    "bornOn",
  );
});

test("litter count errors explain the relationship and leave room for stable child codes", (t) => {
  const { run, cage, today, rejected } = fixture(t);
  rejected(
    "litter.create",
    {
      code: "BAD-COUNT",
      cageId: cage,
      bornOn: today,
      bornAlive: 5,
      birthTotal: 2,
    },
    "birthTotal",
    /总数不能少于.*活体/,
  );
  rejected(
    "litter.create",
    {
      code: "L".repeat(60),
      cageId: cage,
      bornOn: today,
      bornAlive: 1,
      appearanceConfirmed: true,
    },
    "code",
    /59/,
  );
  const created = run("litter.create", {
    code: "L".repeat(59),
    cageId: cage,
    bornOn: today,
    bornAlive: 1,
    appearanceConfirmed: true,
  });
  assert.equal(created.state.mice[0].code.length, 63);
});

test("weight requires a positive finite value and failed records do not complete their task", (t) => {
  const { db, run, cage, today, mouse, rejected } = fixture(t);
  const id = mouse("WEIGHT");
  run("care.plan", {
    cageIds: [cage],
    mouseId: id,
    date: today,
    kind: "weight",
  });
  const taskId = db.read().careTasks[0].id;
  const payload = {
    cageIds: [cage],
    mouseId: id,
    kind: "weight",
    date: today,
    taskId,
  };
  for (const value of [undefined, null, "", " ", 0, -1, 1001, "abc", Infinity])
    rejected("care.record", { ...payload, value }, "value");
  run("care.record", { ...payload, value: 0.01 });
  assert.equal(db.read().careTasks[0].status, "completed");
  assert.equal(db.read().careTasks[0].value, 0.01);
});

test("text boundaries are consistent for create and edit, and overflow never truncates", (t) => {
  const { db, run, cage, mouse, rejected } = fixture(t);
  rejected("cage.create", { code: "X".repeat(65) }, "code");
  const id = mouse("TEXT", {
    nickname: "N".repeat(40),
    notes: "A".repeat(2000),
  });
  rejected(
    "mouse.create",
    {
      code: "BAD-NICK",
      cageId: cage,
      dob: db.read().today,
      nickname: "N".repeat(41),
    },
    "nickname",
  );
  rejected("mouse.update", { id, nickname: "N".repeat(41) }, "nickname");
  rejected("mouse.update", { id, genotype: "G".repeat(121) }, "genotype");
  rejected("mouse.update", { id, notes: "A".repeat(2001) }, "notes");
  rejected(
    "care.record",
    {
      cageIds: [cage],
      date: db.read().today,
      kind: "observation",
      notes: "A".repeat(2001),
    },
    "notes",
  );
  run("mouse.update", {
    id,
    nickname: "新".repeat(40),
    notes: "记".repeat(2000),
  });
  assert.equal(db.read().mice[0].nickname.length, 40);
  assert.equal(db.read().mice[0].notes.length, 2000);
});

test("enum typos and HTML in identifiers are rejected; genotype remains plain text", (t) => {
  const { run, cage, today, mouse, rejected } = fixture(t);
  rejected("cage.create", { code: "BAD", purpose: "typo" }, "purpose");
  rejected(
    "mouse.create",
    { code: "BAD", cageId: cage, dob: today, sex: "typo" },
    "sex",
  );
  rejected(
    "mouse.create",
    { code: "BAD", cageId: cage, dob: today, weaningStatus: "typo" },
    "weaningStatus",
  );
  rejected("cage.create", { code: "<script>alert(1)</script>" }, "code");
  rejected(
    "care.record",
    { cageIds: [cage], date: today, kind: "toString" },
    "kind",
  );
  const id = mouse("合法编号-01", { genotype: "A<B & C>D" });
  assert.ok(id);
  assert.ok(run("cage.create", { code: "笼位/A_01" }).result.id);
});

test("completed tasks reject new operation IDs and preserve both planned and completion notes", (t) => {
  const { db, run, cage, today, mouse, rejected } = fixture(t);
  const id = mouse("TASK");
  const other = mouse("OTHER");
  run("care.plan", {
    cageIds: [cage],
    mouseId: id,
    date: today,
    kind: "observation",
    notes: "复查精神状态",
  });
  const taskId = db.read().careTasks[0].id;
  const payload = {
    cageIds: [cage],
    mouseId: id,
    kind: "observation",
    date: today,
    taskId,
    notes: "已复查",
  };
  rejected("care.record", { ...payload, mouseId: other }, "taskId");
  run("care.record", payload);
  const event = db.read().events.find((e) => e.type === "care.record")!;
  assert.equal(event.notes, "已复查");
  assert.equal(event.details.taskNotes, "复查精神状态");
  rejected("care.record", payload, "taskId");
  assert.equal(
    db.read().events.filter((e) => e.type === "care.record").length,
    1,
  );
});

test("young weaning needs a reason, including direct archive registration", (t) => {
  const { db, run, cage, today, mouse, rejected } = fixture(t);
  const id = mouse("BABY", { dob: today, weaningStatus: "unweaned" });
  rejected("litter.wean", { mouseIds: [id], date: today }, "exceptionReason");
  rejected("mouse.update", { id, weaningStatus: "weaned" }, "exceptionReason");
  rejected(
    "mouse.create",
    { code: "EARLY", cageId: cage, dob: today, weaningStatus: "weaned" },
    "exceptionReason",
  );
  run("litter.wean", {
    mouseIds: [id],
    date: today,
    exceptionReason: "历史操作复核补录",
  });
  assert.equal(db.read().mice[0].weaningStatus, "weaned");
  assert.equal(
    db.read().events.at(-1)?.details.exceptionReason,
    "历史操作复核补录",
  );
  const mature = mouse("READY", {
    dob: addDays(today, -18),
    weaningStatus: "unweaned",
  });
  run("litter.wean", { mouseIds: [mature], date: today });
});

test("unweaned family transfer accepts moving together and records exceptions when separating", (t) => {
  const { db, run, today, mouse, rejected } = fixture(t);
  const mother = mouse("MOTHER");
  const baby = mouse("BABY", {
    dob: today,
    motherId: mother,
    weaningStatus: "unweaned",
  });
  const target = run("cage.create", { code: "QA-B" }).result.id as string;
  rejected(
    "mouse.transfer",
    { mouseIds: [baby], cageId: target, date: today },
    "exceptionReason",
  );
  rejected(
    "mouse.transfer",
    { mouseIds: [mother], cageId: target, date: today },
    "exceptionReason",
  );
  run("mouse.transfer", {
    mouseIds: [mother, baby],
    cageId: target,
    date: today,
  });
  assert.ok(db.read().mice.every((m) => m.cageId === target));
  const third = run("cage.create", { code: "QA-C" }).result.id as string;
  run("mouse.transfer", {
    mouseIds: [baby],
    cageId: third,
    date: today,
    exceptionReason: "实际寄养转移待核实",
  });
  assert.equal(
    db.read().events.at(-1)?.details.exceptionReason,
    "实际寄养转移待核实",
  );
});

test("litter birth-date corrections cannot bypass the early-weaning reason", (t) => {
  const { db, run, cage, today, rejected } = fixture(t);
  const litter = run("litter.create", {
    code: "L-CORRECT",
    cageId: cage,
    bornOn: addDays(today, -20),
    bornAlive: 1,
    appearanceConfirmed: true,
  }).result.id;
  const id = db.read().mice[0].id;
  run("litter.wean", { mouseIds: [id], date: today });
  rejected(
    "litter.update",
    { id: litter, bornOn: today, reason: "更正日期" },
    "exceptionReason",
  );
  run("litter.update", {
    id: litter,
    bornOn: today,
    reason: "更正日期",
    exceptionReason: "核实历史特殊操作",
  });
  assert.equal(
    db.read().events.at(-1)?.details.exceptionReason,
    "核实历史特殊操作",
  );
});

test("overflow edits need a new reason only when capacity decreases", (t) => {
  const { db, run, cage, mouse, rejected } = fixture(t);
  mouse("ONE");
  mouse("TWO");
  mouse("THREE");
  run("cage.update", { id: cage, capacity: 1, capacityReason: "临时超容量" });
  run("cage.update", { id: cage, nickname: "改名" });
  run("cage.update", { id: cage, capacity: 2 });
  rejected("cage.update", { id: cage, capacity: 1 }, "capacityReason");
  run("cage.update", { id: cage, capacity: 3 });
  assert.equal(db.read().cages[0].capacity, 3);
});

test("archived erroneous cages can be removed, but actual business history stays protected", (t) => {
  const { db, run, cage, today, rejected } = fixture(t);
  run("cage.update", { id: cage, nickname: "误录" });
  run("cage.archive", { id: cage });
  run("cage.delete", { id: cage });
  assert.equal(db.read().cages.length, 0);
  assert.equal(db.read().events.length, 0);
  const used = run("cage.create", { code: "USED" }).result.id as string;
  run("cleaning.complete", { cageIds: [used], date: today });
  run("cage.archive", { id: used });
  rejected("cage.delete", { id: used }, "", /已归档.*业务历史/);
});

test("rescheduling cannot create a past due date and keeps the original instance", (t) => {
  const { db, run, cage, today, mouse, rejected } = fixture(t);
  mouse("PLAN");
  run("plan.set", {
    cageIds: [cage],
    intervalDays: 7,
    firstDueOn: addDays(today, -2),
  });
  const original = db.read().occurrences[0];
  rejected(
    "plan.reschedule",
    { id: original.id, date: addDays(today, -1), reason: "调整" },
    "date",
  );
  run("plan.reschedule", { id: original.id, date: today, reason: "今天处理" });
  const updated = db.read().occurrences[0];
  assert.equal(updated.id, original.id);
  assert.equal(updated.originalDueOn, addDays(today, -2));
  assert.equal(updated.scheduledOn, today);
});

test("editing a registered parent reports the edited sex field and names the child", (t) => {
  const { today, mouse, rejected } = fixture(t);
  const mother = mouse("MOTHER");
  mouse("CHILD", { dob: today, motherId: mother });
  rejected("mouse.update", { id: mother, sex: "male" }, "sex", /CHILD.*母亲/);
});
