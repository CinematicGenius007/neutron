export type CryptoFailureCode = "authentication" | "invalid-input" | "provider";

export class CryptoFailure extends Error {
  readonly code: CryptoFailureCode;

  constructor(code: CryptoFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CryptoFailure";
    this.code = code;
  }
}
