import assert from "node:assert/strict";
import { test } from "node:test";
import { acquireLock, releaseLock } from "../src/services/redis.service.js";
import { redisClient, connectRedis } from "../src/configs/redis.config.js";

const productId = "507f1f77bcf86cd799439013";
const cartId = "507f1f77bcf86cd799439011";

test("Redis connects once for concurrent callers and retries after connection failure", async (t) => {
  let fail = true;
  const connect = t.mock.method(redisClient, "connect", async () => {
    if (fail) throw new Error("Redis unavailable");
    return redisClient;
  });
  const results = await Promise.allSettled([connectRedis(), connectRedis()]);
  assert.equal(connect.mock.callCount(), 1);
  assert.ok(results.every((result) => result.status === "rejected"));
  fail = false;
  await connectRedis();
  assert.equal(connect.mock.callCount(), 2);
});

test("Redis locks use atomic NX plus TTL and unique ownership tokens", async (t) => {
  t.mock.method(redisClient, "connect", async () => redisClient);
  const set = t.mock.method(redisClient, "set", async (_key: string, _token: string, options: unknown) => {
    assert.deepEqual(options, { condition: "NX", expiration: { type: "PX", value: 3000 } });
    return "OK";
  });
  const first = await acquireLock(productId, 2, cartId);
  const second = await acquireLock(productId, 2, cartId);
  assert.ok(first && second);
  assert.equal(first.key, `lock:${productId}`);
  assert.notEqual(first.token, second.token);
  assert.equal(set.mock.callCount(), 2);
  const ownerToken = second.token;
  t.mock.method(redisClient, "eval", async (script: string, options: { keys: string[]; arguments: string[] }) => {
    assert.match(script, /redis.call\('GET', KEYS\[1\]\) == ARGV\[1\]/);
    assert.match(script, /redis.call\('DEL', KEYS\[1\]\)/);
    assert.deepEqual(options.keys, [first.key]);
    return options.arguments[0] === ownerToken ? 1 : 0;
  });
  assert.equal(await releaseLock(first), false);
  assert.equal(await releaseLock(second), true);
});

test("Redis contention stops after five attempts; malformed input is rejected", async (t) => {
  t.mock.method(redisClient, "connect", async () => redisClient);
  const set = t.mock.method(redisClient, "set", async () => null);
  assert.equal(await acquireLock(productId, 1, cartId), null);
  assert.equal(set.mock.callCount(), 5);
  await assert.rejects(acquireLock("bad", 1, cartId), { name: "BadRequestError" });
  await assert.rejects(acquireLock(productId, 0, cartId), { name: "BadRequestError" });
  assert.equal(set.mock.callCount(), 5);
});

