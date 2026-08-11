"use strict";

import shopModel from "@/models/shop.model.js";
import keyTokenModel from "@/models/keyToken.model.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import KeyTokenService from "./keyToken.service.js";
import { createTokenPair } from "@/auth/authUtils.js";
import {
  AuthFailureError,
  BadRequestError,
  ErrorResponse,
  InternalServerError,
} from "@/core/error.response.js";
import { getInfoData } from "@/common/utils/index.js";
import log from "@/helpers/logger.js";
import { findByEmail } from "./shop.service.js";

interface SignUpPayload {
  name: string;
  email: string;
  password: string;
}

interface SignUpResult {
  shop: Record<string, unknown>;
}

const RoleShop = {
  SHOP: "shop",
  WRITE: "0",
  EDITOR: "1",
  ADMIN: "2",
} as const;

const BCRYPT_SALT_ROUNDS = 10;
const RSA_MODULUS_LENGTH = 4096;

export default class AccessService {
  static signup = async ({
    name,
    email,
    password,
  }: SignUpPayload): Promise<SignUpResult> => {
    let createdShopId: string | null = null;

    try {
      const emailTaken = await AccessService.isEmailTaken(email);
      if (emailTaken) {
        throw new BadRequestError("Email is already taken");
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

      const tokens = await createTokenPair(
        {
          userId: newShop._id,
          email: newShop.email,
        },
        publicKey,
        privateKey,
      );

      if (!tokens) {
        // keyToken đã tạo thành công ở bước trên nhưng bước ký JWT thất bại
        // -> phải rollback cả keyToken, không chỉ shop, tránh để lại document rác
        await AccessService.rollbackShop(createdShopId);
        await AccessService.rollbackKeyToken(createdShopId);
        throw new InternalServerError("Failed to create authentication tokens");
      }

      const keyTokenCreated = await KeyTokenService.createKeyToken({
        user: { id: createdShopId },
        publicKey,
        privateKey,
        refreshToken: tokens.refreshToken,
      });

      if (!keyTokenCreated) {
        await AccessService.rollbackShop(createdShopId);
        // Lỗi hạ tầng thật sự (ghi DB thất bại) -> không phải lỗi do người dùng nhập sai
        // nên vẫn là InternalServerError (isOperational: false), sẽ được log ở mức "error".
        throw new InternalServerError(
          "Failed to create key token for the shop",
        );
      }

      return {
        shop: getInfoData({
          field: ["_id", "name", "email", "role"],
          object: newShop,
        }),
      };
    } catch (error) {
      if (createdShopId) {
        await AccessService.rollbackShop(createdShopId);
      }

      // Lỗi đã được nhận diện từ trước (BadRequestError, ConflictRequestError...)
      // -> throw lại NGUYÊN VẸN để giữ đúng status code & message cho client
      // (KHÔNG ép thành InternalServerError/500 như code cũ, gây sai lệch response).
      if (error instanceof ErrorResponse) {
        throw error;
      }

      // Chỉ những lỗi KHÔNG xác định trước (DB mất kết nối, bug...) mới log ở mức "error"
      // và bọc lại thành InternalServerError để không lộ chi tiết nội bộ cho client.
      // Không log `password` — chỉ log các trường an toàn để vẫn nhận diện được request nào lỗi.
      log.error("AccessService.signup", error, { email });
      throw new InternalServerError(
        "Something went wrong while creating the shop",
      );
    }
  };

  static login = async ({
    email,
    password,
    refreshToken = "",
  }: {
    email: string;
    password: string;
    refreshToken?: string;
  }) => {
    const foundShop = await findByEmail({ email });
    if (!foundShop) throw new BadRequestError("Shop not registered");

    const match = bcrypt.compare(password, foundShop.password || "");
    if (!match)
      throw new AuthFailureError("Authentication failed: Invalid password");

    const { privateKey, publicKey } = AccessService.generateRsaKeyPair();
    const tokens = await createTokenPair(
      {
        userId: foundShop._id,
        email: foundShop.email,
      },
      publicKey,
      privateKey,
    );

    await KeyTokenService.createKeyToken({
      user: { id: foundShop._id.toString() },
      publicKey,
      privateKey,
      refreshToken: tokens.refreshToken,
    });

    return {
      shop: getInfoData({
        field: ["_id", "name", "email", "role"],
        object: foundShop,
      }),
    };
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
      log.error("AccessService.rollbackShop", cleanupError, { shopId });
    }
  };

  private static rollbackKeyToken = async (shopId: string): Promise<void> => {
    try {
      await keyTokenModel.deleteOne({ user: shopId });
    } catch (cleanupError) {
      log.error("AccessService.rollbackKeyToken", cleanupError, { shopId });
    }
  };
}
