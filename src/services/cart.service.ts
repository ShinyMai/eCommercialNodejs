import mongoose, { Types } from "mongoose";
import { BadRequestError, ConflictRequestError, NotFoundError } from "#/core/error.response.js";
import { createCart, findCartDocumentByAccount, findCartItemsByAccount } from "#/repositories/cart.repo.js";
import { findStock } from "#/repositories/inventory.repo.js";
import { findProductAvailability, findProductPrices } from "#/repositories/product.repo.js";
import { activeSellerExists } from "#/repositories/account.repo.js";
import { isDuplicateKeyError, sum, validateObjectId } from "#/utils/index.js";

const MAX_CART_ITEMS = 100;
const MAX_WRITE_ATTEMPTS = 3;

type CartDocument = NonNullable<Awaited<ReturnType<typeof findCartDocumentByAccount>>>;

const parseAccountId = (accountId: string) => validateObjectId(accountId, "accountId");
const parseProductId = (productId: string) => validateObjectId(productId, "productId");

const validateQuantity = (quantity: number, { allowZero = false } = {}) => {
  if (!Number.isSafeInteger(quantity) || quantity < (allowZero ? 0 : 1)) {
    throw new BadRequestError(
      allowZero ? "quantity must be a non-negative safe integer" : "quantity must be a positive safe integer",
    );
  }
};


const getCartOrThrow = async (accountId: Types.ObjectId) => {
  const cart = await findCartDocumentByAccount(accountId);
  if (!cart) throw new NotFoundError("Cart not found for the account");
  return cart;
};

const findItemIndex = (cart: CartDocument | null, productId: Types.ObjectId) =>
  cart?.cart_items.findIndex((item) => item.product.equals(productId)) ?? -1;

const getItemIndexOrThrow = (cart: CartDocument, productId: Types.ObjectId) => {
  const index = findItemIndex(cart, productId);
  if (index === -1) throw new NotFoundError("Product is not in the cart");
  return index;
};

/** Ensures the product is published, its seller is active and stock covers the requested quantity. */
const validateProductAvailability = async (productId: Types.ObjectId, requestedQuantity: number) => {
  const product = await findProductAvailability(productId);
  if (!product) throw new NotFoundError("Product not found");
  if (product.isDraft !== false || product.isPublished !== true) {
    throw new ConflictRequestError("Product is not available for purchase");
  }

  const [sellerExists, inventory] = await Promise.all([
    activeSellerExists(product.product_seller),
    findStock(productId, product.product_seller),
  ]);
  if (!sellerExists) throw new ConflictRequestError("Product seller is not active");
  if (!inventory) throw new ConflictRequestError("Product inventory is not available");
  if (requestedQuantity > inventory.inven_stock) {
    throw new ConflictRequestError(`Requested quantity exceeds available stock (${inventory.inven_stock})`);
  }
};

const isRetryableCartWriteError = (error: unknown) =>
  error instanceof mongoose.Error.VersionError || isDuplicateKeyError(error);

/** Carts use optimistic concurrency; retry read-modify-write cycles that lost a race. */
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
    const accountObjectId = parseAccountId(accountId);
    const productObjectId = parseProductId(productId);

    return withCartWriteRetry(async () => {
      const cart = await findCartDocumentByAccount(accountObjectId);
      const itemIndex = findItemIndex(cart, productObjectId);
      const isNewItem = itemIndex === -1;
      const resultingQuantity = isNewItem ? quantity : cart!.cart_items[itemIndex].quantity + quantity;

      if (cart && isNewItem && cart.cart_items.length >= MAX_CART_ITEMS) {
        throw new ConflictRequestError(`Cart cannot contain more than ${MAX_CART_ITEMS} distinct products`);
      }
      await validateProductAvailability(productObjectId, resultingQuantity);

      if (!cart) {
        return createCart(accountObjectId, [{ product: productObjectId, quantity }]);
      }
      if (isNewItem) cart.cart_items.push({ product: productObjectId, quantity });
      else cart.cart_items[itemIndex].quantity = resultingQuantity;
      return cart.save();
    });
  }

  /** Sets the product quantity; zero removes the product. */
  static async updateProductQuantity(accountId: string, productId: string, quantity: number) {
    validateQuantity(quantity, { allowZero: true });
    if (quantity === 0) return CartService.removeProductFromCart(accountId, productId);

    const accountObjectId = parseAccountId(accountId);
    const productObjectId = parseProductId(productId);
    return withCartWriteRetry(async () => {
      const cart = await getCartOrThrow(accountObjectId);
      const itemIndex = getItemIndexOrThrow(cart, productObjectId);
      await validateProductAvailability(productObjectId, quantity);
      cart.cart_items[itemIndex].quantity = quantity;
      return cart.save();
    });
  }

  static async getCartItems(accountId: string) {
    const cart = await findCartItemsByAccount(parseAccountId(accountId));
    if (!cart) throw new NotFoundError("Cart not found for the account");

    const productIds = cart.cart_items.map((item) => item.product);
    const products = productIds.length
      ? await findProductPrices(productIds)
      : [];
    const priceByProductId = new Map(products.map((product) => [product._id.toString(), product.product_price]));
    const cartItems = cart.cart_items.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      product_price: priceByProductId.get(item.product.toString()) ?? null,
    }));

    return {
      cart_items: cartItems,
      cart_count_products: cartItems.length,
      cart_total_quantity: sum(cartItems, (item) => item.quantity),
    };
  }

  static async removeProductFromCart(accountId: string, productId: string) {
    const accountObjectId = parseAccountId(accountId);
    const productObjectId = parseProductId(productId);

    return withCartWriteRetry(async () => {
      const cart = await getCartOrThrow(accountObjectId);
      cart.cart_items.splice(getItemIndexOrThrow(cart, productObjectId), 1);
      return cart.save();
    });
  }

  static async clearCart(accountId: string) {
    const accountObjectId = parseAccountId(accountId);

    return withCartWriteRetry(async () => {
      const cart = await getCartOrThrow(accountObjectId);
      cart.cart_items.splice(0, cart.cart_items.length);
      return cart.save();
    });
  }
}

export default CartService;
