import type { Request, Response } from "express";
import { SuccessResponse } from "#/core/success.response.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import { ProductService } from "#/services/product.service.js";
import { getPagination, getQueryString } from "#/utils/index.js";
import {
  parseSellerProductStatus,
  parseSetPublicationInput,
  type CreateProductInput,
  type SetPublicationInput,
} from "#/validators/product.validator.js";

class ProductController {
  static async createProduct(req: AuthenticatedRequest<CreateProductInput>, res: Response) {
    return SuccessResponse.created(res, {
      message: "Product created successfully",
      items: await ProductService.createProduct(req.body, req.auth.accountId),
    });
  }

  static async updateProduct(req: AuthenticatedRequest<Partial<CreateProductInput>>, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Product updated successfully",
      items: await ProductService.updateProduct(String(req.params.id), req.auth.accountId, req.body),
    });
  }

  static async setPublication(req: AuthenticatedRequest<SetPublicationInput>, res: Response) {
    const { productIds, isPublished } = parseSetPublicationInput(req.body);
    return SuccessResponse.ok(res, {
      message: `Products ${isPublished ? "published" : "unpublished"} successfully`,
      items: await ProductService.setPublication({ sellerId: req.auth.accountId, productIds, isPublished }),
    });
  }

  static async listSellerProducts(req: AuthenticatedRequest, res: Response) {
    const { limit, page, skip } = getPagination(req.query);
    const status = parseSellerProductStatus(getQueryString(req.query, "status"));
    return SuccessResponse.ok(res, {
      message: "Seller products retrieved successfully",
      items: await ProductService.listSellerProducts({ sellerId: req.auth.accountId, status, limit, skip }),
      pagination: { page, limit },
    });
  }

  static async listPublishedProducts(req: Request, res: Response) {
    const { limit, page, skip } = getPagination(req.query);
    return SuccessResponse.ok(res, {
      message: "Products retrieved successfully",
      items: await ProductService.listPublishedProducts({
        search: getQueryString(req.query, "search"),
        sort: req.query.sort === "oldest" ? "oldest" : "newest",
        limit,
        skip,
      }),
      pagination: { page, limit },
    });
  }

  static async detailProduct(req: Request, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Product details retrieved successfully",
      items: await ProductService.getPublishedProduct(String(req.params.id)),
    });
  }
}

export default ProductController;
