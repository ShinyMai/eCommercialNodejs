"use strict";

import shopModel from "#/models/shop.model.js";
import keyTokenModel from "#/models/keyToken.model.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import KeyTokenService from "./keyToken.service.js";
import { createTokenPair } from "#/auth/token.js";
import {
  AuthFailureError,
  BadRequestError,
  ConflictRequestError,
  ErrorResponse,
  InternalServerError,
} from "#/core/error.response.js";
import log from "#/helpers/logger.js";
import { findByEmail } from "./shop.service.js";
import config from "#/configs/index.js";

interface Credentials {
  email: string;
  password: string;
}

interface SignUpPayload extends Credentials {
  name: string;
}

const RoleShop = { SHOP: "shop" } as const;

export default class AccessService {
  static signup = async (payload: SignUpPayload) => {
    AccessService.validateSignup(payload);
    const name = payload.name.trim();
    const email = payload.email.trim().toLowerCase();
    let createdShopId: string | undefined;

    try {
      if (await shopModel.exists({ email })) {
        throw new BadRequestError("Email is already taken");
      }

      const password = await bcrypt.hash(
        payload.password,
        config.auth.bcryptSaltRounds,
      );
      const newShop = await shopModel.create({
        name,
        email,
        password,
        role: [RoleShop.SHOP],
      });
      createdShopId = newShop._id.toString();

      const session = await AccessService.createSession({
        userId: createdShopId,
        email: newShop.email,
      });

      return {
        shop: {
          _id: newShop._id,
          name: newShop.name,
          email: newShop.email,
          role: newShop.role,
        },
        ...session,
      };
    } catch (error) {
      if (createdShopId) await AccessService.rollback(createdShopId);
      if (error instanceof ErrorResponse) throw error;
      if (
        error instanceof Error &&
        "code" in error &&
        (error as Error & { code?: number }).code === 11000
      ) {
        throw new ConflictRequestError("Email is already taken");
      }

      log.error("AccessService.signup", error, { email });
      throw new InternalServerError(
        "Something went wrong while creating the shop",
        undefined,
        error,
      );
    }
  };

  static login = async ({ email, password }: Credentials) => {
    if (!email?.trim() || !password) {
      throw new BadRequestError("Email and password are required");
    }

    const foundShop = await findByEmail({ email: email.trim() });
    if (!foundShop) throw new AuthFailureError("Invalid email or password");

    const matches = await bcrypt.compare(password, foundShop.password || "");
    if (!matches) throw new AuthFailureError("Invalid email or password");

    const session = await AccessService.createSession({
      userId: foundShop._id.toString(),
      email: foundShop.email,
    });

    return {
      shop: {
        _id: foundShop._id,
        name: foundShop.name,
        email: foundShop.email,
        role: foundShop.role,
      },
      ...session,
    };
  };

  static logout = async (keyStoreId: string): Promise<void> => {
    await KeyTokenService.removeKeyById(keyStoreId);
  };

  static handleRefreshToken = (refreshToken: string) =>
    KeyTokenService.refreshToken(refreshToken);

  private static validateSignup(payload: SignUpPayload): void {
    if (!payload?.name?.trim() || !payload.email?.trim() || !payload.password) {
      throw new BadRequestError("Name, email, and password are required");
    }
    if (!/^\S+@\S+\.\S+$/.test(payload.email)) {
      throw new BadRequestError("Email is invalid");
    }
    if (payload.password.length < 6) {
      throw new BadRequestError("Password must contain at least 6 characters");
    }
  }

  private static async createSession({
    userId,
    email,
  }: {
    userId: string;
    email?: string;
  }) {
    const { privateKey, publicKey } = await AccessService.generateRsaKeyPair();
    const tokens = createTokenPair({ userId, email }, publicKey, privateKey);

    await KeyTokenService.createKeyToken({
      user: { id: userId },
      publicKey,
      privateKey,
      refreshToken: tokens.refreshToken,
    });
    return tokens;
  }

  private static generateRsaKeyPair = (): Promise<{
    publicKey: string;
    privateKey: string;
  }> =>
    new Promise((resolve, reject) => {
      crypto.generateKeyPair(
        "rsa",
        {
          modulusLength: config.auth.rsaModulusLength,
          publicKeyEncoding: { type: "spki", format: "pem" },
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
        },
        (error, publicKey, privateKey) => {
          if (error) reject(error);
          else resolve({ publicKey, privateKey });
        },
      );
    });

  private static rollback = async (shopId: string): Promise<void> => {
    const results = await Promise.allSettled([
      shopModel.deleteOne({ _id: shopId }),
      keyTokenModel.deleteOne({ user: shopId }),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        log.error("AccessService.rollback", result.reason, { shopId });
      }
    }
  };
}
