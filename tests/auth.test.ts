import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import {
  createAccessToken,
  createRefreshToken,
  hashToken,
  verifyAccessToken,
} from "../src/auth/token.js";
import { parseCredentials, parseSignUpPayload } from "../src/auth/validation.js";
import config from "../src/configs/index.js";
import { hasMinimumRole } from "../src/auth/roles.js";
import { AccountModel } from "../src/models/account.model.js";
import { UserProfileModel } from "../src/models/userProfile.model.js";

test("access tokens carry an explicit type and session binding", () => {
  const token = createAccessToken({
    accountId: "507f1f77bcf86cd799439011",
    sessionId: "507f191e810c19729de860ea",
  });
  const payload = verifyAccessToken(token);

  assert.equal(payload.sub, "507f1f77bcf86cd799439011");
  assert.equal(payload.sid, "507f191e810c19729de860ea");
  assert.equal(payload.tokenUse, "access");
});

test("refresh tokens cannot be verified as access tokens", () => {
  assert.throws(() => verifyAccessToken(createRefreshToken()), /Invalid access token/);

  const signedRefreshToken = jwt.sign(
    { sid: "507f191e810c19729de860ea", tokenUse: "refresh" },
    config.auth.accessTokenSecret,
    {
      algorithm: "HS256",
      audience: config.auth.accessTokenAudience,
      issuer: config.auth.accessTokenIssuer,
      subject: "507f1f77bcf86cd799439011",
    },
  );
  assert.throws(() => verifyAccessToken(signedRefreshToken), /Invalid access token/);
});

test("opaque refresh tokens are random and only their hashes need persistence", () => {
  const first = createRefreshToken();
  const second = createRefreshToken();
  assert.notEqual(first, second);
  assert.equal(hashToken(first).length, 64);
  assert.notEqual(hashToken(first), first);
});

test("authentication input is normalized and bounded", () => {
  const signup = parseSignUpPayload({
    name: "  Example Shop  ",
    email: "  OWNER@EXAMPLE.COM ",
    password: "correct horse battery staple",
  });
  assert.equal(signup.name, "Example Shop");
  assert.equal(signup.email, "owner@example.com");

  assert.throws(
    () => parseSignUpPayload({ name: "Shop", email: "a@b.co", password: "short" }),
    /at least 12 characters/,
  );
  assert.throws(
    () => parseCredentials({ email: "a@b.co", password: "🔥".repeat(19) }),
    /72 UTF-8 bytes/,
  );
});

test("seller inherits buyer capabilities and admin inherits all capabilities", () => {
  assert.equal(hasMinimumRole("buyer", "buyer"), true);
  assert.equal(hasMinimumRole("buyer", "seller"), false);
  assert.equal(hasMinimumRole("seller", "buyer"), true);
  assert.equal(hasMinimumRole("seller", "seller"), true);
  assert.equal(hasMinimumRole("admin", "buyer"), true);
  assert.equal(hasMinimumRole("admin", "seller"), true);
  assert.equal(hasMinimumRole("admin", "admin"), true);
});

test("seller signup requires a store profile", () => {
  assert.throws(
    () => parseSignUpPayload({
      name: "Seller",
      email: "seller@example.com",
      password: "correct horse battery staple",
    }, "seller"),
    /Store name is required/,
  );
  const seller = parseSignUpPayload({
    name: "Seller",
    email: "seller@example.com",
    password: "correct horse battery staple",
    storeName: "Seller Store",
  }, "seller");
  assert.equal(seller.sellerProfile?.storeName, "Seller Store");
});

test("account credentials and user profile data use separate schemas", () => {
  assert.ok(AccountModel.schema.path("email"));
  assert.ok(AccountModel.schema.path("password"));
  assert.ok(AccountModel.schema.path("role"));
  assert.equal(AccountModel.schema.path("name"), undefined);
  assert.equal(AccountModel.schema.path("sellerProfile"), undefined);

  assert.ok(UserProfileModel.schema.path("account"));
  assert.ok(UserProfileModel.schema.path("name"));
  assert.ok(UserProfileModel.schema.path("sellerProfile"));
  assert.equal(UserProfileModel.schema.path("email"), undefined);
  assert.equal(UserProfileModel.schema.path("password"), undefined);
});
