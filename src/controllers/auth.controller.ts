"use strict";

import config from "#/configs/index.js";
import { AuthFailureError } from "#/core/error.response.js";
import { SuccessResponse } from "#/core/success.response.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import AuthService from "#/services/auth.service.js";
import type { CredentialsInput, SignUpInput } from "#/auth/validation.js";
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

  static async refresh(req: Request<object, object, { refreshToken?: string }>, res: Response) {
    const bodyToken = req.body && typeof req.body === "object"
      ? req.body.refreshToken
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

  static async signupBuyer(req: Request<object, object, SignUpInput>, res: Response) {
    return sendAuthenticatedAccount(res, await AuthService.signupBuyer(req.body), true);
  }

  static async registerSeller(req: Request<object, object, SignUpInput>, res: Response) {
    const result = await AuthService.registerSeller(req.body);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    return SuccessResponse.created(res, {
      message: "Seller registration submitted and is pending admin approval",
      items: result,
    });
  }

  static async login(req: Request<object, object, CredentialsInput>, res: Response) {
    return sendAuthenticatedAccount(res, await AuthService.login(req.body));
  }
}

export default AuthController;
