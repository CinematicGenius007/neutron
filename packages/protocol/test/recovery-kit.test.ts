import { describe, expect, it } from "vitest";

import {
  decodeBech32mWords,
  encodeBech32m,
  encodeBech32mWords,
  encodeBech32Words,
} from "../src/bech32m.js";
import { decodeRecoveryKitV1, encodeRecoveryKitV1, RecoveryKitFailure } from "../src/index.js";

const vectors = [
  {
    accountId: "11".repeat(16),
    recoverySecret: "22".repeat(32),
    text: "ntrk1qyg3zyg3zyg3zyg3zyg3zyg3zygjyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsmgwd86",
  },
  {
    accountId: "0102030405060708090a0b0c0d0e0f10",
    recoverySecret: "a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf",
    text: "ntrk1qyqsyqcyq5rqwzqfpg9scrgwpug2pgdz5wj2tf484z5642av4kh2lv93k2emfddkk7utnw4mhj7ma0cnxxqfc",
  },
] as const;

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

describe("offline recovery-kit v1", () => {
  it("matches and round-trips the accepted Neutron vectors", () => {
    for (const vector of vectors) {
      const accountId = hex(vector.accountId);
      const recoverySecret = hex(vector.recoverySecret);
      expect(encodeRecoveryKitV1(accountId, recoverySecret)).toBe(vector.text);
      const decoded = decodeRecoveryKitV1(vector.text);
      expect(decoded.accountId).toEqual(accountId);
      expect(decoded.recoverySecret).toEqual(recoverySecret);
      expect(decoded.version).toBe(1);
      decoded.accountId.fill(0);
      expect(decodeRecoveryKitV1(vector.text).accountId).toEqual(accountId);
    }
  });

  it("reproduces BIP 350 generic valid and invalid checksum vectors", () => {
    for (const valid of [
      "A1LQFN3A",
      "a1lqfn3a",
      "an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6",
      "abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx",
      "11llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllludsr8",
      "split1checkupstagehandshakeupstreamerranterredcaperredlc445v",
      "?1v759aa",
    ])
      expect(() => decodeBech32mWords(valid)).not.toThrow();
    for (const invalid of [
      "\u00201xj0phk",
      "\u007f1g6xzxy",
      "\u00801vctc34",
      "an84characterslonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11d6pts4",
      "qyrz8wqd2c9m",
      "1qyrz8wqd2c9m",
      "y1b0jsk6g",
      "lt1igcx5c0",
      "in1muywd",
      "mm1crxm3i",
      "au1s5cgom",
      "M1VUXWEZ",
      "16plkw9",
      "1p2gdwpf",
      "a1lqfn3p",
    ])
      expect(() => decodeBech32mWords(invalid)).toThrow();
  });

  it("rejects every noncanonical Neutron boundary with one public failure", () => {
    const valid = vectors[0].text;
    const mutations: unknown[] = [
      valid.toUpperCase(),
      ` ${valid}`,
      valid.slice(1),
      `${valid}q`,
      `x${valid.slice(1)}`,
      `${valid.slice(0, -1)}q`,
      valid.replace("1", "q"),
      valid.replace("q", "b"),
      1,
      null,
    ];
    for (const mutation of mutations)
      expect(() => decodeRecoveryKitV1(mutation)).toThrowError(
        expect.objectContaining({ code: "invalid-recovery-kit" }),
      );
  });

  it("rejects invalid byte inputs, zero account IDs, and shared memory", () => {
    expect(() => encodeRecoveryKitV1(new Uint8Array(16), new Uint8Array(32))).toThrowError(
      RecoveryKitFailure,
    );
    expect(() => encodeRecoveryKitV1(new Uint8Array(15), new Uint8Array(32))).toThrowError(
      RecoveryKitFailure,
    );
    if (typeof SharedArrayBuffer !== "undefined")
      expect(() =>
        encodeRecoveryKitV1(new Uint8Array(new SharedArrayBuffer(16)), new Uint8Array(32)),
      ).toThrowError(RecoveryKitFailure);
  });

  it("fails closed on checksummed unknown versions and zero account IDs", () => {
    const unknownVersion = new Uint8Array(49);
    unknownVersion[0] = 2;
    unknownVersion.fill(1, 1);
    expect(() => decodeRecoveryKitV1(encodeBech32m("ntrk", unknownVersion))).toThrowError(
      RecoveryKitFailure,
    );
    const zeroAccount = new Uint8Array(49);
    zeroAccount[0] = 1;
    zeroAccount.fill(2, 17);
    expect(() => decodeRecoveryKitV1(encodeBech32m("ntrk", zeroAccount))).toThrowError(
      RecoveryKitFailure,
    );
  });

  it("rejects checksum-valid nonzero padding and the Bech32 constant", () => {
    const decoded = decodeBech32mWords(vectors[0].text);
    const words = [...decoded.words];
    words[words.length - 1] = (words[words.length - 1] as number) | 1;
    const nonzeroPadding = encodeBech32mWords("ntrk", words);
    expect(nonzeroPadding).toHaveLength(90);
    expect(() => decodeRecoveryKitV1(nonzeroPadding)).toThrowError(RecoveryKitFailure);

    const wrongConstant = encodeBech32Words("ntrk", decoded.words);
    expect(wrongConstant).toHaveLength(90);
    expect(() => decodeRecoveryKitV1(wrongConstant)).toThrowError(RecoveryKitFailure);
  });

  it("contains hostile byte objects behind the public failure taxonomy", () => {
    const secret = new Uint8Array(32);
    const forged = Object.create(Uint8Array.prototype) as Uint8Array;
    const proxied = new Proxy(new Uint8Array(16), {});
    class HostileBytes extends Uint8Array {
      override get buffer(): ArrayBuffer {
        throw new Error("caller-controlled");
      }
    }
    for (const accountId of [forged, proxied, new HostileBytes(16)])
      expect(() => encodeRecoveryKitV1(accountId, secret)).toThrowError(
        expect.objectContaining({ code: "invalid-recovery-kit" }),
      );

    const owned = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    Object.defineProperty(owned, "buffer", {
      get: () => {
        throw new Error("caller-controlled");
      },
    });
    Object.defineProperty(owned, Symbol.iterator, {
      value: () => {
        throw new Error("caller-controlled");
      },
    });
    expect(() => encodeRecoveryKitV1(owned, secret)).not.toThrow();
  });
});
