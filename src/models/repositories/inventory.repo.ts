"use strict";

import inventoryModel, { Inventory } from "../inventory.model.js";

const insertInventory = async (payload: Partial<Inventory>) => {
  return inventoryModel.create(payload);
};

const setInventoryStock = async (
  productId: string,
  sellerId: string,
  stock: number,
) => {
  const result = await inventoryModel.updateOne(
    { inven_productId: productId, inven_sellerId: sellerId },
    {
      $set: { inven_stock: stock },
      $setOnInsert: { inven_location: "default" },
    },
    { runValidators: true, upsert: true },
  );
  return result;
};

export { insertInventory, setInventoryStock };
