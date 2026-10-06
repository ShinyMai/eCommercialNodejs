"use strict";

import { BadRequestError, ConflictRequestError } from "#/core/error.response.js";
import { CartModel } from "#/models/cart.model.js";
import { ProductModel } from "#/models/products.model.js";
import { InventoryModel } from "#/models/inventory.model.js";
import DiscountService from "#/services/discount.service.js";
import { validateReviewCheckoutPayload } from "#/models/repositories/checkout.repo.js";
export type { ReviewCheckoutPayload } from "#/models/repositories/checkout.repo.js";
import type { ClientSession } from "mongoose";

class CheckoutService {
  static async reviewCheckout(payload: unknown, authenticatedAccountId?: string, session?: ClientSession) {
    const { cartId, accountId, shop_ids } = validateReviewCheckoutPayload(payload, authenticatedAccountId);
    const cartQuery = CartModel.findOne({ _id: cartId, cart_account: accountId });
    if (session) cartQuery.session(session);
    const foundCart = await cartQuery;

    if (!foundCart) {
      throw new BadRequestError("Cart not found");
    }

    // Tìm các products trong giỏ hàng dựa trên shop_ids và items
    const productQuery = ProductModel.find({
      _id: { $in: shop_ids.flatMap((shop) => shop.items.map((item) => item.product_id)) },
    });
    if (session) productQuery.session(session);
    const products = await productQuery.select("product_price product_seller")
      .lean()
      .exec();
    // Tạo một bản đồ để tra cứu sản phẩm theo product_id
    const productById = new Map(products.map((product) => [product._id.toString(), product]));
    const inventoryQuery = InventoryModel.find({
      $or: shop_ids.flatMap((shop) => shop.items.map((item) => ({
        inven_productId: item.product_id,
        inven_sellerId: shop.shop_id,
      }))),
    });
    if (session) inventoryQuery.session(session);
    const inventories = await inventoryQuery.select("inven_productId inven_sellerId inven_stock").lean().exec();
    const stockByProductAndSeller = new Map(inventories.map((inventory) => [
      `${inventory.inven_productId}:${inventory.inven_sellerId}`, inventory.inven_stock,
    ]));

    const selectedShops = shop_ids.map((shop) => {
      const shopItems = shop.items.map((item) => {
        // Xác nhận rằng sản phẩm tồn tại trong giỏ hàng và thuộc về cửa hàng đúng
        const cartItem = foundCart.cart_items.find((cartItem) => cartItem.product.toString() === item.product_id);
        if (!cartItem) {
          throw new BadRequestError(`Item ${item.product_id} not found in cart`);
        }
        const product = productById.get(item.product_id);
        if (!product || product.product_seller.toString() !== shop.shop_id) {
          throw new BadRequestError(`Product ${item.product_id} not found for this shop`);
        }
        const stock = stockByProductAndSeller.get(`${item.product_id}:${shop.shop_id}`);
        if (stock === undefined) {
          throw new ConflictRequestError(`Inventory is not available for product ${item.product_id}`);
        }
        if (!Number.isFinite(stock) || stock < 0 || item.quantity > stock) {
          throw new ConflictRequestError(`Insufficient stock for product ${item.product_id}; available: ${stock}`);
        }
        return {
          product_id: item.product_id,
          price: product.product_price,
          quantity: item.quantity,
        };
      });
      return {
        ...shop,
        items: shopItems,
      };
    });

    const checkout_summary = [];
    for (const shop of selectedShops) {
      const shopId = shop.shop_id;
      // Tính toán tổng giá và giảm giá cho từng shop
      const total_price = shop.items.reduce((total, item) => total + item.price * item.quantity, 0);
      let total_discount = 0;
      if (shop.discount_id) {
        const discount = await DiscountService.getDiscountAmount(
          shop.discount_id,
          shop.items.map((item) => ({ productId: item.product_id, quantity: item.quantity })),
          shopId,
          accountId,
          session,
        );
        // DiscountService reads prices again; reject a changed subtotal instead of mixing snapshots.
        if (discount.totalPrice !== total_price) {
          throw new ConflictRequestError("Product prices changed; please retry checkout review");
        }
        total_discount = discount.discountAmount;
      }
      checkout_summary.push({ ...shop, total_price, total_discount, total_checkout: total_price - total_discount });
    }

    const checkout_order = {
      total_price: 0,
      fee_shipping: 0,
      total_discount: 0,
      total_checkout: 0,
    };

    // Calculate total price, shipping fee, discount, and total checkout
    checkout_summary.forEach((shop) => {
      checkout_order.total_discount += shop.total_discount;
      shop.items.forEach((item) => {
        checkout_order.total_price += item.price * item.quantity;
        checkout_order.fee_shipping += 5; // Example shipping fee
      });
    });

    checkout_order.total_checkout =
      checkout_order.total_price + checkout_order.fee_shipping - checkout_order.total_discount;

    // return checkoutSummary;
    return {
      checkout_summary,
      checkout_order,
    };
  }
}

export default CheckoutService;
