import assert from "node:assert/strict";
import { test } from "node:test";
import { createApiResponse } from "#/core/api.response.js";
import { normalizeError } from "#/core/error.normalizer.js";
import {
  BadRequestError,
  ConflictRequestError,
  ErrorResponse,
  InternalServerError,
  NotFoundError,
} from "#/core/error.response.js";

const named = (name: string, extra: object = {}) => Object.assign(new Error(name), { name }, extra);

test("error classes carry status codes and operational flags", () => {
  assert.equal(new NotFoundError().statusCode, 404);
  assert.equal(new BadRequestError("x").isOperational, true);
  const internal = new InternalServerError("boom", undefined, new Error("cause"));
  assert.equal(internal.statusCode, 500);
  assert.equal(internal.isOperational, false);
  assert.equal(internal.cause?.message, "cause");
});

test("known business errors pass through unchanged", () => {
  const error = new ConflictRequestError("taken");
  assert.equal(normalizeError(error), error);
});

test("infrastructure errors caused by user input become operational errors", () => {
  const duplicate = normalizeError(named("MongoServerError", { code: 11000, keyValue: { email: "a@b.co" } }));
  assert.ok(duplicate instanceof ConflictRequestError);
  assert.equal(duplicate.message, "email already exists");

  const validation = normalizeError(named("ValidationError", { errors: { price: { message: "price is required" } } }));
  assert.ok(validation instanceof BadRequestError);
  assert.equal(validation.message, "price is required");

  const cast = normalizeError(named("CastError", { path: "_id" }));
  assert.equal((cast as ErrorResponse).message, 'Invalid value for field "_id"');

  const json = normalizeError(Object.assign(new SyntaxError("Unexpected end"), { status: 400 }));
  assert.equal((json as ErrorResponse).message, "Malformed JSON body");
});

test("unknown errors stay system errors", () => {
  const bug = new TypeError("undefined is not a function");
  assert.equal(normalizeError(bug), bug);
});

test("api response omits pagination unless provided", () => {
  const plain = createApiResponse({ statusCode: 200, message: "ok", items: [1] });
  assert.deepEqual(plain.metadata, { items: [1] });

  const paged = createApiResponse({ statusCode: 200, message: "ok", items: [], pagination: { page: 2, limit: 10 } });
  assert.deepEqual(paged.metadata.pagination, { page: 2, limit: 10 });
});
