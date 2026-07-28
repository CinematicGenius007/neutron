export {
  IndexedDbEncryptedRecordRepository,
  openIndexedDbEncryptedRecordRepository,
} from "./indexeddb-repository.js";
export {
  beginOfflineEnrollment,
  LocalVaultFailure,
  type LocalVaultFailureCode,
  type LocalVaultMetadata,
  LocalVaultSession,
  PendingOfflineEnrollment,
  unlockOfflineVault,
  type VaultItemList,
  type VaultItemRecord,
} from "./local-vault.js";
