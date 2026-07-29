import { createLibsodiumProvider } from "@neutron/crypto";
import { openIndexedDbEncryptedRecordRepository } from "./indexeddb-repository.js";
import { VaultWorkerRuntime } from "./vault-worker-runtime.js";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
};
const runtime = new VaultWorkerRuntime(
  {
    createProvider: createLibsodiumProvider,
    nowMilliseconds: Date.now,
    openRepository: openIndexedDbEncryptedRecordRepository,
    subtle: crypto.subtle,
  },
  { postMessage: (message) => scope.postMessage(message) },
);

scope.onmessage = (event: MessageEvent<unknown>) => {
  void runtime.receive(event.data);
};
