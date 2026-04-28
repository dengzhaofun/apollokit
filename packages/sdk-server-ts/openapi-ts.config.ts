import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../sdk-core/specs/openapi-admin.json",
  output: "src/generated",
  plugins: ["@hey-api/typescript", "@hey-api/sdk", "@hey-api/client-fetch"],
});
