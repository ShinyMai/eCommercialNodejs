import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountModel } from "#/models/account.model.js";
import { DiscountModel, DISCOUNT_TYPES } from "#/models/discount.model.js";
import { OrderModel, ORDER_STATUSES } from "#/models/order.model.js";
import { PRODUCT_TYPES, ProductModel, toProductSlug } from "#/models/product.model.js";
import { UserProfileModel } from "#/models/userProfile.model.js";

test("account credentials and user profile data use separate schemas", () => {
  for (const path of ["email", "password", "role"]) assert.ok(AccountModel.schema.path(path), path);
  assert.deepEqual(AccountModel.schema.path("status").options.enum, ["pending", "active", "inactive"]);
  assert.equal(AccountModel.schema.path("name"), undefined);
  assert.equal(AccountModel.schema.path("sellerProfile"), undefined);

  for (const path of ["account", "name", "sellerProfile"]) assert.ok(UserProfileModel.schema.path(path), path);
  assert.equal(UserProfileModel.schema.path("email"), undefined);
  assert.equal(UserProfileModel.schema.path("password"), undefined);
});

test("secrets and internal flags are hidden by default", () => {
  assert.equal(AccountModel.schema.path("password").options.select, false);
  assert.equal(OrderModel.schema.path("requestHash").options.select, false);
  assert.equal(ProductModel.schema.path("isPublished").options.select, false);
});

test("schema enums are driven by exported constants", () => {
  assert.deepEqual(ProductModel.schema.path("product_type").options.enum, PRODUCT_TYPES);
  assert.deepEqual(DiscountModel.schema.path("discount_type").options.enum, DISCOUNT_TYPES);
  assert.deepEqual(OrderModel.schema.path("status").options.enum, ORDER_STATUSES);
});

test("product slugs are lower-case and URL safe", () => {
  assert.equal(toProductSlug("Áo Thun Basic 2026"), "ao-thun-basic-2026");
});
