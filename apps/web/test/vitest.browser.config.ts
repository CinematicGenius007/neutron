import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  optimizeDeps: {
    include: ["react", "react-dom/client", "react/jsx-dev-runtime", "react/jsx-runtime"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  test: {
    include: ["test/browser/**/*.browser.{ts,tsx}"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
