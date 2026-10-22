import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCreateBroadcastPayload, validateInboxCursor } from "#/validators/notification.validator.js";

const valid = { noti_type: "promotion", noti_title: "  Sale  ", noti_content: "50% off" };

test("broadcast payload is trimmed and defaults to every role, published now, never expiring", () => {
  const before = Date.now();
  const payload = validateCreateBroadcastPayload(valid);

  assert.equal(payload.noti_title, "Sale");
  assert.deepEqual(payload.noti_audience, []);
  assert.deepEqual(payload.noti_data, {});
  assert.equal(payload.expire_at, null);
  assert.ok(payload.publish_at.getTime() >= before);
});

test("broadcast audience is de-duplicated and limited to known roles", () => {
  assert.deepEqual(validateCreateBroadcastPayload({ ...valid, noti_audience: ["buyer", "buyer"] }).noti_audience, [
    "buyer",
  ]);
  assert.throws(() => validateCreateBroadcastPayload({ ...valid, noti_audience: ["guest"] }), /noti_audience/);
});

test("broadcast payload rejects invalid values", () => {
  assert.throws(() => validateCreateBroadcastPayload({ ...valid, noti_type: "order_placed" }), /noti_type/);
  assert.throws(() => validateCreateBroadcastPayload({ ...valid, noti_title: " " }), /noti_title is required/);
  assert.throws(() => validateCreateBroadcastPayload({ ...valid, noti_data: { nested: {} } }), /noti_data.nested/);
  assert.throws(
    () => validateCreateBroadcastPayload({ ...valid, publish_at: "2026-10-02", expire_at: "2026-10-01" }),
    /expire_at must be after publish_at/,
  );
});

test("inbox cursor defaults to now and must be a date", () => {
  assert.ok(validateInboxCursor(undefined) instanceof Date);
  assert.equal(validateInboxCursor("2026-10-01T00:00:00.000Z").toISOString(), "2026-10-01T00:00:00.000Z");
  assert.throws(() => validateInboxCursor("yesterday"), /cursor must be a valid date/);
});
