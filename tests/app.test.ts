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
  assert.equal(body.status, "success");
  assert.equal(body.message, "Service is healthy");
  assert.equal(body.requestId, response.headers.get("x-request-id"));
});

test("protected resources reject a missing API key", async () => {
  const response = await fetch(`${baseUrl}/products`);
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.message, "Missing x-api-key header");
});

test("malformed JSON is normalized to a client error", async () => {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.message, "Malformed JSON body");
});
