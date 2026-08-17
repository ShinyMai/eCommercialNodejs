"use strict";

import {
  ClothingModel,
  ElectronicsModel,
  Product,
  ProductModel,
} from "@/models/products.model.js";

class ProductService {
  constructor(protected product: Product) {}

  async createProduct() {
    return ProductModel.create(this.product);
  }
}

class ClothingService extends ProductService {
  async createProduct() {
    const newClothing = await ClothingModel.create(
      this.product.product_attributes,
    );
    if (!newClothing) {
      throw new Error("Failed to create clothing product attributes");
    }

    const newProduct = await super.createProduct();
    if (!newProduct) {
      throw new Error("Failed to create product");
    }

    return newProduct;
  }
}

class ElectronicsService extends ProductService {
  async createProduct() {
    const newElectronics = await ElectronicsModel.create(
      this.product.product_attributes,
    );
    if (!newElectronics) {
      throw new Error("Failed to create electronics product attributes");
    }

    const newProduct = await super.createProduct();
    if (!newProduct) {
      throw new Error("Failed to create product");
    }

    return newProduct;
  }
}

class ProductFactory {
  static async createProduct(
    productType: Product["product_type"],
    payload: Product,
  ) {
    switch (productType) {
      case "Clothing":
        return new ClothingService(payload).createProduct();

      case "Electronics":
        return new ElectronicsService(payload).createProduct();

      default:
        throw new Error(`Invalid product type: ${productType}`);
    }
  }
}

export { ProductFactory };
