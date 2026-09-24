"use strict";

import mongoose from "mongoose";
import os from "os";
import process from "process";
import config from "#/configs/index.js";
import log from "#/helpers/logger.js";

const startDatabaseMonitor = (): NodeJS.Timeout => {
  const timer = setInterval(() => {
    const activeConnections = mongoose.connections.filter(
      ({ readyState }) => readyState === 1,
    ).length;
    const numCores = os.cpus().length;
    const memoryUsageMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const maxConnections = numCores * 5;

    log.debug("Runtime health", { activeConnections, memoryUsageMb });
    if (activeConnections > maxConnections) {
      log.warn("Database connection count is above the expected threshold", {
        activeConnections,
        maxConnections,
      });
    }
  }, config.db.monitorIntervalMs);

  timer.unref();
  return timer;
};

export default startDatabaseMonitor;
