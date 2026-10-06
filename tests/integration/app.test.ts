import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, describe, test } from "node:test";
import app from "#/app.js";

let server: Server;
let baseUrl: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}/v1/api`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

const request = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  return { response, body: await response.json() };
};

const postJson = (path: string, payload: unknown) =>
  request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });

describe("response envelope", () => {
  test("health endpoint returns the common envelope and echoes the request ID", async () => {
    const { response, body } = await request("/health");

    assert.equal(response.status, 200);
    assert.equal(body.statusCode, 200);
    assert.equal(body.message, "Service is healthy");
    assert.deepEqual(body.metadata, { items: null });
    assert.equal(body.requestId, response.headers.get("x-request-id"));
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
  });

  test("a valid incoming x-request-id is reused", async () => {
    const { response, body } = await request("/health", { headers: { "x-request-id": "trace-123" } });
    assert.equal(response.headers.get("x-request-id"), "trace-123");
    assert.equal(body.requestId, "trace-123");
  });

  test("unknown routes return the common not-found response", async () => {
    const { response, body } = await request("/health/unknown");

    assert.equal(response.status, 404);
    assert.equal(body.statusCode, 404);
    assert.match(body.message, /Route GET .* not found/);
    assert.deepEqual(body.metadata, { items: null });
  });

  test("malformed JSON is normalized to a 400", async () => {
    const { response, body } = await postJson("/auth/login", "{");

    assert.equal(response.status, 400);
    assert.equal(body.message, "Malformed JSON body");
    assert.deepEqual(body.metadata, { items: null });
  });
});

describe("authentication guard", () => {
  const protectedRoutes: [string, string][] = [
    ["/auth/logout", "POST"],
    ["/accounts/me", "GET"],
    ["/cart", "GET"],
    ["/checkout/review", "POST"],
    ["/orders", "POST"],
    ["/orders/507f1f77bcf86cd799439011", "GET"],
    ["/orders/507f1f77bcf86cd799439011/cancel", "POST"],
    ["/products/seller", "GET"],
    ["/discounts", "POST"],
  ];

  for (const [path, method] of protectedRoutes) {
    test(`${method} ${path} rejects a missing access token`, async () => {
      const { response, body } = await request(path, { method });
      assert.equal(response.status, 401);
      assert.equal(body.message, "Missing Bearer access token");
    });
  }

  test("a malformed bearer token is rejected before any database lookup", async () => {
    const { response, body } = await request("/accounts/me", { headers: { authorization: "Bearer not-a-jwt" } });
    assert.equal(response.status, 401);
    assert.equal(body.message, "Invalid access token");
  });
});

describe("input validation", () => {
  test("seller registration requires store details", async () => {
    const { response, body } = await postJson("/auth/register/seller", {
      name: "Pending Seller",
      email: "pending-seller@example.com",
      password: "correct horse battery staple",
    });

    assert.equal(response.status, 400);
    assert.equal(body.message, "Store name is required for seller accounts");
  });

  test("login rejects an invalid email before querying", async () => {
    const { response, body } = await postJson("/auth/login", { email: "nope", password: "x" });
    assert.equal(response.status, 400);
    assert.equal(body.message, "Email is invalid");
  });
});
