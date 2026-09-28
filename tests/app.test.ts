import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import { Types } from "mongoose";
import app from "../src/app.js";
import { updateNestedObject } from "../src/common/utils/index.js";

let server: Server;
let baseUrl: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port");
  }
  baseUrl = `http://127.0.0.1:${address.port}/v1/api`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("health endpoint returns the common response envelope", async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.statusCode, 200);
  assert.equal(body.message, "Service is healthy");
  assert.deepEqual(body.metadata, { items: null });
  assert.equal(body.requestId, response.headers.get("x-request-id"));
});

test("protected resources reject a missing API key", async () => {
  const response = await fetch(`${baseUrl}/products`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.statusCode, 401);
  assert.equal(body.message, "Missing x-api-key header");
  assert.deepEqual(body.metadata, { items: null });
});

test("malformed JSON is normalized to a client error", async () => {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.statusCode, 400);
  assert.equal(body.message, "Malformed JSON body");
  assert.deepEqual(body.metadata, { items: null });
});

test("unknown protected route returns the common auth error response", async () => {
  const response = await fetch(`${baseUrl}/health/unknown`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.statusCode, 401);
  assert.equal(body.message, "Missing x-api-key header");
  assert.deepEqual(body.metadata, { items: null });
});

test("updateNestedObject flattens only plain objects", () => {
  const shopId = new Types.ObjectId("507f1f77bcf86cd799439011");
  const startDate = new Date("2026-10-01T00:00:00.000Z");

  const result = updateNestedObject({
    discount_shopId: shopId,
    discount_start_date: startDate,
    settings: {
      limits: {
        perUser: 1,
      },
    },
    productIds: [shopId],
  });

  assert.strictEqual(result.discount_shopId, shopId);
  assert.strictEqual(result.discount_start_date, startDate);
  assert.deepEqual(result.productIds, [shopId]);
  assert.equal(result["settings.limits.perUser"], 1);
  assert.equal(Object.keys(result).some((key) => key.startsWith("discount_shopId.")), false);
});
