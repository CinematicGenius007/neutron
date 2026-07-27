import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/production-codec.conformance.ts"],
  },
});
