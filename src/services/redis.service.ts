import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { redisClient, connectRedis } from "#/configs/redis.config.js";
import { ConflictRequestError } from "#/core/error.response.js";
import log from "#/helpers/logger.js";
import { validateIdString, validatePositiveSafeInteger } from "#/utils/validation.js";

export type RedisLock = { key: string; token: string };
export type LockTarget = { productId: string; quantity: number; cartId: string };

const LOCK_TTL_MS = 3000;
const LOCK_ATTEMPTS = 5;
const LOCK_RETRY_DELAY_MS = 100;

// Compare and delete atomically: an expired owner cannot delete a newer owner's lock.
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** A lock coordinates callers; it does not validate or reserve inventory. */
const acquireLock = async (productId: string, quantity: number, cartId: string): Promise<RedisLock | null> => {
  const id = validateIdString(productId, "productId");
  validateIdString(cartId, "cartId");
  validatePositiveSafeInteger(quantity, "quantity");
  await connectRedis();

  const lock = { key: `lock:${id}`, token: randomUUID() };
  for (let attempt = 1; attempt <= LOCK_ATTEMPTS; attempt++) {
    const acquired = await redisClient.set(lock.key, lock.token, {
      condition: "NX",
      expiration: { type: "PX", value: LOCK_TTL_MS },
    });
    if (acquired === "OK") return lock;
    if (attempt < LOCK_ATTEMPTS) await delay(LOCK_RETRY_DELAY_MS);
  }
  return null;
};

const releaseLock = async (lock: RedisLock): Promise<boolean> => {
  await connectRedis();
  const deleted = await redisClient.eval(RELEASE_LOCK_SCRIPT, { keys: [lock.key], arguments: [lock.token] });
  return deleted === 1;
};

/**
 * Acquires a lock per target (in the given order), runs `task`, then releases in reverse order.
 * A failed unlock is only logged so it never turns a successful task into an ambiguous failure.
 */
const withLocks = async <T>(targets: LockTarget[], busyMessage: string, task: () => Promise<T>): Promise<T> => {
  const locks: RedisLock[] = [];
  try {
    for (const { productId, quantity, cartId } of targets) {
      const lock = await acquireLock(productId, quantity, cartId);
      if (!lock) throw new ConflictRequestError(busyMessage);
      locks.push(lock);
    }
    return await task();
  } finally {
    for (const lock of locks.reverse()) {
      try {
        await releaseLock(lock);
      } catch (error) {
        log.error("Redis unlock", error, { key: lock.key });
      }
    }
  }
};

export { acquireLock, releaseLock, withLocks };
