import os from "node:os";
import mongoose from "mongoose";
import config from "#/configs/index.js";
import log from "#/helpers/logger.js";

const CONNECTIONS_PER_CORE = 5;
const BYTES_PER_MB = 1024 * 1024;

const startDatabaseMonitor = (): NodeJS.Timeout => {
  const maxConnections = os.cpus().length * CONNECTIONS_PER_CORE;

  const timer = setInterval(() => {
    const activeConnections = mongoose.connections.filter(({ readyState }) => readyState === 1).length;
    const memoryUsageMb = Math.round(process.memoryUsage().rss / BYTES_PER_MB);

    log.debug("Runtime health", { activeConnections, memoryUsageMb });
    if (activeConnections > maxConnections) {
      log.warn("Database connection count is above the expected threshold", { activeConnections, maxConnections });
    }
  }, config.db.monitorIntervalMs);

  timer.unref();
  return timer;
};

export default startDatabaseMonitor;
