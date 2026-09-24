"use strict";

import { getSelectData } from "#/common/utils/index.js";
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

const findProducts = ({
  filter = {},
  search,
  limit,
  skip,
  sort = "newest",
  select,
}: FindProductsParams) => {
  const query = search
    ? { ...filter, $text: { $search: search } }
    : filter;
  const sortBy: Record<string, SortOrder | { $meta: "textScore" }> = search
    ? { score: { $meta: "textScore" } }
    : { createdAt: sort === "newest" ? -1 : 1 };
  const projection = search ? { score: { $meta: "textScore" } } : undefined;

  return ProductModel.find(query, projection)
    .populate("product_shop", "name email -_id")
    .sort(sortBy)
    .skip(skip)
    .limit(limit)
    .select(select ? getSelectData({ select }) : {})
    .lean()
    .exec();
};

const setProductsPublication = async ({
  productIds,
  shopId,
  isPublished,
}: {
  productIds: string[];
  shopId: string;
  isPublished: boolean;
}) => {
  const { matchedCount, modifiedCount } = await ProductModel.updateMany(
    {
      product_shop: new Types.ObjectId(shopId),
      _id: { $in: productIds.map((id) => new Types.ObjectId(id)) },
    },
    { $set: { isDraft: !isPublished, isPublished } },
  ).exec();

  return { matchedCount, modifiedCount };
};

export { findProducts, setProductsPublication };
