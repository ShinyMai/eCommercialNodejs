import type { ClientSession, Types } from "mongoose";
import { CartModel } from "#/models/cart.model.js";
import { withSession } from "#/utils/mongo.js";

type CartItemInput = { product: Types.ObjectId; quantity: number };

/** Returns a hydrated document so callers can modify items and `save()` with optimistic concurrency. */
const findCartDocumentByAccount = (accountId: Types.ObjectId) => CartModel.findOne({ cart_account: accountId }).exec();

const findCartItemsByAccount = (accountId: Types.ObjectId) =>
  CartModel.findOne({ cart_account: accountId }).select("cart_items").lean().exec();

/** Matches only a cart owned by the given account. */
const findOwnedCart = (cartId: string, accountId: string, session?: ClientSession) =>
  withSession(CartModel.findOne({ _id: cartId, cart_account: accountId }), session);

const createCart = (accountId: Types.ObjectId, items: CartItemInput[]) =>
  CartModel.create({ cart_account: accountId, cart_items: items });

export { findCartDocumentByAccount, findCartItemsByAccount, findOwnedCart, createCart };
