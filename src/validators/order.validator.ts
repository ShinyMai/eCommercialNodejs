import { createHash } from "node:crypto";
import { validateIdString, validateRecord } from "#/utils/validation.js";
import { validateReviewCheckoutPayload, type ReviewCheckoutPayload } from "#/validators/checkout.validator.js";

const byKey = <T>(key: (entry: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b));

/** Order-independent fingerprint of a checkout so a retried request with the same content matches. */
const hashCheckout = ({ cartId, shop_ids }: ReviewCheckoutPayload): string => {
  const canonical = {
    cartId,
    shop_ids: shop_ids
      .map((shop) => ({ ...shop, items: [...shop.items].sort(byKey((item) => item.product_id)) }))
      .sort(byKey((shop) => shop.shop_id)),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
};

export const validateCreateOrderPayload = (value: unknown, accountId: string) => {
  const body = validateRecord(value, "order payload");
  const requestId = validateIdString(body.requestId, "requestId");
  const checkout = validateReviewCheckoutPayload(body, accountId);
  return { checkout, requestId, requestHash: hashCheckout(checkout) };
};
