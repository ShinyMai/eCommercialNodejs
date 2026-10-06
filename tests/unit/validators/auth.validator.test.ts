import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCredentials, parseSignUpPayload } from "#/validators/auth.validator.js";

const strongPassword = "correct horse battery staple";

test("sign-up input is trimmed and the email normalized", () => {
  const payload = parseSignUpPayload({ name: "  Example  ", email: "  OWNER@EXAMPLE.COM ", password: strongPassword });
  assert.deepEqual(payload, { name: "Example", email: "owner@example.com", password: strongPassword });
});

test("sign-up enforces password length and the bcrypt 72-byte limit", () => {
  assert.throws(
    () => parseSignUpPayload({ name: "Shop", email: "a@b.co", password: "short" }),
    /at least 8 characters/,
  );
  assert.throws(() => parseCredentials({ email: "a@b.co", password: "🔥".repeat(19) }), /72 UTF-8 bytes/);
});

test("login does not enforce strength but requires both fields", () => {
  assert.deepEqual(parseCredentials({ email: "A@B.CO", password: "x" }), { email: "a@b.co", password: "x" });
  assert.throws(() => parseCredentials({ email: "a@b.co" }), /Password is required/);
  assert.throws(() => parseCredentials({ password: "x" }), /Email is required/);
  assert.throws(() => parseCredentials({ email: "not-an-email", password: "x" }), /Email is invalid/);
  assert.throws(() => parseCredentials(null as never), /Email is required/);
});

test("name is required and bounded", () => {
  assert.throws(() => parseSignUpPayload({ name: "  ", email: "a@b.co", password: strongPassword }), /Name is required/);
  assert.throws(
    () => parseSignUpPayload({ name: "x".repeat(151), email: "a@b.co", password: strongPassword }),
    /Name must not exceed 150 characters/,
  );
});

test("seller registration requires a store profile", () => {
  const base = { name: "Seller", email: "seller@example.com", password: strongPassword };
  assert.throws(() => parseSignUpPayload(base, "seller"), /Store name is required/);
  assert.throws(
    () => parseSignUpPayload({ ...base, storeName: "Store", storeDescription: 1 as never }, "seller"),
    /Store description must be a string/,
  );

  const seller = parseSignUpPayload({ ...base, storeName: " Seller Store ", storeDescription: " Best " }, "seller");
  assert.deepEqual(seller.sellerProfile, { storeName: "Seller Store", description: "Best" });
  assert.equal(parseSignUpPayload({ ...base, storeName: "Ignored" }).sellerProfile, undefined);
});
