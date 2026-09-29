import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import app from "../src/app.js";

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

test("protected routes reject a missing access token", async () => {
  const response = await fetch(`${baseUrl}/auth/logout`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.statusCode, 401);
  assert.equal(body.message, "Missing Bearer access token");
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

test("seller registration uses the dedicated endpoint and validates store details", async () => {
  const response = await fetch(`${baseUrl}/auth/register/seller`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Pending Seller",
      email: "pending-seller@example.com",
      password: "correct horse battery staple",
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.message, "Store name is required for seller accounts");
});

test("unknown route returns the common not-found response", async () => {
  const response = await fetch(`${baseUrl}/health/unknown`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.statusCode, 404);
  assert.match(body.message, /Route GET .* not found/);
  assert.deepEqual(body.metadata, { items: null });
});
