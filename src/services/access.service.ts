"use strict";

import shopModel from "@/models/shop.model.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import KeyTokenService from "./keyToken.service.js";
import { createTokenPair } from "@/auth/authUtils.js";
import { getInfoData } from "@/utils/index.js";

interface SignUpPayload {
  name: string;
  email: string;
  password: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface ServiceResponse<T = unknown> {
  code: number;
  status: "success" | "error";
  message: string;
  metadata?: T;
}

const RoleShop = {
  SHOP: "shop",
  WRITE: "0",
  EDITOR: "1",
  ADMIN: "2",
} as const;

const StatusCode = {
  CREATED: 201,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
} as const;

const BCRYPT_SALT_ROUNDS = 10;
const RSA_MODULUS_LENGTH = 4096;

export default class AccessService {
  static signup = async ({
    name,
    email,
    password,
  }: SignUpPayload): Promise<ServiceResponse> => {
    let createdShopId: string | null = null;

    try {
      const emailTaken = await AccessService.isEmailTaken(email);
      if (emailTaken) {
        return {
          code: StatusCode.CONFLICT,
          status: "error",
          message: "Email already exists",
        };
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

      const newShop = await shopModel.create({
        name,
        email,
        password: passwordHash,
        role: [RoleShop.SHOP],
      });

      createdShopId = newShop._id.toString();

      const { privateKey, publicKey } = AccessService.generateRsaKeyPair();

      const keyTokenCreated = await KeyTokenService.createKeyToken({
        user: { id: createdShopId },
        publicKey,
      });

      if (!keyTokenCreated) {
        await AccessService.rollbackShop(createdShopId);
        return {
          code: StatusCode.INTERNAL_ERROR,
          status: "error",
          message: "Failed to create key token",
        };
      }

      const tokens = await createTokenPair(
        {
          userId: newShop._id,
          email: newShop.email,
        },
        publicKey,
        privateKey
      );

      if (!tokens) {
        await AccessService.rollbackShop(createdShopId);
        return {
          code: StatusCode.INTERNAL_ERROR,
          status: "error",
          message: "Failed to create authentication tokens",
        };
      }

      return {
        code: StatusCode.CREATED,
        status: "success",
        message: "Shop created successfully",
        metadata: {
          shop: getInfoData({
            field: ["_id", "name", "email", "role"],
            object: newShop,
          }),
          tokens,
        },
      };
    } catch (error) {
      console.error("[AccessService.signup] error:", error);

      if (createdShopId) {
        await AccessService.rollbackShop(createdShopId);
      }

      return {
        code: StatusCode.INTERNAL_ERROR,
        status: "error",
        message: "Something went wrong while creating the shop",
      };
    }
  };

  private static isEmailTaken = async (email: string): Promise<boolean> => {
    const existing = await shopModel.findOne({ email }).lean();
    return Boolean(existing);
  };

  private static generateRsaKeyPair = () => {
    return crypto.generateKeyPairSync("rsa", {
      modulusLength: RSA_MODULUS_LENGTH,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });
  };

  private static rollbackShop = async (shopId: string): Promise<void> => {
    try {
      await shopModel.deleteOne({ _id: shopId });
    } catch (cleanupError) {
      console.error(
        `[AccessService.rollbackShop] failed to delete shop ${shopId}:`,
        cleanupError
      );
    }
  };
}
