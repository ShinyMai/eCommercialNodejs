import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { createAccessToken, createRefreshToken, hashToken, verifyAccessToken } from "#/auth/token.js";
import config from "#/configs/index.js";

const accountId = "507f1f77bcf86cd799439011";
const sessionId = "507f191e810c19729de860ea";

const signWith = (payload: object, secret = config.auth.accessTokenSecret) =>
  jwt.sign(payload, secret, {
    algorithm: "HS256",
    audience: config.auth.accessTokenAudience,
    issuer: config.auth.accessTokenIssuer,
    subject: accountId,
  });

test("access tokens carry an explicit type and session binding", () => {
  const payload = verifyAccessToken(createAccessToken({ accountId, sessionId }));

  assert.equal(payload.sub, accountId);
  assert.equal(payload.sid, sessionId);
  assert.equal(payload.tokenUse, "access");
  assert.ok(payload.jti);
});

test("refresh tokens and non-access JWTs are rejected as access tokens", () => {
  assert.throws(() => verifyAccessToken(createRefreshToken()), /Invalid access token/);
  assert.throws(() => verifyAccessToken(signWith({ sid: sessionId, tokenUse: "refresh" })), /Invalid access token/);
  assert.throws(() => verifyAccessToken(signWith({ tokenUse: "access" })), /Invalid access token/);
});

test("tokens signed with another secret are rejected", () => {
  const forged = signWith({ sid: sessionId, tokenUse: "access" }, "x".repeat(40));
  assert.throws(() => verifyAccessToken(forged), /Invalid access token/);
});

test("expired access tokens report expiry", () => {
  const expired = signWith({ sid: sessionId, tokenUse: "access", exp: Math.floor(Date.now() / 1000) - 10 });
  assert.throws(() => verifyAccessToken(expired), /Access token expired/);
});

test("opaque refresh tokens are random and stored only as SHA-256 hashes", () => {
  const first = createRefreshToken();
  const second = createRefreshToken();

  assert.notEqual(first, second);
  assert.match(hashToken(first), /^[a-f0-9]{64}$/);
  assert.equal(hashToken(first), hashToken(first));
  assert.notEqual(hashToken(first), hashToken(second));
});
