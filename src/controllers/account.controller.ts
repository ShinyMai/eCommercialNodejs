import type { Response } from "express";
import { SuccessResponse } from "#/core/success.response.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import AccountService, {
  type UpdateProfileInput,
  type UpdateRoleInput,
  type UpdateStatusInput,
} from "#/services/account.service.js";
import { getPagination, getQueryString } from "#/utils/index.js";

class AccountController {
  static async me(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Account retrieved successfully",
      items: await AccountService.getAccount(req.auth.accountId),
    });
  }

  static async updateMyProfile(req: AuthenticatedRequest<UpdateProfileInput>, res: Response) {
    const { accountId, role } = req.auth;
    return SuccessResponse.ok(res, {
      message: "Profile updated successfully",
      items: await AccountService.updateOwnProfile(accountId, role, req.body),
    });
  }

  static async list(req: AuthenticatedRequest, res: Response) {
    const { page, limit } = getPagination(req.query);
    const { accounts, total } = await AccountService.list({
      role: getQueryString(req.query, "role"),
      status: getQueryString(req.query, "status"),
      page,
      limit,
    });
    return SuccessResponse.ok(res, {
      message: "Accounts retrieved successfully",
      items: accounts,
      pagination: { page, limit, total },
    });
  }

  static async updateRole(req: AuthenticatedRequest<UpdateRoleInput>, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Account role updated successfully",
      items: await AccountService.updateRole(
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
      items: await AccountService.updateStatus(req.auth.accountId, String(req.params.id), req.body?.status),
    });
  }

  static async approveSeller(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Seller registration approved successfully",
      items: await AccountService.approveSeller(String(req.params.id)),
    });
  }
}

export default AccountController;
