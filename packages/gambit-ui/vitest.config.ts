import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    // These render real components, so they need a DOM.
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.test.tsx"],
  },
});
