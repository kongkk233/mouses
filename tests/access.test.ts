import test from "node:test";
import assert from "node:assert/strict";
import { issueSession, verifySession } from "../server/access.js";
test("signed sessions expire, reject edits and invalidate after password change", () => {
  const t = Date.now(),
    token = issueSession("fixture-password", t);
  assert.equal(verifySession(token, "fixture-password", t), true);
  assert.equal(verifySession(token + "x", "fixture-password", t), false);
  assert.equal(verifySession(token, "changed-password", t), false);
  assert.equal(
    verifySession(token, "fixture-password", t + 8 * 86400000),
    false,
  );
  assert.equal(verifySession("bad", "fixture-password", t), false);
});
