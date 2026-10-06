import { createHash } from "node:crypto";
import { validateIdString, validateRecord } from "#/common/utils/validation.js";
import { validateReviewCheckoutPayload } from "#/models/repositories/checkout.repo.js";

export const validateCreateOrderPayload = (value: unknown, accountId: string) => {
  const body = validateRecord(value, "order payload");
  const requestId = validateIdString(body.requestId, "requestId");
  const checkout = validateReviewCheckoutPayload(body, accountId);
  const canonical = {
    cartId: checkout.cartId,
    shop_ids: checkout.shop_ids.map((shop) => ({
      ...shop, items: [...shop.items].sort((a, b) => a.product_id.localeCompare(b.product_id)),
    })).sort((a, b) => a.shop_id.localeCompare(b.shop_id)),
  };
  const requestHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  return { checkout, requestId, requestHash };
};
