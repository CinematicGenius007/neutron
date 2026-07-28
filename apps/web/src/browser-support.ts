export interface BrowserSupport {
  readonly missing: readonly string[];
  readonly supported: boolean;
}

export function detectBrowserSupport(scope: typeof globalThis = globalThis): BrowserSupport {
  const missing: string[] = [];
  if (typeof scope.Worker !== "function") missing.push("module workers");
  if (typeof scope.WebAssembly !== "object") missing.push("WebAssembly");
  if (typeof scope.indexedDB !== "object") missing.push("IndexedDB");
  if (typeof scope.crypto !== "object" || scope.crypto?.subtle === undefined)
    missing.push("Web Crypto");
  if (typeof scope.TextEncoder !== "function" || typeof scope.TextDecoder !== "function")
    missing.push("text encoding");
  if (typeof scope.navigator !== "object" || scope.navigator.serviceWorker === undefined)
    missing.push("service workers");
  return Object.freeze({ missing: Object.freeze(missing), supported: missing.length === 0 });
}
