"use strict";

import { createClient } from "redis";
import "#/configs/index.js";
import log from "#/helpers/logger.js";

const redisClient = createClient({
  url: process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379",
  disableOfflineQueue: true,
  socket: { connectTimeout: 5000, reconnectStrategy: false },
});
redisClient.on("error", (error) => log.error("Redis", error));
redisClient.on("ready", () => log.info("Redis connected successfully"));

let connecting: Promise<void> | undefined;
const connectRedis = async (): Promise<void> => {
  if (redisClient.isReady) return;
  if (!connecting) {
    connecting = redisClient.connect().then(() => undefined).finally(() => { connecting = undefined; });
  }
  await connecting;
};

const disconnectRedis = async (): Promise<void> => {
  if (connecting) await connecting;
  if (redisClient.isOpen) await redisClient.close();
};

export { redisClient, connectRedis, disconnectRedis };

