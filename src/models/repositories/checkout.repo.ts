import {
  validateIdString,
  validateRecord,
  validateNonEmptyArray,
  validatePositiveSafeInteger,
  validateUniqueValue,
} from "#/common/utils/validation.js";

export type ReviewCheckoutPayload = {
  cartId: string;
  accountId: string;
  shop_ids: {
    shop_id: string;
    items: { product_id: string; quantity: number }[];
    discount_id?: string;
  }[];
};

export const validateReviewCheckoutPayload = (
  value: unknown,
  authenticatedAccountId?: string,
): ReviewCheckoutPayload => {
  const body = validateRecord(value, "checkout payload");
  const shops = validateNonEmptyArray(body.shop_ids, "shop_ids");
  const seenShops = new Set<string>();
  const seenProducts = new Set<string>();
  return {
    cartId: validateIdString(body.cartId, "cartId"),
    accountId: validateIdString(authenticatedAccountId ?? body.accountId, "accountId"),
    shop_ids: shops.map((entry) => {
      const shop = validateRecord(entry, "shop");
      const shopId = validateUniqueValue(validateIdString(shop.shop_id, "shop_id"), seenShops, "shop_id");
      const items = validateNonEmptyArray(shop.items, "items");
      return {
        shop_id: shopId,
        discount_id: shop.discount_id === undefined ? undefined : validateIdString(shop.discount_id, "discount_id"),
        items: items.map((entry) => {
          const item = validateRecord(entry, "item");
          return {
            product_id: validateUniqueValue(
              validateIdString(item.product_id, "product_id"),
              seenProducts,
              "product_id",
            ),
            quantity: validatePositiveSafeInteger(item.quantity, "quantity"),
          };
        }),
      };
    }),
  };
};
