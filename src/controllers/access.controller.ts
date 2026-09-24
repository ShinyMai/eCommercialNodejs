"use strict";
import { Request, Response } from "express";
import AccessService from "#/services/access.service.js";
import { SuccessResponse } from "#/core/success.response.js";
import { createApiKey } from "#/services/apiKey.service.js";
import type { RequestWithKeyStore } from "#/auth/authUtils.js";
import config from "#/configs/index.js";

const setRefreshCookie = (res: Response, refreshToken: string) => {
  res.cookie(config.auth.refreshCookieName, refreshToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: config.auth.refreshCookiePath,
    maxAge: config.auth.refreshCookieMaxAgeMs,
  });
};

const sendAuthenticatedShop = (
  res: Response,
  result: Awaited<ReturnType<typeof AccessService.login>>,
  created = false,
) => {
  setRefreshCookie(res, result.refreshToken);
  const payload = {
    message: created
      ? "Shop created successfully"
      : "Shop logged in successfully",
    metadata: { shop: result.shop, accessToken: result.accessToken },
  };
  return created
    ? SuccessResponse.created(res, payload)
    : SuccessResponse.ok(res, payload);
};

class AccessController {
  static async logout(req: RequestWithKeyStore, res: Response) {
    await AccessService.logout(String(req.keyStore?._id));

    res.clearCookie(config.auth.refreshCookieName, {
      path: config.auth.refreshCookiePath,
      secure: config.isProduction,
      sameSite: "lax",
    });

    SuccessResponse.ok(res, {
      message: "Logged out successfully",
      metadata: {},
    });
  }

  static async handleRefreshToken(req: Request, res: Response) {
    const refreshToken =
      req.cookies?.[config.auth.refreshCookieName] || req.body.refreshToken || "";

    const result = await AccessService.handleRefreshToken(refreshToken);

    setRefreshCookie(res, result.refreshToken);

    SuccessResponse.ok(res, {
      message: "Token refreshed successfully",
      metadata: {
        accessToken: result.accessToken,
      },
    });
  }

  static async shopSignup(req: Request, res: Response) {
    const result = await AccessService.signup(req.body);
    return sendAuthenticatedShop(res, result, true);
  }

  static async shopLogin(req: Request, res: Response) {
    const result = await AccessService.login(req.body);
    return sendAuthenticatedShop(res, result);
  }

  static async createApiKey(req: Request, res: Response) {
    SuccessResponse.created(res, {
      message: "API key created successfully",
      metadata: await createApiKey(req.body.permissions),
    });
  }
}

export default AccessController;
