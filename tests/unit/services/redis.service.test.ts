import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { connectRedis, redisClient } from "#/configs/redis.config.js";
import { acquireLock, releaseLock, withLocks } from "#/services/redis.service.js";
import { newId } from "../../helpers/fixtures.js";

const productId = newId();
const cartId = newId();

const mockConnected = (t: TestContext) => t.mock.method(redisClient, "connect", async () => redisClient);

test("connectRedis shares one attempt between concurrent callers and retries after failure", async (t) => {
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

test("locks use atomic NX + TTL with unique ownership tokens", async (t) => {
  mockConnected(t);
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

  t.mock.method(redisClient, "eval", async (script: string, options: { keys: string[]; arguments: string[] }) => {
    assert.match(script, /redis.call\('GET', KEYS\[1\]\) == ARGV\[1\]/);
    assert.match(script, /redis.call\('DEL', KEYS\[1\]\)/);
    assert.deepEqual(options.keys, [first.key]);
    return options.arguments[0] === second.token ? 1 : 0;
  });
  assert.equal(await releaseLock(first), false, "a stale owner cannot delete the current lock");
  assert.equal(await releaseLock(second), true);
});

test("contention gives up after five attempts; malformed input is rejected", async (t) => {
  mockConnected(t);
  const set = t.mock.method(redisClient, "set", async () => null);

  assert.equal(await acquireLock(productId, 1, cartId), null);
  assert.equal(set.mock.callCount(), 5);
  await assert.rejects(acquireLock("bad", 1, cartId), { name: "BadRequestError" });
  await assert.rejects(acquireLock(productId, 0, cartId), { name: "BadRequestError" });
  assert.equal(set.mock.callCount(), 5);
});

test("withLocks releases every acquired lock in reverse order, even when the task fails", async (t) => {
  mockConnected(t);
  t.mock.method(redisClient, "set", async () => "OK");
  const released: string[] = [];
  t.mock.method(redisClient, "eval", async (_script: string, options: { keys: string[] }) => {
    released.push(options.keys[0]);
    return 1;
  });
  const [a, b] = [newId(), newId()];
  const targets = [a, b].map((id) => ({ productId: id, quantity: 1, cartId }));

  assert.equal(await withLocks(targets, "busy", async () => "done"), "done");
  assert.deepEqual(released, [`lock:${b}`, `lock:${a}`]);

  released.length = 0;
  await assert.rejects(withLocks(targets, "busy", async () => Promise.reject(new Error("task failed"))), /task failed/);
  assert.equal(released.length, 2);
});

test("withLocks fails with the busy message and releases locks already taken", async (t) => {
  mockConnected(t);
  let calls = 0;
  t.mock.method(redisClient, "set", async () => (++calls === 1 ? "OK" : null));
  const unlock = t.mock.method(redisClient, "eval", async () => 1);
  const targets = [newId(), newId()].map((id) => ({ productId: id, quantity: 1, cartId }));
  let ran = false;

  await assert.rejects(
    withLocks(targets, "Product is busy", async () => {
      ran = true;
    }),
    { name: "ConflictRequestError", message: "Product is busy" },
  );
  assert.equal(ran, false);
  assert.equal(unlock.mock.callCount(), 1);
});

test("a failing unlock does not turn a successful task into a failure", async (t) => {
  mockConnected(t);
  t.mock.method(redisClient, "set", async () => "OK");
  t.mock.method(redisClient, "eval", async () => {
    throw new Error("Redis down");
  });
  assert.equal(await withLocks([{ productId, quantity: 1, cartId }], "busy", async () => 42), 42);
});
