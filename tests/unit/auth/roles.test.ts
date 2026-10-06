import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNT_ROLES, hasMinimumRole, isAccountRole } from "#/auth/roles.js";

test("roles are hierarchical: admin > seller > buyer", () => {
  const expected = {
    buyer: { buyer: true, seller: false, admin: false },
    seller: { buyer: true, seller: true, admin: false },
    admin: { buyer: true, seller: true, admin: true },
  } as const;

  for (const actual of ACCOUNT_ROLES) {
    for (const required of ACCOUNT_ROLES) {
      assert.equal(hasMinimumRole(actual, required), expected[actual][required], `${actual} >= ${required}`);
    }
  }
});

test("isAccountRole accepts only known roles", () => {
  assert.equal(isAccountRole("seller"), true);
  assert.equal(isAccountRole("superadmin"), false);
  assert.equal(isAccountRole(undefined), false);
});
