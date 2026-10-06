import type { ClientSession } from "mongoose";
import { BadRequestError, ConflictRequestError } from "#/core/error.response.js";
import { findOwnedCart } from "#/repositories/cart.repo.js";
import { findStocks } from "#/repositories/inventory.repo.js";
import { findProductsForCheckout } from "#/repositories/product.repo.js";
import DiscountService from "#/services/discount.service.js";
import { sum } from "#/utils/index.js";
import {
  validateReviewCheckoutPayload,
  type CheckoutShopPayload,
  type ReviewCheckoutPayload,
} from "#/validators/checkout.validator.js";

export type { ReviewCheckoutPayload };

/** Flat shipping fee charged per order line (placeholder until a shipping module exists). */
const SHIPPING_FEE_PER_ITEM = 5;

type PricedItem = { product_id: string; price: number; quantity: number };
type PricedShop = Omit<CheckoutShopPayload, "items"> & { items: PricedItem[] };

const stockKey = (productId: string, sellerId: string) => `${productId}:${sellerId}`;
const lineTotal = (item: PricedItem) => item.price * item.quantity;

/** Loads current prices and stock for every selected item in two queries. */
const loadCatalog = async (shops: CheckoutShopPayload[], session?: ClientSession) => {
  const selections = shops.flatMap((shop) => shop.items.map((item) => ({ productId: item.product_id, sellerId: shop.shop_id })));

  const products = await findProductsForCheckout(
    selections.map(({ productId }) => productId),
    session,
  );
  const inventories = await findStocks(selections, session);

  return {
    productById: new Map(products.map((product) => [product._id.toString(), product])),
    stockByKey: new Map(
      inventories.map((inventory) => [
        stockKey(String(inventory.inven_productId), String(inventory.inven_sellerId)),
        inventory.inven_stock,
      ]),
    ),
  };
};

class CheckoutService {
  static async reviewCheckout(payload: unknown, authenticatedAccountId?: string, session?: ClientSession) {
    const { cartId, accountId, shop_ids } = validateReviewCheckoutPayload(payload, authenticatedAccountId);

    const cart = await findOwnedCart(cartId, accountId, session);
    if (!cart) throw new BadRequestError("Cart not found");
    const cartProductIds = new Set(cart.cart_items.map((item) => item.product.toString()));

    const { productById, stockByKey } = await loadCatalog(shop_ids, session);

    const priceItem = (shopId: string, { product_id, quantity }: CheckoutShopPayload["items"][number]): PricedItem => {
      if (!cartProductIds.has(product_id)) throw new BadRequestError(`Item ${product_id} not found in cart`);

      const product = productById.get(product_id);
      if (!product || product.product_seller.toString() !== shopId) {
        throw new BadRequestError(`Product ${product_id} not found for this shop`);
      }

      const stock = stockByKey.get(stockKey(product_id, shopId));
      if (stock === undefined) throw new ConflictRequestError(`Inventory is not available for product ${product_id}`);
      if (!Number.isFinite(stock) || stock < 0 || quantity > stock) {
        throw new ConflictRequestError(`Insufficient stock for product ${product_id}; available: ${stock}`);
      }
      return { product_id, price: product.product_price, quantity };
    };

    // Validate every item (cart membership, ownership, stock) before touching any discount.
    const pricedShops: PricedShop[] = shop_ids.map((shop) => ({
      ...shop,
      items: shop.items.map((item) => priceItem(shop.shop_id, item)),
    }));

    const checkout_summary = [];
    for (const shop of pricedShops) {
      const total_price = sum(shop.items, lineTotal);
      const total_discount = await CheckoutService.getShopDiscount(shop, total_price, accountId, session);
      checkout_summary.push({ ...shop, total_price, total_discount, total_checkout: total_price - total_discount });
    }

    const total_price = sum(checkout_summary, (shop) => shop.total_price);
    const total_discount = sum(checkout_summary, (shop) => shop.total_discount);
    const fee_shipping = sum(checkout_summary, (shop) => shop.items.length * SHIPPING_FEE_PER_ITEM);

    return {
      checkout_summary,
      checkout_order: {
        total_price,
        fee_shipping,
        total_discount,
        total_checkout: total_price + fee_shipping - total_discount,
      },
    };
  }

  private static async getShopDiscount(
    shop: PricedShop,
    shopTotal: number,
    accountId: string,
    session?: ClientSession,
  ): Promise<number> {
    if (!shop.discount_id) return 0;

    const discount = await DiscountService.getDiscountAmount(
      shop.discount_id,
      shop.items.map((item) => ({ productId: item.product_id, quantity: item.quantity })),
      shop.shop_id,
      accountId,
      session,
    );
    // DiscountService reads prices again; reject a changed subtotal instead of mixing snapshots.
    if (discount.totalPrice !== shopTotal) {
      throw new ConflictRequestError("Product prices changed; please retry checkout review");
    }
    return discount.discountAmount;
  }
}

export default CheckoutService;
