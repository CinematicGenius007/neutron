import { describe, expect, it } from "vitest";

import {
  decodeVaultItem,
  encodeVaultItem,
  parseVaultItem,
  type VaultItem,
  VaultItemFailure,
} from "../src/index.js";

const items: readonly VaultItem[] = [
  {
    schemaVersion: 1,
    type: "login",
    title: "Primary login",
    tags: ["personal", "critical"],
    username: "alice@example.invalid",
    password: "synthetic-password-sentinel",
    url: "https://vault-fixture.invalid/login",
    notes: "synthetic login note",
  },
  {
    schemaVersion: 1,
    type: "secure-note",
    title: "Offline note",
    tags: ["offline"],
    body: "synthetic secure note sentinel",
  },
  {
    schemaVersion: 1,
    type: "totp",
    title: "Synthetic OTP",
    tags: ["second-factor"],
    secretBase32: "JBSWY3DPEHPK3PXP",
    issuer: "Fixture issuer",
    accountName: "alice@example.invalid",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  },
  {
    schemaVersion: 1,
    type: "backup-code",
    title: "Synthetic recovery codes",
    tags: ["recovery"],
    codes: ["fixture-code-0001", "fixture-code-0002"],
    notes: "not a real account",
  },
  {
    schemaVersion: 1,
    type: "json",
    title: "Synthetic JSON",
    tags: ["custom"],
    value: { nested: { enabled: true }, values: [1, "fixture-json-sentinel", null] },
  },
];

describe("vault item payload codec", () => {
  it("round-trips every required item type canonically", () => {
    for (const item of items) {
      const first = encodeVaultItem(item);
      const decoded = decodeVaultItem(first);
      expect(decoded).toEqual(item);
      expect(encodeVaultItem(decoded)).toEqual(first);
      expect(Object.isFrozen(decoded)).toBe(true);
    }
  });

  it("rejects unknown, hidden, symbolic, and accessor properties", () => {
    const valid = { ...items[0] };
    expect(() => parseVaultItem({ ...valid, leaked: "plaintext" })).toThrowError(VaultItemFailure);

    const hidden = { ...valid };
    Object.defineProperty(hidden, "hidden", { enumerable: false, value: "plaintext" });
    expect(() => parseVaultItem(hidden)).toThrowError(VaultItemFailure);

    const symbolic = { ...valid, [Symbol("secret")]: "plaintext" };
    expect(() => parseVaultItem(symbolic)).toThrowError(VaultItemFailure);

    const accessor = { ...valid };
    Object.defineProperty(accessor, "username", { enumerable: true, get: () => "plaintext" });
    expect(() => parseVaultItem(accessor)).toThrowError(VaultItemFailure);
  });

  it("enforces canonical TOTP and bounded JSON", () => {
    const totp = items[2] as Extract<VaultItem, { type: "totp" }>;
    expect(() => parseVaultItem({ ...totp, secretBase32: "AAAAAAAAAAAAAAAAAB" })).toThrowError(
      VaultItemFailure,
    );
    const json = items[4] as Extract<VaultItem, { type: "json" }>;
    expect(() =>
      parseVaultItem({ ...json, value: { __proto__: { polluted: true } } }),
    ).toThrowError(VaultItemFailure);
    expect(() => parseVaultItem({ ...json, value: -0 })).toThrowError(VaultItemFailure);
    expect(() => parseVaultItem({ ...json, value: new Array(10_001).fill(null) })).toThrowError(
      VaultItemFailure,
    );
  });

  it("rejects malformed UTF-8, SharedArrayBuffer, and byte-limit overflow", () => {
    expect(() => decodeVaultItem(Uint8Array.of(0xff))).toThrowError(VaultItemFailure);
    if (typeof SharedArrayBuffer !== "undefined") {
      expect(() => decodeVaultItem(new Uint8Array(new SharedArrayBuffer(8)))).toThrowError(
        VaultItemFailure,
      );
    }
    expect(() => parseVaultItem({ ...items[1], body: "x".repeat(65_537) })).toThrowError(
      expect.objectContaining({ code: "bounds" }),
    );
  });

  it("rejects hostile array subclasses and noncanonical JSON encodings", () => {
    class HostileArray extends Array<unknown> {
      override map(): never[] {
        return [];
      }
    }
    const tags = new HostileArray("real-tag");
    expect(() => parseVaultItem({ ...items[0], tags })).toThrowError(VaultItemFailure);
    const codes = new HostileArray("real-code");
    expect(() => parseVaultItem({ ...items[3], codes })).toThrowError(VaultItemFailure);
    const json = new HostileArray("real-value");
    expect(() => parseVaultItem({ ...items[4], value: json })).toThrowError(VaultItemFailure);

    const canonical = new TextDecoder().decode(encodeVaultItem(items[1]));
    expect(() => decodeVaultItem(new TextEncoder().encode(` ${canonical}`))).toThrowError(
      VaultItemFailure,
    );
    const duplicate = canonical.replace('"body":', '"body":"first","body":');
    expect(() => decodeVaultItem(new TextEncoder().encode(duplicate))).toThrowError(
      VaultItemFailure,
    );
  });
});
