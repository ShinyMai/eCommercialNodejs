import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import mongoose, { Types } from "mongoose";
import { AccountModel } from "#/models/account.model.js";
import { CartModel } from "#/models/cart.model.js";
import { InventoryModel } from "#/models/inventory.model.js";
import { ProductModel } from "#/models/product.model.js";
import CartService from "#/services/cart.service.js";
import { newId, queryOf } from "../../helpers/fixtures.js";

const accountId = newId();
const productId = new Types.ObjectId();
const sellerId = new Types.ObjectId();

type CartItem = { product: Types.ObjectId; quantity: number };

/** A hydrated-cart stand-in whose `save` can be scripted to fail. */
const cartDocument = (items: CartItem[], saveImpl: () => Promise<void> = async () => undefined) => {
  const cart = {
    cart_items: items.map((item) => ({ ...item })),
    save: async () => {
      await saveImpl();
      return cart;
    },
  };
  return cart;
};

const mockAvailability = (
  t: TestContext,
  { stock = 5, published = true, sellerActive = true }: { stock?: number; published?: boolean; sellerActive?: boolean } = {},
) => {
  t.mock.method(ProductModel, "findById", () =>
    queryOf({ product_seller: sellerId, isDraft: !published, isPublished: published }),
  );
  t.mock.method(AccountModel, "exists", () => queryOf(sellerActive ? { _id: sellerId } : null));
  t.mock.method(InventoryModel, "findOne", () => queryOf({ inven_stock: stock }));
};

test("adding to an account without a cart creates one", async (t) => {
  mockAvailability(t);
  t.mock.method(CartModel, "findOne", () => queryOf(null));
  const create = t.mock.method(CartModel, "create", async (doc: unknown) => doc);

  const created: any = await CartService.addProductToCart(accountId, productId.toHexString(), 2);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(String(created.cart_account), accountId);
  assert.deepEqual(created.cart_items, [{ product: productId, quantity: 2 }]);
});

test("adding an existing product increments its quantity within stock", async (t) => {
  mockAvailability(t, { stock: 5 });
  const cart = cartDocument([{ product: productId, quantity: 3 }]);
  t.mock.method(CartModel, "findOne", () => queryOf(cart));

  await CartService.addProductToCart(accountId, productId.toHexString(), 2);
  assert.equal(cart.cart_items[0].quantity, 5);

  await assert.rejects(CartService.addProductToCart(accountId, productId.toHexString(), 1), /exceeds available stock/);
});

test("unavailable products cannot be added", async (t) => {
  t.mock.method(CartModel, "findOne", () => queryOf(null));

  mockAvailability(t, { published: false });
  await assert.rejects(CartService.addProductToCart(accountId, productId.toHexString(), 1), /not available/);

  mockAvailability(t, { sellerActive: false });
  await assert.rejects(CartService.addProductToCart(accountId, productId.toHexString(), 1), /seller is not active/);
});

test("quantities and IDs are validated", async () => {
  await assert.rejects(CartService.addProductToCart(accountId, productId.toHexString(), 0), /positive safe integer/);
  await assert.rejects(CartService.updateProductQuantity(accountId, productId.toHexString(), -1), /non-negative/);
  await assert.rejects(CartService.addProductToCart(accountId, "bad", 1), { name: "BadRequestError" });
});

test("setting quantity to zero removes the product", async (t) => {
  const cart = cartDocument([{ product: productId, quantity: 3 }]);
  t.mock.method(CartModel, "findOne", () => queryOf(cart));

  await CartService.updateProductQuantity(accountId, productId.toHexString(), 0);
  assert.deepEqual(cart.cart_items, []);
  await assert.rejects(CartService.removeProductFromCart(accountId, productId.toHexString()), /not in the cart/);
});

test("concurrent modification is retried, then reported as a conflict", async (t) => {
  const versionError = () => Object.create(mongoose.Error.VersionError.prototype);
  let failures = 1;
  const cart = cartDocument([{ product: productId, quantity: 1 }], async () => {
    if (failures-- > 0) throw versionError();
  });
  const findOne = t.mock.method(CartModel, "findOne", () => queryOf(cart));

  await CartService.clearCart(accountId);
  assert.equal(findOne.mock.callCount(), 2, "re-read after the version conflict");

  failures = Infinity;
  await assert.rejects(CartService.clearCart(accountId), /modified concurrently/);
});

test("getCartItems joins current prices and totals", async (t) => {
  const other = new Types.ObjectId();
  t.mock.method(CartModel, "findOne", () =>
    queryOf({ cart_items: [{ product: productId, quantity: 2 }, { product: other, quantity: 1 }] }),
  );
  t.mock.method(ProductModel, "find", () => queryOf([{ _id: productId, product_price: 10 }]));

  const result = await CartService.getCartItems(accountId);
  assert.equal(result.cart_count_products, 2);
  assert.equal(result.cart_total_quantity, 3);
  assert.deepEqual(
    result.cart_items.map((item) => item.product_price),
    [10, null],
  );
});

test("a missing cart is reported as not found", async (t) => {
  t.mock.method(CartModel, "findOne", () => queryOf(null));
  await assert.rejects(CartService.getCartItems(accountId), { name: "NotFoundError" });
  await assert.rejects(CartService.clearCart(accountId), { name: "NotFoundError" });
});
