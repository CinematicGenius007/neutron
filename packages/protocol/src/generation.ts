import { EnvelopeFailure } from "./errors.js";

export type GenerationKind = "blob" | "index" | "item" | "root";

const maxUint64 = 0xffff_ffff_ffff_ffffn;
const maxBlobGeneration = 16_777_215n;

function parsed(value: string): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value))
    throw new EnvelopeFailure("bounds");
  const result = BigInt(value);
  if (result > maxUint64) throw new EnvelopeFailure("bounds");
  return result;
}

export function validateGeneration(kind: GenerationKind, value: string): string {
  if (kind !== "blob" && kind !== "index" && kind !== "item" && kind !== "root")
    throw new EnvelopeFailure("bounds");
  const generation = parsed(value);
  if (kind === "blob" ? generation > maxBlobGeneration : generation < 1n)
    throw new EnvelopeFailure("bounds");
  return generation.toString();
}

export function incrementGeneration(kind: GenerationKind, value: string): string {
  const current = BigInt(validateGeneration(kind, value));
  const next = current + 1n;
  if (next > maxUint64 || (kind === "blob" && next > maxBlobGeneration))
    throw new EnvelopeFailure("bounds");
  return next.toString();
}
