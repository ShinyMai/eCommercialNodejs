"use strict";

import config from "#/configs/index.js";
import { AuthFailureError } from "#/core/error.response.js";
import { SuccessResponse } from "#/core/success.response.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import AuthService from "#/services/auth.service.js";
import type { Request, Response } from "express";

const setRefreshCookie = (res: Response, refreshToken: string) => {
  res.cookie(config.auth.refreshCookieName, refreshToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: config.auth.refreshCookiePath,
    maxAge: config.auth.refreshCookieMaxAgeMs,
  });
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie(config.auth.refreshCookieName, {
    path: config.auth.refreshCookiePath,
    secure: config.isProduction,
    sameSite: "lax",
  });
};

const sendAuthenticatedAccount = (
  res: Response,
  result: Awaited<ReturnType<typeof AuthService.login>>,
  created = false,
) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  setRefreshCookie(res, result.refreshToken);
  const payload = {
    message: created ? "Account created successfully" : "Logged in successfully",
    items: { account: result.account, accessToken: result.accessToken },
  };
  return created
    ? SuccessResponse.created(res, payload)
    : SuccessResponse.ok(res, payload);
};

class AuthController {
  static async logout(req: AuthenticatedRequest, res: Response) {
    await AuthService.logout(req.auth.sessionId);
    clearRefreshCookie(res);
    return SuccessResponse.ok(res, { message: "Logged out successfully", items: null });
  }

  static async refresh(req: Request, res: Response) {
    const bodyToken = req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>).refreshToken
      : undefined;
    const refreshToken = req.cookies?.[config.auth.refreshCookieName] ?? bodyToken;

    let result;
    try {
      result = await AuthService.handleRefreshToken(
        typeof refreshToken === "string" ? refreshToken : "",
      );
    } catch (error) {
      if (error instanceof AuthFailureError) clearRefreshCookie(res);
      throw error;
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    setRefreshCookie(res, result.refreshToken);
    return SuccessResponse.ok(res, {
      message: "Token refreshed successfully",
      items: { accessToken: result.accessToken },
    });
  }

  static async signupBuyer(req: Request, res: Response) {
    return sendAuthenticatedAccount(res, await AuthService.signup(req.body, "buyer"), true);
  }

  static async signupSeller(req: Request, res: Response) {
    return sendAuthenticatedAccount(res, await AuthService.signup(req.body, "seller"), true);
  }

  static async login(req: Request, res: Response) {
    return sendAuthenticatedAccount(res, await AuthService.login(req.body));
  }
}

export default AuthController;
