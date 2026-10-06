import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseCreateProductInput,
  parseSellerProductStatus,
  parseSetPublicationInput,
  parseUpdateProductInput,
  type CreateProductInput,
} from "#/validators/product.validator.js";

const clothing = (): CreateProductInput => ({
  product_name: "  Basic Tee ",
  product_thumbnail: "https://cdn.example.com/tee.png",
  product_price: 19.5,
  product_quantity: 10,
  product_type: "Clothing",
  product_attributes: { brand: "Acme", size: "M", material: "Cotton" },
});

test("create input is normalized and keeps only the attributes for its type", () => {
  const parsed = parseCreateProductInput({
    ...clothing(),
    product_attributes: { brand: " Acme ", size: "M", material: "Cotton", color: "ignored" },
  });
  assert.equal(parsed.product_name, "Basic Tee");
  assert.equal(parsed.product_description, "");
  assert.deepEqual(parsed.product_attributes, { brand: "Acme", size: "M", material: "Cotton" });
  assert.deepEqual(parsed.product_variations, []);
});

test("create input rejects invalid values", () => {
  const cases: [Partial<CreateProductInput>, RegExp][] = [
    [{ product_type: "Food" as never }, /product_type must be one of/],
    [{ product_price: -1 }, /product_price must be a non-negative number/],
    [{ product_quantity: 1.5 }, /product_quantity must be an integer/],
    [{ product_name: "" }, /product_name is required/],
    [{ product_attributes: { brand: "Acme", size: "M" } }, /product_attributes.material is required/],
    [{ product_type: "Electronics" }, /product_attributes.manufacturer is required/],
  ];
  for (const [override, message] of cases) {
    assert.throws(() => parseCreateProductInput({ ...clothing(), ...override }), message);
  }
});

test("update input regenerates the slug and forbids changing the type", () => {
  assert.deepEqual(parseUpdateProductInput({ product_name: "New Name" }, "Clothing"), {
    product_name: "New Name",
    product_slug: "new-name",
  });
  assert.throws(() => parseUpdateProductInput({ product_type: "Electronics" }, "Clothing"), /cannot be changed/);
  assert.throws(() => parseUpdateProductInput({}, "Clothing"), /No supported product fields/);
});

test("publication input accepts the legacy product_id alias", () => {
  assert.deepEqual(parseSetPublicationInput({ product_id: ["a"], isPublished: false }), {
    productIds: ["a"],
    isPublished: false,
  });
  assert.throws(() => parseSetPublicationInput({ productIds: ["a"] } as never), /productIds and isPublished/);
  assert.throws(() => parseSetPublicationInput({ productIds: [1] as never, isPublished: true }), /productIds/);
});

test("seller product status defaults to all", () => {
  assert.equal(parseSellerProductStatus(undefined), "all");
  assert.equal(parseSellerProductStatus("draft"), "draft");
  assert.throws(() => parseSellerProductStatus("deleted"), /status must be/);
});
