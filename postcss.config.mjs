import { fileURLToPath } from "node:url";

const restoreBackdropFilter = fileURLToPath(
  new URL("./postcss-restore-backdrop-filter.cjs", import.meta.url),
);

const config = {
  plugins: ["@tailwindcss/postcss", restoreBackdropFilter],
};

export default config;
