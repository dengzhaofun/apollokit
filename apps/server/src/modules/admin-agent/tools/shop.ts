import { tool } from "ai";

import { CreateProductSchema } from "../../shop/validators";

/**
 * Shop has products, categories, and tags. MVP only proposes products
 * (the most common create flow); category/tag management stays manual
 * for now.
 */
export const applyShopProductConfig = tool({
  description:
    "Propose a complete shop product configuration to apply to the form. " +
    "The user reviews before saving.",
  inputSchema: CreateProductSchema,
});
