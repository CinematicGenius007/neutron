export type EnvelopeFailureCode =
  | "authentication"
  | "bounds"
  | "invalid-password-encoding"
  | "kdf-policy"
  | "padding"
  | "password-length"
  | "structure"
  | "unknown-critical-field"
  | "unsupported-suite"
  | "unsupported-version";

export class EnvelopeFailure extends Error {
  readonly code: EnvelopeFailureCode;

  constructor(code: EnvelopeFailureCode, message = code, options?: ErrorOptions) {
    super(message, options);
    this.name = "EnvelopeFailure";
    this.code = code;
  }
}
