import { EnvelopeFailure } from "./errors.js";

function fail(code: "invalid-password-encoding" | "password-length"): never {
  throw new EnvelopeFailure(code);
}

function scalarBytes(scalar: number): Uint8Array {
  if (
    !Number.isInteger(scalar) ||
    scalar < 0 ||
    scalar > 0x10ffff ||
    (scalar >= 0xd800 && scalar <= 0xdfff)
  )
    fail("invalid-password-encoding");
  if (scalar <= 0x7f) return Uint8Array.of(scalar);
  if (scalar <= 0x7ff) return Uint8Array.of(0xc0 | (scalar >>> 6), 0x80 | (scalar & 0x3f));
  if (scalar <= 0xffff)
    return Uint8Array.of(
      0xe0 | (scalar >>> 12),
      0x80 | ((scalar >>> 6) & 0x3f),
      0x80 | (scalar & 0x3f),
    );
  return Uint8Array.of(
    0xf0 | (scalar >>> 18),
    0x80 | ((scalar >>> 12) & 0x3f),
    0x80 | ((scalar >>> 6) & 0x3f),
    0x80 | (scalar & 0x3f),
  );
}

function encodeScalars(scalars: Iterable<number>): Uint8Array {
  const values: Uint8Array[] = [];
  let length = 0;
  for (const scalar of scalars) {
    const value = scalarBytes(scalar);
    length += value.length;
    if (length > 1_024) fail("password-length");
    values.push(value);
  }
  if (length < 1) fail("password-length");
  const output = new Uint8Array(length);
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

export function encodePasswordScalars(scalars: readonly number[]): Uint8Array {
  if (!Array.isArray(scalars)) fail("invalid-password-encoding");
  return encodeScalars(scalars);
}

export function encodePasswordString(value: string): Uint8Array {
  if (typeof value !== "string") fail("invalid-password-encoding");
  function* scalars(): Generator<number> {
    for (let offset = 0; offset < value.length; offset += 1) {
      const leading = value.charCodeAt(offset);
      if (leading >= 0xd800 && leading <= 0xdbff) {
        if (offset + 1 >= value.length) fail("invalid-password-encoding");
        const trailing = value.charCodeAt(offset + 1);
        if (trailing < 0xdc00 || trailing > 0xdfff) fail("invalid-password-encoding");
        yield 0x10000 + ((leading - 0xd800) << 10) + (trailing - 0xdc00);
        offset += 1;
      } else {
        if (leading >= 0xdc00 && leading <= 0xdfff) fail("invalid-password-encoding");
        yield leading;
      }
    }
  }
  return encodeScalars(scalars());
}

export function encodePasswordUtf16Be(bytes: Uint8Array): Uint8Array {
  if (
    !(bytes instanceof Uint8Array) ||
    (typeof SharedArrayBuffer !== "undefined" && bytes.buffer instanceof SharedArrayBuffer) ||
    bytes.length % 2 !== 0
  )
    fail("invalid-password-encoding");
  function* scalars(): Generator<number> {
    for (let offset = 0; offset < bytes.length; offset += 2) {
      const leading = ((bytes[offset] as number) << 8) | (bytes[offset + 1] as number);
      if (leading >= 0xd800 && leading <= 0xdbff) {
        if (offset + 3 >= bytes.length) fail("invalid-password-encoding");
        const trailing = ((bytes[offset + 2] as number) << 8) | (bytes[offset + 3] as number);
        if (trailing < 0xdc00 || trailing > 0xdfff) fail("invalid-password-encoding");
        yield 0x10000 + ((leading - 0xd800) << 10) + (trailing - 0xdc00);
        offset += 2;
      } else {
        if (leading >= 0xdc00 && leading <= 0xdfff) fail("invalid-password-encoding");
        yield leading;
      }
    }
  }
  return encodeScalars(scalars());
}
