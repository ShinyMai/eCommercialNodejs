import { createClient } from "redis";
import config from "#/configs/index.js";
import log from "#/helpers/logger.js";

const redisClient = createClient({
  url: config.redis.url,
  disableOfflineQueue: true,
  socket: { connectTimeout: 5000, reconnectStrategy: false },
});
redisClient.on("error", (error) => log.error("Redis", error));
redisClient.on("ready", () => log.info("Redis connected successfully"));

let connecting: Promise<void> | undefined;

/** Concurrent callers share a single in-flight connection attempt. */
const connectRedis = async (): Promise<void> => {
  if (redisClient.isReady) return;
  connecting ??= redisClient
    .connect()
    .then(() => undefined)
    .finally(() => {
      connecting = undefined;
    });
  await connecting;
};

const disconnectRedis = async (): Promise<void> => {
  if (connecting) await connecting;
  if (redisClient.isOpen) await redisClient.close();
};

export { redisClient, connectRedis, disconnectRedis };
