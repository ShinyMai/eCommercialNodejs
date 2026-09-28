"use strict";

import inventoryModel, { Inventory } from "../inventory.model.js";

const insertInventory = async (payload: Partial<Inventory>) => {
  return await inventoryModel.create(payload);
};

export { insertInventory };
