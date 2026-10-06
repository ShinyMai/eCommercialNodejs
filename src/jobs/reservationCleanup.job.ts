import log from "#/helpers/logger.js";
import { expireInventoryReservations } from "#/repositories/inventory.repo.js";
import { expirePendingOrders } from "#/repositories/order.repo.js";

const CLEANUP_INTERVAL_MS = 30_000;

/** Periodically restores stock held by expired reservations. Returns an async stop function. */
export const startReservationCleanup = () => {
  let pending: Promise<void> | undefined;
  let stopped = false;

  const cleanup = async () => {
    const count = await expireInventoryReservations();
    await expirePendingOrders();
    if (count) log.info("Expired inventory reservations released", { count });
  };

  const run = () => {
    if (stopped || pending) return;
    pending = cleanup()
      .catch((error) => log.error("Inventory reservation cleanup", error))
      .finally(() => {
        pending = undefined;
      });
  };

  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref();
  run(); // Also recover expired reservations after a server restart.

  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
};
