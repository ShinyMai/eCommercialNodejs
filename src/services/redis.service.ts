"use strict";

import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { redisClient, connectRedis } from "#/configs/redis.config.js";
import "#/configs/index.js";
import { validateIdString, validatePositiveSafeInteger } from "#/common/utils/validation.js";

export type RedisLock = { key: string; token: string };
const LOCK_TTL_MS = 3000;
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

// A lock coordinates callers; it does not validate or reserve inventory.
const acquireLock = async (productId: string, quantity: number, cartId: string): Promise<RedisLock | null> => {
  const id = validateIdString(productId, "productId");
  validateIdString(cartId, "cartId");
  validatePositiveSafeInteger(quantity, "quantity");
  await connectRedis();
  const key = `lock:${id}`;
  const token = randomUUID();
  for (let attempt = 0; attempt < 5; attempt++) {
    const acquired = await redisClient.set(key, token, {
      condition: "NX",
      expiration: { type: "PX", value: LOCK_TTL_MS },
    });
    if (acquired === "OK") return { key, token };
    if (attempt < 4) await delay(100);
  }
  return null;
};

// Compare and delete atomically: an expired owner cannot delete a newer owner's lock.
const releaseLock = async (lock: RedisLock): Promise<boolean> => {
  await connectRedis();
  const deleted = await redisClient.eval(RELEASE_LOCK_SCRIPT, {
    keys: [lock.key],
    arguments: [lock.token],
  });
  return deleted === 1;
};

export { acquireLock, releaseLock };
