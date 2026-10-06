import app from "./src/app.js";
import config from "#/configs/index.js";
import database from "#/dbs/init.mongodb.js";
import startDatabaseMonitor from "#/helpers/check.connect.js";
import log from "#/helpers/logger.js";
import { connectRedis, disconnectRedis } from "#/configs/redis.config.js";
import { startReservationCleanup } from "#/helpers/reservation.cleanup.js";

const bootstrap = async () => {
  await connectRedis();
  await database.connect();
  const stopReservationCleanup = startReservationCleanup();
  const monitor = startDatabaseMonitor();
  const server = app.listen(config.app.port, () => {
    log.info(`Server is running on port ${config.app.port}`, {
      environment: config.environment,
      apiPrefix: config.app.apiPrefix,
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal} received; shutting down`);
    clearInterval(monitor);

    server.close(async (serverError) => {
      try {
        await stopReservationCleanup();
        await Promise.all([database.disconnect(), disconnectRedis()]);
        if (serverError) throw serverError;
        log.info("Server stopped");
        process.exit(0);
      } catch (error) {
        log.error("shutdown", error);
        process.exit(1);
      }
    });
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
};

bootstrap().catch((error) => {
  log.error("bootstrap", error);
  process.exit(1);
});
