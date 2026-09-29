"use strict";

import { getSelectData } from "#/common/utils/index.js";
import { BadRequestError } from "#/core/error.response.js";
import { ProductModel } from "#/models/products.model.js";
import { SortOrder, Types } from "mongoose";

export interface FindProductsParams {
  filter?: Record<string, unknown>;
  search?: string;
  limit: number;
  skip: number;
  sort?: "newest" | "oldest";
  select?: string[];
}

const findProducts = ({ filter = {}, search, limit, skip, sort = "newest", select }: FindProductsParams) => {
  const query = search ? { ...filter, $text: { $search: search } } : filter;
  const sortBy: Record<string, SortOrder | { $meta: "textScore" }> = search
    ? { score: { $meta: "textScore" } }
    : { createdAt: sort === "newest" ? -1 : 1 };
  const projection = search ? { score: { $meta: "textScore" } } : undefined;

  return ProductModel.find(query, projection)
    .populate({
      path: "product_seller",
      select: "role",
      populate: { path: "profile", select: "name sellerProfile.storeName" },
    })
    .sort(sortBy)
    .skip(skip)
    .limit(limit)
    .select(select ? getSelectData({ select }) : {})
    .lean()
    .exec();
};

const detailProduct = async (productId: string) => {
  if (!Types.ObjectId.isValid(productId)) {
    throw new BadRequestError("Invalid product ID");
  }

  return ProductModel.findOne({ _id: productId, isPublished: true })
    .populate({
      path: "product_seller",
      select: "role",
      populate: { path: "profile", select: "name sellerProfile.storeName" },
    })
    .lean()
    .exec();
};

const setProductsPublication = async ({
  productIds,
  sellerId,
  isPublished,
}: {
  productIds: string[];
  sellerId: string;
  isPublished: boolean;
}) => {
  const { matchedCount, modifiedCount } = await ProductModel.updateMany(
    {
      product_seller: new Types.ObjectId(sellerId),
      _id: { $in: productIds.map((id) => new Types.ObjectId(id)) },
    },
    { $set: { isDraft: !isPublished, isPublished } },
  ).exec();

  return { matchedCount, modifiedCount };
};

export { findProducts, setProductsPublication, detailProduct };
