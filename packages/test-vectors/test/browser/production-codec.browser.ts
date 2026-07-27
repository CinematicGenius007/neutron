import { describe, expect, it } from "vitest";

import { verifyCatalog } from "../../src/index.js";
import { loadProductionCatalog } from "../production-catalog.js";
import { productionCodecVerifier } from "../production-codec-verifier.js";

describe("production v1 codec in a real browser", () => {
  it("passes the exact validated immutable catalog", async () => {
    expect(globalThis.window).toBeDefined();
    const catalog = await loadProductionCatalog();
    const results = await verifyCatalog(catalog, productionCodecVerifier);
    expect(results).toHaveLength(83);
    expect(results.filter(({ passed }) => !passed)).toEqual([]);
  }, 60_000);
});
