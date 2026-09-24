"use strict";

import mongoose from "mongoose";
import config from "#/configs/index.js";
import log from "#/helpers/logger.js";

let connectionPromise: Promise<void> | undefined;

const connect = (): Promise<void> => {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (connectionPromise) return connectionPromise;

  mongoose.set("debug", config.db.debug ? { color: true } : false);
  connectionPromise = mongoose
    .connect(config.db.uri)
    .then(() => {
      log.info(`DB connected [${config.environment}]`, {
        db: config.db.name,
      });
    })
    .catch((error) => {
      connectionPromise = undefined;
      throw error;
    });

  return connectionPromise;
};

const disconnect = async (): Promise<void> => {
  connectionPromise = undefined;
  await mongoose.disconnect();
};

export default { connect, disconnect };
