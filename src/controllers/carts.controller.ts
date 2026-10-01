"use strict";

import { SuccessResponse } from "#/core/success.response.js";
import CartService from "#/services/cart.service.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import type { Response } from "express";

interface AddCartItemInput {
  productId: string;
  quantity: number;
}

interface UpdateCartItemInput {
  quantity: number;
}

class CartController {
  addToCart = async (req: AuthenticatedRequest<AddCartItemInput>, res: Response) => {
    const { productId, quantity } = req.body;
    return SuccessResponse.ok(res, {
      message: "Add to cart successfully",
      items: await CartService.addProductToCart(req.auth.accountId, productId, quantity),
    });
  };

  updateCart = async (req: AuthenticatedRequest<UpdateCartItemInput>, res: Response) => {
    const productId = String(req.params.productId);
    const { quantity } = req.body;
    return SuccessResponse.ok(res, {
      message: "Update cart successfully",
      items: await CartService.updateProductQuantity(req.auth.accountId, productId, quantity),
    });
  };

  getCart = async (req: AuthenticatedRequest, res: Response) => {
    return SuccessResponse.ok(res, {
      message: "Get cart successfully",
      items: await CartService.getCartItems(req.auth.accountId),
    });
  };

  clearCart = async (req: AuthenticatedRequest, res: Response) => {
    return SuccessResponse.ok(res, {
      message: "Clear cart successfully",
      items: await CartService.clearCart(req.auth.accountId),
    });
  };

  removeProductFromCart = async (req: AuthenticatedRequest, res: Response) => {
    const productId = String(req.params.productId);
    return SuccessResponse.ok(res, {
      message: "Remove product from cart successfully",
      items: await CartService.removeProductFromCart(req.auth.accountId, productId),
    });
  };
}

export const cartController = new CartController();
