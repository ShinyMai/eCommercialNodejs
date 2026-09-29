"use strict";

import { getPagination } from "#/common/utils/index.js";
import { SuccessResponse } from "#/core/success.response.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import AccountsService, {
  type UpdateProfileInput,
  type UpdateRoleInput,
  type UpdateStatusInput,
} from "#/services/accounts.service.js";
import type { Response } from "express";

class AccountsController {
  static async me(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Account retrieved successfully",
      items: await AccountsService.getAccount(req.auth.accountId),
    });
  }

  static async updateMyProfile(req: AuthenticatedRequest<UpdateProfileInput>, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Profile updated successfully",
      items: await AccountsService.updateOwnProfile(
        req.auth.accountId,
        req.auth.role,
        req.body,
      ),
    });
  }

  static async list(req: AuthenticatedRequest, res: Response) {
    const { page, limit } = getPagination(req.query);
    const result = await AccountsService.list({
      role: typeof req.query.role === "string" ? req.query.role : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      page,
      limit,
    });
    return SuccessResponse.ok(res, {
      message: "Accounts retrieved successfully",
      items: result.accounts,
      pagination: { page, limit, total: result.total },
    });
  }

  static async updateRole(req: AuthenticatedRequest<UpdateRoleInput>, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Account role updated successfully",
      items: await AccountsService.updateRole(
        req.auth.accountId,
        String(req.params.id),
        req.body?.role,
        req.body?.sellerProfile,
      ),
    });
  }

  static async updateStatus(req: AuthenticatedRequest<UpdateStatusInput>, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Account status updated successfully",
      items: await AccountsService.updateStatus(
        req.auth.accountId,
        String(req.params.id),
        req.body?.status,
      ),
    });
  }

  static async approveSeller(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Seller registration approved successfully",
      items: await AccountsService.approveSeller(String(req.params.id)),
    });
  }
}

export default AccountsController;
