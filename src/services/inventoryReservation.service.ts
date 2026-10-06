import {
  reserveInventoryStock,
  cancelReservationInventory,
  confirmReservationInventory,
  type ReservationInput,
} from "#/repositories/inventory.repo.js";
import { withLocks } from "#/services/redis.service.js";

/**
 * Call at order/payment creation, after checking the authenticated owner and selected products.
 * Reuse reservationId on retries; generate a new ID only for a new checkout attempt.
 */
const reserveInventory = (input: ReservationInput) =>
  withLocks([input], "Product is being reserved; please retry", () => reserveInventoryStock(input));

// Payment/order code must call these using the stored reservation identity, not untrusted client data.
export { reserveInventory, cancelReservationInventory, confirmReservationInventory };
