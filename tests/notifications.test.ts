import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.js";
import { emptyState, applyCommand, reconcile } from "../server/domain.js";
import {
  planDeliveries,
  notificationRefs,
  PushService,
} from "../server/notifications.js";
import { addDays } from "../shared/dates.js";
function fixture() {
  const store = new Store(":memory:"),
    s = emptyState();
  s.settings.timezone = "UTC";
  s.settings.reminderTime = "09:00";
  const now = new Date(s.today + "T10:00:00Z");
  const c = applyCommand(s, "cage.create", { code: "A" }).id;
  for (let i = 0; i < 2; i++)
    applyCommand(s, "mouse.create", {
      code: `M${i}`,
      cageId: c,
      dob: addDays(s.today, -70),
      sex: "female",
    });
  reconcile(s, now);
  store.save(s);
  store.db
    .prepare(
      "INSERT INTO subscriptions(id,payload,active,created_at) VALUES ('device','{}',1,?)",
    )
    .run(now.toISOString());
  return { store, s, now, c };
}
test("persistent queue batches, deduplicates, and does not expose genotypes", () => {
  const { store, s, now } = fixture();
  try {
    planDeliveries(store, s, now);
    planDeliveries(store, s, now);
    let rows = store.db.prepare("SELECT * FROM deliveries").all() as any[];
    assert.equal(rows.length, 1);
    assert.equal(JSON.parse(rows[0].refs).length, 2);
    assert.match(JSON.parse(rows[0].payload).body, /2 项/);
    assert.ok(!rows[0].payload.includes("genotype"));
    store.db.prepare("UPDATE deliveries SET status='accepted'").run();
    const next = new Date(now.getTime() + 86400000);
    reconcile(s, next);
    planDeliveries(store, s, next);
    assert.equal(
      (store.db.prepare("SELECT count(*) AS n FROM deliveries").get() as any).n,
      1,
      "non-cleaning reminders do not repeat daily",
    );
  } finally {
    store.close();
  }
});
test("handling part of a batch requeues still-needed items without losing them", () => {
  const { store, s, now } = fixture();
  try {
    planDeliveries(store, s, now);
    s.reminders[0].status = "handled";
    planDeliveries(store, s, now);
    const rows = store.db
      .prepare("SELECT status,refs FROM deliveries")
      .all() as any[];
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((r) => r.status === "pending").length, 1);
    assert.equal(
      JSON.parse(rows.find((r) => r.status === "pending").refs).length,
      1,
    );
  } finally {
    store.close();
  }
});
test("explicit snooze can notify again after an earlier accepted notification", () => {
  const { store, s, now } = fixture();
  try {
    planDeliveries(store, s, now);
    store.db.prepare("UPDATE deliveries SET status='accepted'").run();
    s.reminders[0].snoozedUntil = new Date(
      now.getTime() + 3600000,
    ).toISOString();
    planDeliveries(store, s, now);
    assert.equal(
      (store.db.prepare("SELECT count(*) AS n FROM deliveries").get() as any).n,
      1,
    );
    planDeliveries(store, s, new Date(now.getTime() + 3600001));
    const rows = store.db.prepare("SELECT * FROM deliveries").all() as any[];
    assert.equal(rows.length, 2);
    assert.equal(JSON.parse(rows[1].refs).length, 1);
  } finally {
    store.close();
  }
});
test("quiet-hours reminders scheduled at night defer to next morning even with overdue off", () => {
  const { store, s, c } = fixture();
  try {
    applyCommand(s, "plan.set", {
      cageIds: [c],
      intervalDays: 7,
      firstDueOn: s.today,
      reminderTime: "23:00",
      overdue: false,
      aheadDays: 0,
    });
    reconcile(s, new Date(s.today + "T23:00:00Z"));
    assert.equal(
      notificationRefs(s, new Date(s.today + "T23:00:00Z")).length,
      0,
    );
    const morning = new Date(addDays(s.today, 1) + "T08:00:00Z");
    reconcile(s, morning);
    assert.ok(
      notificationRefs(s, morning).some(
        (ref) => ref.reminderId.startsWith("clean:") && ref.node === "due",
      ),
    );
  } finally {
    store.close();
  }
});
test("changed or completed occurrences cancel obsolete queue revisions", () => {
  const { store, s, c, now } = fixture();
  try {
    applyCommand(s, "plan.set", {
      cageIds: [c],
      intervalDays: 7,
      firstDueOn: s.today,
    });
    reconcile(s, now);
    planDeliveries(store, s, now);
    applyCommand(s, "cleaning.complete", { cageIds: [c], date: s.today });
    reconcile(s, now);
    planDeliveries(store, s, now);
    const pending = store.db
      .prepare("SELECT refs FROM deliveries WHERE status='pending'")
      .all() as any[];
    assert.ok(
      pending.every(
        (row) =>
          !JSON.parse(row.refs).some((r: any) =>
            r.reminderId.startsWith("clean:"),
          ),
      ),
    );
  } finally {
    store.close();
  }
});
test("push endpoints reject private addresses and invalid subscription keys", () => {
  const store = new Store(":memory:");
  try {
    const push = new PushService(store);
    assert.throws(() =>
      push.subscribe({
        endpoint: "https://127.0.0.1/internal",
        keys: { p256dh: "x", auth: "y" },
      }),
    );
    assert.throws(() =>
      push.subscribe({
        endpoint: "https://fcm.googleapis.com/x",
        keys: { p256dh: "x", auth: "y" },
      }),
    );
  } finally {
    store.close();
  }
});
