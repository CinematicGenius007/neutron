export {
  cloneEncryptedRecord,
  createEncryptedRecord,
  type EncryptedRecord,
  EncryptedRecordFailure,
  type EncryptedRecordFailureCode,
  type EncryptedRecordIdentity,
  type EncryptedRecordMutation,
  type EncryptedRecordRead,
  type EncryptedRecordRepository,
  parseEncryptedRecordIdentity,
  validateEncryptedRecordCandidate,
} from "./encrypted-records.js";
export {
  type BackupCodeItem,
  decodeVaultItem,
  encodeVaultItem,
  type JsonItem,
  type JsonObject,
  type JsonValue,
  type LoginItem,
  parseVaultItem,
  type SecureNoteItem,
  type TotpAlgorithm,
  type TotpItem,
  type VaultItem,
  VaultItemFailure,
  type VaultItemFailureCode,
} from "./items.js";
export {
  MemoryEncryptedRecordRepository,
  prepareEncryptedRecordMutations,
  prepareEncryptedRecords,
} from "./memory-repository.js";
