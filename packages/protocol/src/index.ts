export {
  type DecodedEnvelopeContent,
  ENVELOPE_KIND,
  type EnvelopeContent,
  type EnvelopeHeader,
  type EnvelopeKeySource,
  type EnvelopeKind,
  type EnvelopeSealInput,
  type KeyMaterialType,
  type OpenedEnvelope,
  openEnvelope,
  parseEnvelopeHeader as parseUnauthenticatedEnvelopeHeader,
  sealEnvelope,
} from "./envelope.js";
export { EnvelopeFailure, type EnvelopeFailureCode } from "./errors.js";
export {
  type GenerationKind,
  incrementGeneration,
  validateGeneration,
} from "./generation.js";
export {
  type ArkChildToRewrap,
  type MinimumArkRewrapInput,
  minimumArkRewrap,
} from "./migration.js";
export {
  encodePasswordScalars,
  encodePasswordString,
  encodePasswordUtf16Be,
} from "./password.js";
export {
  decodeRecoveryKitV1,
  encodeRecoveryKitV1,
  RecoveryKitFailure,
  type RecoveryKitV1,
} from "./recovery-kit.js";
