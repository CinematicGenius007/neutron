import { describe, expect, it } from "vitest";
import { detectBrowserSupport } from "../src/browser-support.js";

describe("browser support gate", () => {
  it("reports every required missing capability without touching vault state", () => {
    const result = detectBrowserSupport({} as typeof globalThis);
    expect(result.supported).toBe(false);
    expect(result.missing).toEqual([
      "module workers",
      "WebAssembly",
      "IndexedDB",
      "Web Crypto",
      "text encoding",
      "service workers",
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.missing)).toBe(true);
  });
});
