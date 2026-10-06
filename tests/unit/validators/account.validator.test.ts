import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNewSellerProfile, parseProfileUpdate } from "#/validators/account.validator.js";

test("profile update trims text fields", () => {
  assert.deepEqual(parseProfileUpdate({ name: " Ann ", phone: " 0123 " }, false), { name: "Ann", phone: "0123" });
});

test("profile update rejects empty or unsupported payloads", () => {
  assert.throws(() => parseProfileUpdate(null as never, false), /must be an object/);
  assert.throws(() => parseProfileUpdate({}, false), /No supported profile fields/);
  assert.throws(() => parseProfileUpdate({ name: "  " }, false), /name cannot be empty/);
  assert.throws(() => parseProfileUpdate({ phone: 1 as never }, false), /phone must be a string/);
});

test("only sellers may edit seller profile fields", () => {
  assert.throws(() => parseProfileUpdate({ sellerProfile: { storeName: "S" } }, false), { name: "ForbiddenError" });
  assert.deepEqual(parseProfileUpdate({ sellerProfile: { storeName: " S ", description: " D " } }, true), {
    "sellerProfile.storeName": "S",
    "sellerProfile.description": "D",
  });
  assert.throws(() => parseProfileUpdate({ sellerProfile: { storeName: "" } }, true), /storeName cannot be empty/);
});

test("promoting to seller requires a store name", () => {
  assert.throws(() => parseNewSellerProfile(undefined), /sellerProfile is required/);
  assert.throws(() => parseNewSellerProfile({ storeName: " " }), /storeName is required/);
  assert.deepEqual(parseNewSellerProfile({ storeName: " Shop " }), { storeName: "Shop", description: "" });
});
