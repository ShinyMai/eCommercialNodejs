import { expireInventoryReservations } from "#/models/repositories/inventory.repo.js";
import log from "#/helpers/logger.js";
import { OrderModel } from "#/models/order.model.js";

export const startReservationCleanup = () => {
  let pending: Promise<void> | undefined;
  let stopped = false;
  const run = () => {
    if (stopped || pending) return;
    pending = expireInventoryReservations()
      .then(async (count) => {
        await OrderModel.updateMany(
          { status: "pending_payment", expiresAt: { $lte: new Date() } },
          { $set: { status: "expired" } },
        );
        if (count) log.info("Expired inventory reservations released", { count });
      })
      .catch((error) => log.error("Inventory reservation cleanup", error))
      .finally(() => { pending = undefined; });
  };
  const timer = setInterval(run, 30_000);
  timer.unref();
  run(); // Also recover expired reservations after a server restart.
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
};
