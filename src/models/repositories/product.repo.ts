'use strict'

import {ProductModel} from "@/models/products.model.js";
import {Types} from "mongoose";

export interface FindAllDraftsForShopParams {
  query: Record<string, any>;
  limit: number;
  skip: number;
}

const queryProduct = async ({query, limit, skip}: FindAllDraftsForShopParams)=> {
    return await ProductModel.find(query).populate('product_shop', 'name email -_id').sort({updateAt: -1}).skip(skip).limit(limit).lean().exec()
}

const findAllDraftsForShop = async ({query, limit, skip}: FindAllDraftsForShopParams)=> {
    return await queryProduct({query, limit, skip})
}

const findAllPublishedForShop = async ({query, limit, skip}: FindAllDraftsForShopParams)=> {
    return await queryProduct({query, limit, skip})
}

const searchProductByUser

const publicationProduct = async ({product_id, product_shop}: {product_id: string[], product_shop: string}) => {
    const shop = await ProductModel.findOne({product_shop: new Types.ObjectId(product_shop)}).lean().exec()

    if (!shop) {
        return { modifiedCount: 0, success: false };
    }
    shop.isDraft = false
    shop.isPublished = true

    const { modifiedCount } = await ProductModel.updateMany({product_shop: new Types.ObjectId(product_shop), _id: {$in: product_id.map(id => new Types.ObjectId(id))}}, shop).exec()
    return { modifiedCount, success: modifiedCount > 0 };
}

const unPublicationProduct = async ({product_id, product_shop}: {product_id: string[], product_shop: string}) => {
    const shop = await ProductModel.findOne({product_shop: new Types.ObjectId(product_shop)}).lean().exec()

    if (!shop) {
        return { modifiedCount: 0, success: false };
    }
    shop.isDraft = true
    shop.isPublished = false

    const { modifiedCount } = await ProductModel.updateMany({product_shop: new Types.ObjectId(product_shop), _id: {$in: product_id.map(id => new Types.ObjectId(id))}}, shop).exec()
    return { modifiedCount, success: modifiedCount > 0 };
}

export {findAllDraftsForShop, findAllPublishedForShop, publicationProduct, unPublicationProduct}