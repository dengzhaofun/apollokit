import { tool } from "ai";

import { CreateCurrencySchema } from "../../currency/validators";

export const applyCurrencyDefinition = tool({
  description:
    "Propose a complete currency definition to apply to the form. " +
    "The user reviews before saving.",
  inputSchema: CreateCurrencySchema,
});
