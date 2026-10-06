import {
  validateIdString,
  validateRecord,
  validateNonEmptyArray,
  validatePositiveSafeInteger,
  validateUniqueValue,
} from "#/utils/validation.js";

export type CheckoutItemPayload = { product_id: string; quantity: number };

export type CheckoutShopPayload = {
  shop_id: string;
  items: CheckoutItemPayload[];
  discount_id?: string;
};

export type ReviewCheckoutPayload = {
  cartId: string;
  accountId: string;
  shop_ids: CheckoutShopPayload[];
};

/** The authenticated account always overrides any accountId supplied in the body. */
export const validateReviewCheckoutPayload = (
  value: unknown,
  authenticatedAccountId?: string,
): ReviewCheckoutPayload => {
  const body = validateRecord(value, "checkout payload");
  const seenShops = new Set<string>();
  const seenProducts = new Set<string>();

  const parseItem = (entry: unknown): CheckoutItemPayload => {
    const item = validateRecord(entry, "item");
    const productId = validateIdString(item.product_id, "product_id");
    return {
      product_id: validateUniqueValue(productId, seenProducts, "product_id"),
      quantity: validatePositiveSafeInteger(item.quantity, "quantity"),
    };
  };

  const parseShop = (entry: unknown): CheckoutShopPayload => {
    const shop = validateRecord(entry, "shop");
    const shopId = validateIdString(shop.shop_id, "shop_id");
    return {
      shop_id: validateUniqueValue(shopId, seenShops, "shop_id"),
      discount_id: shop.discount_id === undefined ? undefined : validateIdString(shop.discount_id, "discount_id"),
      items: validateNonEmptyArray(shop.items, "items").map(parseItem),
    };
  };

  return {
    cartId: validateIdString(body.cartId, "cartId"),
    accountId: validateIdString(authenticatedAccountId ?? body.accountId, "accountId"),
    shop_ids: validateNonEmptyArray(body.shop_ids, "shop_ids").map(parseShop),
  };
};
