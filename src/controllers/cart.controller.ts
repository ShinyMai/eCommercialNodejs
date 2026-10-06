import type { Response } from "express";
import { SuccessResponse } from "#/core/success.response.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import CartService from "#/services/cart.service.js";

interface AddCartItemInput {
  productId: string;
  quantity: number;
}

interface UpdateCartItemInput {
  quantity: number;
}

class CartController {
  static async addToCart(req: AuthenticatedRequest<AddCartItemInput>, res: Response) {
    const { productId, quantity } = req.body;
    return SuccessResponse.ok(res, {
      message: "Add to cart successfully",
      items: await CartService.addProductToCart(req.auth.accountId, productId, quantity),
    });
  }

  static async updateCart(req: AuthenticatedRequest<UpdateCartItemInput>, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Update cart successfully",
      items: await CartService.updateProductQuantity(
        req.auth.accountId,
        String(req.params.productId),
        req.body.quantity,
      ),
    });
  }

  static async getCart(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Get cart successfully",
      items: await CartService.getCartItems(req.auth.accountId),
    });
  }

  static async clearCart(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Clear cart successfully",
      items: await CartService.clearCart(req.auth.accountId),
    });
  }

  static async removeProductFromCart(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Remove product from cart successfully",
      items: await CartService.removeProductFromCart(req.auth.accountId, String(req.params.productId)),
    });
  }
}

export default CartController;
