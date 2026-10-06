import { ConflictRequestError } from "#/core/error.response.js";
import {
  reservationInventory, cancelReservationInventory, confirmReservationInventory,
  type ReservationInput,
} from "#/models/repositories/inventory.repo.js";
import { acquireLock, releaseLock } from "#/services/redis.service.js";
import log from "#/helpers/logger.js";

// Call at order/payment creation, after checking the authenticated owner and selected products.
// Reuse reservationId on retries; generate a new ID only for a new checkout attempt.
const reserveInventory = async (input: ReservationInput) => {
  const lock = await acquireLock(input.productId, input.quantity, input.cartId);
  if (!lock) throw new ConflictRequestError("Product is being reserved; please retry");
  try {
    return await reservationInventory(input);
  } finally {
    // A failed unlock must not turn a successful reserve into an ambiguous failed request.
    try { await releaseLock(lock); } catch (error) { log.error("Inventory reservation unlock", error); }
  }
};

// Payment/order code must call these using the stored reservation identity, not untrusted client data.
export { reserveInventory, cancelReservationInventory, confirmReservationInventory };
