import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import {
  getPagination,
  getQueryString,
  getSelectData,
  isDuplicateKeyError,
  sum,
  validateIdString,
  validateNonEmptyArray,
  validateObjectId,
  validatePositiveSafeInteger,
  validateRecord,
  validateUniqueValue,
  withSession,
} from "#/utils/index.js";

test("getPagination applies defaults, clamps the limit and computes skip", () => {
  assert.deepEqual(getPagination({}), { limit: 20, page: 1, skip: 0 });
  assert.deepEqual(getPagination({ limit: "10", page: "3" }), { limit: 10, page: 3, skip: 20 });
  assert.deepEqual(getPagination({ limit: "500" }), { limit: 100, page: 1, skip: 0 });
  assert.deepEqual(getPagination({ limit: "-1", page: "abc" }), { limit: 20, page: 1, skip: 0 });
  assert.deepEqual(getPagination({ limit: "1.5", page: "0" }), { limit: 20, page: 1, skip: 0 });
});

test("getQueryString ignores non-string and blank values", () => {
  assert.equal(getQueryString({ q: "  shoes " }, "q"), "shoes");
  assert.equal(getQueryString({ q: "   " }, "q"), undefined);
  assert.equal(getQueryString({ q: ["a", "b"] }, "q"), undefined);
  assert.equal(getQueryString({}, "q"), undefined);
});

test("getSelectData builds a projection", () => {
  assert.deepEqual(getSelectData(["a", "b"]), { a: 1, b: 1 });
  assert.deepEqual(getSelectData(), {});
});

test("sum adds the picked numbers", () => {
  assert.equal(sum([{ n: 2 }, { n: 3 }], (entry) => entry.n), 5);
  assert.equal(sum([], () => 1), 0);
});

test("ID validators accept 24-char hex strings only", () => {
  const id = new Types.ObjectId().toHexString();
  assert.equal(validateIdString(id.toUpperCase(), "id"), id);
  assert.throws(() => validateIdString("abc", "id"), { name: "BadRequestError" });
  assert.throws(() => validateIdString(123, "id"), { name: "BadRequestError" });

  assert.ok(validateObjectId(id, "id") instanceof Types.ObjectId);
  assert.throws(() => validateObjectId("bad", "productId"), /Invalid productId: bad/);
});

test("primitive validators reject invalid shapes", () => {
  assert.deepEqual(validateRecord({ a: 1 }, "x"), { a: 1 });
  for (const bad of [null, [], "str"]) assert.throws(() => validateRecord(bad, "x"), { name: "BadRequestError" });

  assert.deepEqual(validateNonEmptyArray([1], "x"), [1]);
  assert.throws(() => validateNonEmptyArray([], "x"), { name: "BadRequestError" });

  assert.equal(validatePositiveSafeInteger(3, "q"), 3);
  for (const bad of [0, -1, 1.5, "2", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validatePositiveSafeInteger(bad, "q"), { name: "BadRequestError" });
  }

  const seen = new Set<string>();
  validateUniqueValue("a", seen, "id");
  assert.throws(() => validateUniqueValue("a", seen, "id"), /Duplicate id/);
});

test("isDuplicateKeyError detects Mongo error code 11000", () => {
  assert.equal(isDuplicateKeyError(Object.assign(new Error("dup"), { code: 11000 })), true);
  assert.equal(isDuplicateKeyError(Object.assign(new Error("other"), { code: 1 })), false);
  assert.equal(isDuplicateKeyError({ code: 11000 }), false);
});

test("withSession attaches a session only when one is provided", () => {
  const calls: unknown[] = [];
  const query = { session: (value: unknown) => calls.push(value) };
  withSession(query);
  assert.equal(calls.length, 0);
  const session = {} as never;
  assert.equal(withSession(query, session), query);
  assert.deepEqual(calls, [session]);
});
