/** @type {import("@tinybirdco/sdk").TinybirdConfig} */
const tinybirdConfig = {
  include: ["src/lib/tinybird.ts"],
  token: process.env.TINYBIRD_TOKEN,
  baseUrl: process.env.TINYBIRD_URL,
  devMode: "branch",
};

export default tinybirdConfig;
