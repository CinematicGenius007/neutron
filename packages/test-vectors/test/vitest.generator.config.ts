import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/reference-generator.generator.ts"] },
});
