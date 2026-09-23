"use strict";

import { ProductModel } from "@/models/products.model.js";
import { Types } from "mongoose";

export interface FindAllDraftsForShopParams {
  query?: Record<string, any>;
  keySearch?: string;
  limit: number;
  skip: number;
}

const queryProduct = async ({
  query,
  limit,
  skip,
}: FindAllDraftsForShopParams) => {
  return await ProductModel.find(query)
    .populate("product_shop", "name email -_id")
    .sort({ updateAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
};

const findAllDraftsForShop = async ({
  query,
  limit,
  skip,
}: FindAllDraftsForShopParams) => {
  return await queryProduct({ query, limit, skip });
};

const findAllPublishedForShop = async ({
  query,
  limit,
  skip,
}: FindAllDraftsForShopParams) => {
  return await queryProduct({ query, limit, skip });
};

const searchProductByUser = async ({
  keySearch,
  limit,
  skip,
}: FindAllDraftsForShopParams) => {
  const regex = new RegExp(keySearch || "", "i"); // Case-insensitive regex for searching
  const results = await ProductModel.find(
    {
      isPublished: true,
      $text: { $search: regex.source }, // Use text index for searching
    },
    { score: { $meta: "textScore" } }, // Use text index for searching
  )
    .populate("product_shop", "name email -_id")
    .sort({
      score: { $meta: "textScore" },
    })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();

  return results;
};

const publicationProduct = async ({
  product_id,
  product_shop,
}: {
  product_id: string[];
  product_shop: string;
}) => {
  const shop = await ProductModel.findOne({
    product_shop: new Types.ObjectId(product_shop),
  })
    .lean()
    .exec();

  if (!shop) {
    return { modifiedCount: 0, success: false };
  }
  shop.isDraft = false;
  shop.isPublished = true;

  const { modifiedCount } = await ProductModel.updateMany(
    {
      product_shop: new Types.ObjectId(product_shop),
      _id: { $in: product_id.map((id) => new Types.ObjectId(id)) },
    },
    shop,
  ).exec();
  return { modifiedCount, success: modifiedCount > 0 };
};

const unPublicationProduct = async ({
  product_id,
  product_shop,
}: {
  product_id: string[];
  product_shop: string;
}) => {
  const shop = await ProductModel.findOne({
    product_shop: new Types.ObjectId(product_shop),
  })
    .lean()
    .exec();

  if (!shop) {
    return { modifiedCount: 0, success: false };
  }
  shop.isDraft = true;
  shop.isPublished = false;

  const { modifiedCount } = await ProductModel.updateMany(
    {
      product_shop: new Types.ObjectId(product_shop),
      _id: { $in: product_id.map((id) => new Types.ObjectId(id)) },
    },
    shop,
  ).exec();
  return { modifiedCount, success: modifiedCount > 0 };
};

export {
  findAllDraftsForShop,
  findAllPublishedForShop,
  publicationProduct,
  unPublicationProduct,
  searchProductByUser,
};
