"use strict";

import mongoose, { Types } from "mongoose";
import { validateObjectId } from "#/common/utils/index.js";
import { BadRequestError, ConflictRequestError, NotFoundError } from "#/core/error.response.js";
import { AccountModel } from "#/models/account.model.js";
import { CartModel } from "#/models/cart.model.js";
import { InventoryModel } from "#/models/inventory.model.js";
import { ProductModel } from "#/models/products.model.js";

const MAX_CART_ITEMS = 100;
const MAX_WRITE_ATTEMPTS = 3;

const parseAccountId = (accountId: string) => validateObjectId(accountId, "accountId");
const parseProductId = (productId: string) => validateObjectId(productId, "productId");

const parseCartIds = (accountId: string, productId: string) => ({
  accountObjectId: parseAccountId(accountId),
  productObjectId: parseProductId(productId),
});

const validateQuantity = (quantity: number, allowZero = false) => {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(quantity) || quantity < minimum) {
    throw new BadRequestError(
      allowZero ? "quantity must be a non-negative safe integer" : "quantity must be a positive safe integer",
    );
  }
};

const validateProductAvailability = async (productId: Types.ObjectId, requestedQuantity: number) => {
  const product = await ProductModel.findById(productId).select("product_seller +isDraft +isPublished").lean().exec();

  if (!product) {
    throw new NotFoundError("Product not found");
  }
  if (product.isDraft !== false || product.isPublished !== true) {
    throw new ConflictRequestError("Product is not available for purchase");
  }

  const [sellerExists, inventory] = await Promise.all([
    AccountModel.exists({
      _id: product.product_seller,
      role: { $in: ["seller", "admin"] },
      status: "active",
    }),
    InventoryModel.findOne({
      inven_productId: productId,
      inven_sellerId: product.product_seller,
    })
      .select("inven_stock")
      .lean()
      .exec(),
  ]);

  if (!sellerExists) {
    throw new ConflictRequestError("Product seller is not active");
  }
  if (!inventory) {
    throw new ConflictRequestError("Product inventory is not available");
  }
  if (requestedQuantity > inventory.inven_stock) {
    throw new ConflictRequestError(`Requested quantity exceeds available stock (${inventory.inven_stock})`);
  }
};

const isRetryableCartWriteError = <T>(error: T) =>
  error instanceof mongoose.Error.VersionError ||
  (error instanceof Error && "code" in error && (error as Error & { code?: number }).code === 11_000);

const withCartWriteRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableCartWriteError(error)) throw error;
    }
  }

  throw new ConflictRequestError("Cart was modified concurrently; please retry");
};

class CartService {
  static async addProductToCart(accountId: string, productId: string, quantity: number) {
    validateQuantity(quantity);
    const { accountObjectId, productObjectId } = parseCartIds(accountId, productId);

    return withCartWriteRetry(async () => {
      const accountCart = await CartModel.findOne({ cart_account: accountObjectId }).exec();
      const existingItemIndex = accountCart?.cart_items.findIndex((item) => item.product.equals(productObjectId)) ?? -1;
      const resultingQuantity =
        existingItemIndex === -1 ? quantity : accountCart!.cart_items[existingItemIndex].quantity + quantity;

      if (accountCart && existingItemIndex === -1 && accountCart.cart_items.length >= MAX_CART_ITEMS) {
        throw new ConflictRequestError(`Cart cannot contain more than ${MAX_CART_ITEMS} distinct products`);
      }

      await validateProductAvailability(productObjectId, resultingQuantity);

      if (!accountCart) {
        return CartModel.create({
          cart_account: accountObjectId,
          cart_items: [{ product: productObjectId, quantity }],
        });
      }

      if (existingItemIndex === -1) {
        accountCart.cart_items.push({ product: productObjectId, quantity });
      } else {
        accountCart.cart_items[existingItemIndex].quantity = resultingQuantity;
      }

      return accountCart.save();
    });
  }

  // Set product quantity; quantity zero removes the product.
  static async updateProductQuantity(accountId: string, productId: string, quantity: number) {
    validateQuantity(quantity, true);
    const { accountObjectId, productObjectId } = parseCartIds(accountId, productId);

    return withCartWriteRetry(async () => {
      const accountCart = await CartModel.findOne({ cart_account: accountObjectId }).exec();
      if (!accountCart) {
        throw new NotFoundError("Cart not found for the account");
      }

      const existingItemIndex = accountCart.cart_items.findIndex((item) => item.product.equals(productObjectId));
      if (existingItemIndex === -1) {
        throw new NotFoundError("Product is not in the cart");
      }

      if (quantity === 0) {
        accountCart.cart_items.splice(existingItemIndex, 1);
      } else {
        await validateProductAvailability(productObjectId, quantity);
        accountCart.cart_items[existingItemIndex].quantity = quantity;
      }

      return accountCart.save();
    });
  }

  static async getCartItems(accountId: string) {
    const accountObjectId = parseAccountId(accountId);
    const accountCart = await CartModel.findOne({ cart_account: accountObjectId }).select("cart_items").lean().exec();

    if (!accountCart) {
      throw new NotFoundError("Cart not found for the account");
    }

    const productIds = accountCart.cart_items.map((item) => item.product);
    const products = productIds.length
      ? await ProductModel.find({ _id: { $in: productIds } })
          .select("_id product_price")
          .lean()
          .exec()
      : [];
    const priceByProductId = new Map(products.map((product) => [product._id.toString(), product.product_price]));
    const cartItems = accountCart.cart_items.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      product_price: priceByProductId.get(item.product.toString()) ?? null,
    }));

    return {
      cart_items: cartItems,
      cart_count_products: cartItems.length,
      cart_total_quantity: cartItems.reduce((total, item) => total + item.quantity, 0),
    };
  }

  static async removeProductFromCart(accountId: string, productId: string) {
    const { accountObjectId, productObjectId } = parseCartIds(accountId, productId);

    return withCartWriteRetry(async () => {
      const accountCart = await CartModel.findOne({ cart_account: accountObjectId }).exec();
      if (!accountCart) {
        throw new NotFoundError("Cart not found for the account");
      }

      const existingItemIndex = accountCart.cart_items.findIndex((item) => item.product.equals(productObjectId));
      if (existingItemIndex === -1) {
        throw new NotFoundError("Product is not in the cart");
      }

      accountCart.cart_items.splice(existingItemIndex, 1);
      return accountCart.save();
    });
  }

  static async clearCart(accountId: string) {
    const accountObjectId = parseAccountId(accountId);

    return withCartWriteRetry(async () => {
      const accountCart = await CartModel.findOne({ cart_account: accountObjectId }).exec();
      if (!accountCart) {
        throw new NotFoundError("Cart not found for the account");
      }

      accountCart.cart_items.splice(0, accountCart.cart_items.length);
      accountCart.save();
      return;
    });
  }
}

export default CartService;
