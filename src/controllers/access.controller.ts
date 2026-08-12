"use strict";
import { NextFunction, Request, Response } from "express";
import AccessService from "@/services/access.service.js";
import { SuccessResponse } from "@/core/success.response.js";
import { createApiKey } from "@/services/apiKey.service.js";
import type { RequestWithKeyStore } from "@/auth/authUtils.js";

class AccessController {
  static async logout(
    req: RequestWithKeyStore,
    res: Response,
    next: NextFunction,
  ) {
    await AccessService.logout(String(req.keyStore?._id));

    res.clearCookie("refreshToken", { path: "/auth" });

    SuccessResponse.ok(res, {
      message: "Logged out successfully",
      metadata: {},
    });
  }

  static async handleRefreshToken(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const refreshToken =
      req.cookies?.refreshToken || req.body.refreshToken || "";

    const result = await AccessService.handleRefreshToken(refreshToken);

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    SuccessResponse.ok(res, {
      message: "Token refreshed successfully",
      metadata: {
        accessToken: result.accessToken,
      },
    });
  }

  static async shopSignup(req: Request, res: Response, next: NextFunction) {
    SuccessResponse.created(res, {
      message: "Shop created successfully",
      metadata: await AccessService.signup(req.body),
    });
  }

  static async shopLogin(req: Request, res: Response, next: NextFunction) {
    const result = await AccessService.login(req.body);

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    SuccessResponse.ok(res, {
      message: "Shop logged in successfully",
      metadata: {
        shop: result.shop,
        accessToken: result.accessToken,
      },
    });
  }

  static async createApiKey(req: Request, res: Response, next: NextFunction) {
    SuccessResponse.created(res, {
      message: "API key created successfully",
      metadata: await createApiKey(req.body.permissions),
    });
  }
}

export default AccessController;
