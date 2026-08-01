import type { VaultItem } from "@neutron/vault-domain/items";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VaultApp, type VaultBroker } from "../../src/app.js";
import type { PassphraseGeneratorOptionsV1 } from "../../src/passphrase-generator.js";
import { EFF_LONG_WORDLIST_ATTRIBUTION } from "../../src/passphrase-wordlist.js";
import type { PasswordGeneratorOptionsV1 } from "../../src/password-generator.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const kit = `ntrk1${"q".repeat(85)}`;
const vaultId = "1".repeat(32);
const itemId = "2".repeat(32);
const secret = "synthetic-rendered-secret";
const generatedSecret = "A0!a".repeat(5);
const generatedPassphrase = "abacus.abdomen.abdominal.abide.abiding.ability.ablaze.abnormal";
const browserTotp: Extract<VaultItem, { type: "totp" }> = {
  schemaVersion: 1,
  type: "totp",
  title: "Synthetic TOTP",
  tags: [],
  secretBase32: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  algorithm: "SHA1",
  digits: 8,
  period: 30,
};
const supported = Object.freeze({
  missing: Object.freeze([]),
  supported: true,
});

class FakeBroker implements VaultBroker {
  isClosed = false;
  lockCalls = 0;
  readonly createCalls: Array<{ item: VaultItem; vaultId: string }> = [];
  readonly computeTotpCalls: Array<{
    record: Parameters<NonNullable<VaultBroker["computeTotp"]>>[1];
    vaultId: string;
  }> = [];
  readonly deleteCalls: Array<{
    generation: string;
    itemId: string;
    keyVersion: number;
    vaultId: string;
  }> = [];
  readonly generateCalls: PasswordGeneratorOptionsV1[] = [];
  readonly generatePassphraseCalls: PassphraseGeneratorOptionsV1[] = [];
  readonly updateCalls: Array<{
    generation: string;
    item: VaultItem;
    itemId: string;
    keyVersion: number;
    vaultId: string;
  }> = [];

  async beginEnrollment(_password: string) {
    return kit;
  }

  async cancelEnrollment() {}

  async confirmEnrollment(_recoveryKit: string) {
    return {
      accountId: "3".repeat(32),
      arkEpoch: 1,
      vaults: [{ id: vaultId, keyVersion: 1 }],
    };
  }

  async createItem(requestVaultId: string, item: VaultItem) {
    this.createCalls.push({ item, vaultId: requestVaultId });
    return { id: itemId, generation: "1", keyVersion: 1 };
  }

  async computeTotp(
    requestVaultId: string,
    record: Parameters<NonNullable<VaultBroker["computeTotp"]>>[1],
  ) {
    if (record.item.type !== "totp")
      throw Object.assign(new Error("wrong item type"), {
        code: "invalid-item-reference",
      });
    this.computeTotpCalls.push({ record, vaultId: requestVaultId });
    const now = Math.floor(Date.now() / 1_000);
    const validFrom = Math.floor(now / record.item.period) * record.item.period;
    return {
      itemId: record.id,
      generation: record.generation,
      keyVersion: record.keyVersion,
      algorithm: record.item.algorithm,
      digits: record.item.digits,
      period: record.item.period,
      code: Math.floor(now / record.item.period)
        .toString()
        .padStart(record.item.digits, "0"),
      validFromUnixSeconds: validFrom.toString(),
      expiresAtUnixSeconds: (validFrom + record.item.period).toString(),
    };
  }

  async deleteItem(
    requestVaultId: string,
    requestItemId: string,
    generation: string,
    keyVersion: number,
  ) {
    this.deleteCalls.push({
      generation,
      itemId: requestItemId,
      keyVersion,
      vaultId: requestVaultId,
    });
  }

  async unlock(_password: string) {
    return this.confirmEnrollment(kit);
  }

  async updateItem(
    requestVaultId: string,
    requestItemId: string,
    generation: string,
    keyVersion: number,
    item: VaultItem,
  ) {
    this.updateCalls.push({
      generation,
      item,
      itemId: requestItemId,
      keyVersion,
      vaultId: requestVaultId,
    });
    return {
      id: requestItemId,
      generation: (BigInt(generation) + 1n).toString(),
      keyVersion,
    };
  }

  async listItemSummaries(_vaultId: string, _limit: number, _cursor?: string) {
    return {
      issues: [],
      items: [
        {
          id: itemId,
          generation: "1",
          keyVersion: 1,
          title: "Synthetic login",
          type: "login" as const,
        },
      ],
    };
  }

  async getItem(_vaultId: string, _itemId: string) {
    return {
      id: itemId,
      generation: "1",
      keyVersion: 1,
      item: {
        schemaVersion: 1 as const,
        type: "login" as const,
        title: "Synthetic login",
        tags: [],
        username: "fixture@example.invalid",
        password: secret,
      },
    };
  }

  async generatePassword(options: PasswordGeneratorOptionsV1) {
    this.generateCalls.push(structuredClone(options));
    return options.digits && !options.lowercase && !options.uppercase && !options.symbols
      ? "0".repeat(options.length)
      : generatedSecret;
  }

  async generatePassphrase(options: PassphraseGeneratorOptionsV1) {
    this.generatePassphraseCalls.push(structuredClone(options));
    return generatedPassphrase;
  }

  async lock() {
    this.lockCalls += 1;
    this.isClosed = true;
  }

  terminate() {
    this.isClosed = true;
  }
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

async function render(
  broker: VaultBroker,
  support = supported,
  createBroker: () => VaultBroker = () => broker,
): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<VaultApp createBroker={createBroker} support={support} />));
}

function byText(text: string): HTMLElement {
  const match = [
    ...(container?.querySelectorAll<HTMLElement>("button, h1, h2, p, output") ?? []),
  ].find((element) => element.textContent?.includes(text));
  if (match === undefined) throw new Error(`missing text: ${text}`);
  return match;
}

async function click(text: string): Promise<void> {
  await act(async () => byText(text).click());
}

async function enter(id: string, value: string): Promise<void> {
  const input = container?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (input === null || input === undefined) throw new Error(`missing input: ${id}`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function choose(id: string, value: string): Promise<void> {
  const select = container?.querySelector<HTMLSelectElement>(`#${id}`);
  if (select === null || select === undefined) throw new Error(`missing select: ${id}`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function toggle(id: string): Promise<void> {
  const checkbox = container?.querySelector<HTMLInputElement>(`#${id}`);
  if (checkbox === null || checkbox === undefined) throw new Error(`missing checkbox: ${id}`);
  await act(async () => checkbox.click());
}

async function submitForm(name: string): Promise<void> {
  const form = container?.querySelector<HTMLFormElement>(`form[aria-label="${name}"]`);
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit === null || submit === undefined) throw new Error(`missing form: ${name}`);
  await act(async () => submit.click());
}

function value(id: string): string | undefined {
  return container?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)?.value;
}

function runtimeSurface(): string {
  return JSON.stringify({
    formValues: [
      ...(container?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea") ??
        []),
    ].map((input) => input.value),
    html: container?.outerHTML,
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.useRealTimers();
});

describe("React vault shell", () => {
  it("keeps password entry unavailable until a real module-worker probe succeeds", async () => {
    let created = false;
    const broker = new FakeBroker();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root?.render(
        <VaultApp
          createBroker={() => {
            created = true;
            return broker;
          }}
          probeModuleWorker={async () => false}
        />,
      ),
    );
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).toContain("Neutron cannot open safely here");
    expect(created).toBe(false);
  });

  it("does not create a broker when required browser capabilities are missing", async () => {
    let created = false;
    const broker = new FakeBroker();
    await render(broker, { missing: ["IndexedDB"], supported: false }, () => {
      created = true;
      return broker;
    });
    expect(container?.textContent).toContain("Neutron cannot open safely here");
    expect(created).toBe(false);
  });

  it("enrolls, explicitly reads one item, and clears rendered secrets before lock completes", async () => {
    const broker = new FakeBroker();
    await render(broker);
    await click("Create a local vault");
    expect(document.activeElement?.textContent).toContain("Choose a master password");
    expect(getComputedStyle(document.activeElement as HTMLElement).outlineStyle).not.toBe("none");
    await enter("new-password", "synthetic master password");
    await enter("new-password-again", "synthetic master password");
    await click("Continue");
    expect(container?.textContent).toContain(kit);
    await enter("recovery-confirmation", kit);
    await click("Confirm and create vault");
    expect(document.activeElement?.textContent).toContain("Your vault");
    expect(container?.textContent).toContain("Synthetic login");
    expect(container?.textContent).not.toContain(secret);
    await click("Synthetic login");
    expect(container?.querySelector(".item-list li button")?.getAttribute("aria-current")).toBe(
      "true",
    );
    expect(container?.textContent).not.toContain(secret);
    await click("Show password");
    expect(container?.textContent).toContain(secret);
    await click("Hide password");
    expect(container?.textContent).not.toContain(secret);
    await click("Show password");
    await click("Lock now");
    expect(container?.textContent).not.toContain(secret);
    expect(container?.textContent).not.toContain(kit);
    expect(container?.textContent).toContain("Welcome back");
    expect(broker.lockCalls).toBe(1);
    expect(document.activeElement?.textContent).toContain("Welcome back");
  });

  it("keeps compact navigation single-context and makes an empty vault actionable", async () => {
    class EmptyBroker extends FakeBroker {
      override async listItemSummaries() {
        return { issues: [], items: [] };
      }
    }

    const emptyBroker = new EmptyBroker();
    await render(emptyBroker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    expect(container?.querySelector(".vault-grid")?.getAttribute("data-active-pane")).toBe("list");
    expect(container?.textContent).toContain("Your vault has no items yet.");
    expect(container?.textContent).toContain("Create your first encrypted item");
    expect(container?.querySelector('[aria-label="Item pages"]')).toBeNull();
    const firstCreate = byText("Create item");
    expect(firstCreate.classList.contains("secondary")).toBe(false);
    await click("Create your first item");
    expect(container?.querySelector(".vault-grid")?.getAttribute("data-active-pane")).toBe(
      "detail",
    );
    await click("Cancel editing");
    expect(container?.querySelector(".vault-grid")?.getAttribute("data-active-pane")).toBe("list");

    await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;

    const broker = new FakeBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    expect(container?.querySelector(".vault-grid")?.getAttribute("data-active-pane")).toBe(
      "detail",
    );
    await click("Show password");
    expect(container?.textContent).toContain(secret);
    await click("Back to items");
    expect(container?.querySelector(".vault-grid")?.getAttribute("data-active-pane")).toBe("list");
    expect(container?.textContent).not.toContain(secret);
    expect(document.activeElement).toBe(container?.querySelector("#items-title"));
  });

  it("abandons a failed recovery confirmation and starts enrollment from a clean broker", async () => {
    class ConfirmationFailureBroker extends FakeBroker {
      override async confirmEnrollment(): Promise<never> {
        throw Object.assign(new Error("must not render"), {
          code: "confirmation-failed",
        });
      }
    }
    const broker = new ConfirmationFailureBroker();
    await render(broker);
    await click("Create a local vault");
    await enter("new-password", "synthetic master password");
    await enter("new-password-again", "synthetic master password");
    await click("Continue");
    expect(container?.textContent).toContain(kit);
    await enter("recovery-confirmation", `${kit.slice(0, -1)}p`);
    await click("Confirm and create vault");
    expect(broker.isClosed).toBe(true);
    expect(container?.textContent).toContain("Choose a master password to start again");
    expect(container?.textContent).not.toContain(kit);
    expect(container?.querySelector("#recovery-confirmation")).toBeNull();
    expect(value("new-password")).toBe("");
    expect(value("new-password-again")).toBe("");
  });

  it("cannot render a point read that completes after lock", async () => {
    let resolveItem: ((item: Awaited<ReturnType<FakeBroker["getItem"]>>) => void) | undefined;
    class DelayedBroker extends FakeBroker {
      override async getItem() {
        return new Promise<Awaited<ReturnType<FakeBroker["getItem"]>>>((resolve) => {
          resolveItem = resolve;
        });
      }
    }
    const broker = new DelayedBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    act(() => byText("Synthetic login").click());
    await act(async () => Promise.resolve());
    expect(container?.querySelector<HTMLButtonElement>(".item-list li button")?.disabled).toBe(
      true,
    );
    await click("Lock now");
    await act(async () =>
      resolveItem?.({
        id: itemId,
        generation: "1",
        keyVersion: 1,
        item: {
          schemaVersion: 1,
          type: "login",
          title: "Synthetic login",
          tags: [],
          username: "fixture@example.invalid",
          password: secret,
        },
      }),
    );
    expect(container?.textContent).toContain("Welcome back");
    expect(container?.textContent).not.toContain(secret);
  });

  it("cannot render a TOTP calculation that completes after lock", async () => {
    let resolveTotp: ((code: Awaited<ReturnType<FakeBroker["computeTotp"]>>) => void) | undefined;
    class DelayedTotpBroker extends FakeBroker {
      override async listItemSummaries() {
        return {
          issues: [],
          items: [
            {
              id: itemId,
              generation: "1",
              keyVersion: 1,
              title: browserTotp.title,
              type: "totp" as const,
            },
          ],
        };
      }

      override async getItem() {
        return {
          id: itemId,
          generation: "1",
          keyVersion: 1,
          item: browserTotp,
        };
      }

      override async computeTotp() {
        return new Promise<Awaited<ReturnType<FakeBroker["computeTotp"]>>>((resolve) => {
          resolveTotp = resolve;
        });
      }
    }
    const broker = new DelayedTotpBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click(browserTotp.title);
    await act(async () => Promise.resolve());
    expect(container?.textContent).toContain("Calculating…");
    await click("Lock now");
    const now = Math.floor(Date.now() / 1_000);
    const validFrom = Math.floor(now / browserTotp.period) * browserTotp.period;
    await act(async () =>
      resolveTotp?.({
        itemId,
        generation: "1",
        keyVersion: 1,
        algorithm: "SHA1",
        digits: 8,
        period: 30,
        code: "12345678",
        validFromUnixSeconds: validFrom.toString(),
        expiresAtUnixSeconds: (validFrom + 30).toString(),
      }),
    );
    expect(container?.textContent).toContain("Welcome back");
    expect(container?.textContent).not.toContain("12345678");
    expect(container?.textContent).not.toContain(browserTotp.secretBase32);
  });

  it("creates every v1 item type from locally validated drafts", async () => {
    const broker = new FakeBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");

    await click("Create item");
    await enter("item-title", "Created login");
    await enter("item-tags", "personal\nimportant");
    await enter("item-username", "created@example.invalid");
    await enter("item-password", "created-login-secret");
    await toggle("item-has-url");
    await submitForm("Create item");
    expect(broker.createCalls.at(-1)).toEqual({
      vaultId,
      item: {
        schemaVersion: 1,
        type: "login",
        title: "Created login",
        tags: ["personal", "important"],
        username: "created@example.invalid",
        password: "created-login-secret",
        url: "",
      },
    });

    await click("Create item");
    await choose("item-type", "secure-note");
    await enter("item-title", "Created note");
    await enter("item-body", "created-note-secret");
    await submitForm("Create item");
    expect(broker.createCalls.at(-1)?.item).toEqual({
      schemaVersion: 1,
      type: "secure-note",
      title: "Created note",
      tags: [],
      body: "created-note-secret",
    });

    await click("Create item");
    await choose("item-type", "totp");
    await enter("item-title", "Created TOTP");
    await enter("item-totp-secret", "JBSWY3DPEHPK3PXP");
    await choose("item-totp-algorithm", "SHA256");
    await choose("item-totp-digits", "8");
    await enter("item-totp-period", "45");
    await toggle("item-has-issuer");
    await enter("item-totp-issuer", "Synthetic issuer");
    await toggle("item-has-account");
    await submitForm("Create item");
    expect(broker.createCalls.at(-1)?.item).toEqual({
      schemaVersion: 1,
      type: "totp",
      title: "Created TOTP",
      tags: [],
      secretBase32: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA256",
      digits: 8,
      period: 45,
      issuer: "Synthetic issuer",
      accountName: "",
    });

    await click("Create item");
    await choose("item-type", "backup-code");
    await enter("item-title", "Created backup codes");
    await enter("item-codes", "first-code\nsecond-code");
    await toggle("item-has-notes");
    await submitForm("Create item");
    expect(broker.createCalls.at(-1)?.item).toEqual({
      schemaVersion: 1,
      type: "backup-code",
      title: "Created backup codes",
      tags: [],
      codes: ["first-code", "second-code"],
      notes: "",
    });

    await click("Create item");
    await choose("item-type", "json");
    await enter("item-title", "Created JSON");
    await enter("item-json", '{"nested":{"value":"created-json-secret"}}');
    await submitForm("Create item");
    expect(broker.createCalls.at(-1)?.item).toEqual({
      schemaVersion: 1,
      type: "json",
      title: "Created JSON",
      tags: [],
      value: { nested: { value: "created-json-secret" } },
    });
    expect(broker.createCalls).toHaveLength(5);
  });

  it("generates only into the current login draft without saving automatically", async () => {
    const broker = new FakeBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Create item");
    expect(value("password-generator-length")).toBe("20");
    for (const key of ["lowercase", "uppercase", "digits", "symbols"])
      expect(
        container?.querySelector<HTMLInputElement>(`#password-generator-${key}`)?.checked,
      ).toBe(true);
    await click("Generate password");
    expect(broker.generateCalls).toEqual([
      {
        length: 20,
        lowercase: true,
        uppercase: true,
        digits: true,
        symbols: true,
      },
    ]);
    expect(value("item-password")).toBe(generatedSecret);
    expect(container?.textContent).toContain("generated and placed in the masked password field");
    expect(container?.querySelector<HTMLInputElement>("#item-password")?.type).toBe("password");
    await click("Show password");
    expect(container?.querySelector<HTMLInputElement>("#item-password")?.type).toBe("text");
    await click("Hide password");
    expect(broker.createCalls).toHaveLength(0);

    await toggle("password-generator-lowercase");
    await toggle("password-generator-uppercase");
    await toggle("password-generator-symbols");
    await enter("password-generator-length", "25");
    await click("Generate password");
    expect(broker.generateCalls.at(-1)).toEqual({
      length: 25,
      lowercase: false,
      uppercase: false,
      digits: true,
      symbols: false,
    });

    await toggle("generator-mode-passphrase");
    expect(value("passphrase-generator-words")).toBe("8");
    expect(container?.textContent).toContain("103.4 bits");
    expect(container?.textContent).toContain("not stronger than an equivalent random password");
    expect(container?.textContent).toContain(EFF_LONG_WORDLIST_ATTRIBUTION);
    await click("Generate passphrase");
    expect(broker.generatePassphraseCalls).toEqual([{ words: 8 }]);
    expect(value("item-password")).toBe(generatedPassphrase);
    expect(broker.createCalls).toHaveLength(0);
  });

  it("suppresses a pending result when the generator mode changes", async () => {
    let resolvePassphrase: ((value: string) => void) | undefined;
    class DelayedPassphraseBroker extends FakeBroker {
      override async generatePassphrase(options: PassphraseGeneratorOptionsV1) {
        this.generatePassphraseCalls.push(structuredClone(options));
        return new Promise<string>((resolve) => {
          resolvePassphrase = resolve;
        });
      }
    }
    const broker = new DelayedPassphraseBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Create item");
    await toggle("generator-mode-passphrase");
    act(() => byText("Generate passphrase").click());
    await act(async () => Promise.resolve());
    await toggle("generator-mode-password");
    await act(async () => resolvePassphrase?.(generatedPassphrase));
    expect(value("item-password")).toBe("");
  });

  it("displays, expires, and revalidates an exact-revision TOTP code", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(59_000));
    const broker = new FakeBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Create item");
    await choose("item-type", "totp");
    await enter("item-title", "Rendered TOTP");
    await enter("item-totp-secret", "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    await choose("item-totp-digits", "8");
    await submitForm("Create item");
    await act(async () => Promise.resolve());
    expect(container?.querySelector(".totp-value")?.textContent).toBe("00000001");
    expect(container?.querySelector(".totp-value")?.matches('[role="status"], [aria-live]')).toBe(
      false,
    );
    expect(
      [...(container?.querySelectorAll<HTMLElement>('[role="status"], [aria-live]') ?? [])].every(
        (region) => !region.textContent?.includes("00000001"),
      ),
    ).toBe(true);
    expect(broker.computeTotpCalls).toHaveLength(1);
    expect(broker.computeTotpCalls[0]).toMatchObject({
      vaultId,
      record: {
        id: itemId,
        generation: "1",
        keyVersion: 1,
        item: { type: "totp" },
      },
    });

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(container?.querySelector(".totp-value")?.textContent).toBe("00000002");
    expect(broker.computeTotpCalls).toHaveLength(2);

    vi.setSystemTime(new Date(120_000));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(container?.querySelector(".totp-value")?.textContent).toBe("00000004");
    expect(broker.computeTotpCalls).toHaveLength(3);

    vi.setSystemTime(new Date(30_000));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(container?.querySelector(".totp-value")?.textContent).toBe("00000001");
    expect(broker.computeTotpCalls).toHaveLength(4);

    await act(async () => globalThis.dispatchEvent(new Event("focus")));
    await act(async () => Promise.resolve());
    expect(broker.computeTotpCalls).toHaveLength(5);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => Promise.resolve());
    expect(broker.computeTotpCalls).toHaveLength(6);

    await click("Edit item");
    expect(container?.querySelector(".totp-value")).toBeNull();
    await click("Lock now");
    expect(container?.textContent).toContain("Welcome back");
    expect(container?.textContent).not.toContain("00000001");
  });

  it("suppresses older generation after manual edits, newer requests, target changes, and lock", async () => {
    const pending: Array<(password: string) => void> = [];
    class DelayedGeneratorBroker extends FakeBroker {
      override async generatePassword(options: PasswordGeneratorOptionsV1) {
        this.generateCalls.push(structuredClone(options));
        return new Promise<string>((resolve) => pending.push(resolve));
      }
    }
    const broker = new DelayedGeneratorBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Create item");

    act(() => byText("Generate password").click());
    await act(async () => Promise.resolve());
    await enter("item-password", "manual-password");
    await act(async () => pending[0]?.(generatedSecret));
    expect(value("item-password")).toBe("manual-password");

    act(() => byText("Generate password").click());
    await act(async () => Promise.resolve());
    act(() => byText("Generate another password").click());
    await act(async () => Promise.resolve());
    const newer = "B1?b".repeat(5);
    await act(async () => pending[2]?.(newer));
    expect(value("item-password")).toBe(newer);
    await act(async () => pending[1]?.(generatedSecret));
    expect(value("item-password")).toBe(newer);

    act(() => byText("Generate password").click());
    await act(async () => Promise.resolve());
    await choose("item-type", "secure-note");
    await click("Clear fields and change type");
    await act(async () => pending[3]?.(generatedSecret));
    expect(container?.querySelector("#item-password")).toBeNull();
    await choose("item-type", "login");

    act(() => byText("Generate password").click());
    await act(async () => Promise.resolve());
    await click("Cancel editing");
    await click("Discard draft");
    await act(async () => pending[4]?.(generatedSecret));
    expect(container?.textContent).not.toContain(generatedSecret);

    await click("Create item");
    act(() => byText("Generate password").click());
    await act(async () => Promise.resolve());
    await click("Lock now");
    await act(async () => pending[5]?.(generatedSecret));
    expect(container?.textContent).toContain("Welcome back");
    expect(container?.textContent).not.toContain(generatedSecret);
  });

  it("rejects malformed and over-byte drafts before broker dispatch without echoing them", async () => {
    const broker = new FakeBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Create item");
    await choose("item-type", "json");
    await enter("item-title", "Rejected JSON");
    const rejectedSecret = "rejected-json-secret";
    await enter("item-json", `{"value":"${rejectedSecret}"`);
    await submitForm("Create item");
    const firstError = container?.querySelector(".editor-error");
    expect(container?.querySelector(".editor-error")?.textContent).toBe(
      "Enter valid JSON within the supported size and nesting limits.",
    );
    expect(container?.querySelector(".editor-error")?.textContent).not.toContain(rejectedSecret);
    await submitForm("Create item");
    expect(container?.querySelector(".editor-error")).not.toBe(firstError);
    expect(document.activeElement).toBe(container?.querySelector(".editor-error"));
    expect(broker.createCalls).toHaveLength(0);

    await enter("item-json", "{}");
    await enter("item-title", "🔐".repeat(65));
    await submitForm("Create item");
    expect(container?.querySelector(".editor-error")?.textContent).toBe(
      "Enter a title between 1 and 256 UTF-8 bytes.",
    );
    expect(broker.createCalls).toHaveLength(0);
    await enter("item-title", "Rejected tags");
    await enter("item-tags", "duplicate\nduplicate");
    await submitForm("Create item");
    expect(container?.querySelector(".editor-error")?.textContent).toContain(
      "64 unique, non-empty tags",
    );
    expect(broker.createCalls).toHaveLength(0);

    await choose("item-type", "totp");
    await enter("item-title", "Rejected TOTP");
    await enter("item-tags", "");
    await enter("item-totp-secret", "jbswy3dpehpk3pxp");
    await submitForm("Create item");
    expect(container?.querySelector(".editor-error")?.textContent).toBe(
      "Enter a canonical uppercase Base32 secret of 16–512 characters.",
    );
    expect(broker.createCalls).toHaveLength(0);

    await choose("item-type", "backup-code");
    await click("Clear fields and change type");
    await enter("item-title", "Rejected backup codes");
    await enter("item-codes", "duplicate\nduplicate");
    await submitForm("Create item");
    expect(container?.querySelector(".editor-error")?.textContent).toContain(
      "unique, non-empty backup codes",
    );
    expect(broker.createCalls).toHaveLength(0);
  });

  it("uses the exact edit tuple and retains a redacted conflicting draft", async () => {
    class ConflictBroker extends FakeBroker {
      override async updateItem(
        requestVaultId: string,
        requestItemId: string,
        generation: string,
        keyVersion: number,
        item: VaultItem,
      ): Promise<never> {
        await super.updateItem(requestVaultId, requestItemId, generation, keyVersion, item);
        throw Object.assign(new Error("broker-secret-leak"), {
          code: "conflict",
        });
      }
    }
    const broker = new ConflictBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    await click("Edit item");
    expect(container?.querySelector<HTMLSelectElement>("#item-type")?.disabled).toBe(true);
    await click("Show password");
    expect(container?.querySelector<HTMLInputElement>("#item-password")?.type).toBe("text");
    const draft = "unsaved-conflicting-title";
    await enter("item-title", draft);
    await submitForm("Edit item");
    expect(broker.updateCalls).toHaveLength(1);
    expect(broker.updateCalls[0]).toMatchObject({
      vaultId,
      itemId,
      generation: "1",
      keyVersion: 1,
      item: { title: draft, type: "login" },
    });
    expect(value("item-title")).toBe(draft);
    expect(container?.querySelector<HTMLInputElement>("#item-password")?.type).toBe("password");
    expect(container?.textContent).toContain("Your draft was not saved.");
    expect(container?.textContent).not.toContain("broker-secret-leak");
  });

  it("guards every dirty draft exit and restores focus after explicit discard", async () => {
    const broker = new FakeBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    await click("Edit item");
    const discardedSecret = "discarded-edit-password";
    await enter("item-title", "discarded edit title");
    await enter("item-password", discardedSecret);
    await toggle("item-has-url");
    await enter("item-url", "https://discarded.invalid");

    const createAction = container?.querySelector<HTMLButtonElement>(
      ".item-list .section-heading button",
    );
    if (createAction === undefined || createAction === null)
      throw new Error("missing create action");
    await act(async () => createAction.click());
    expect(value("item-title")).toBe("discarded edit title");
    expect(container?.textContent).toContain("Discard unsaved changes?");
    await click("Keep editing");
    expect(value("item-password")).toBe(discardedSecret);
    await act(async () => createAction.click());
    await click("Discard and continue");
    expect(value("item-title")).toBe("");
    expect(value("item-password")).toBe("");
    expect(container?.querySelector<HTMLInputElement>("#item-has-url")?.checked).toBe(false);
    expect(container?.querySelector<HTMLSelectElement>("#item-type")?.value).toBe("login");

    await choose("item-type", "secure-note");
    await enter("item-title", "discarded create title");
    await enter("item-body", "discarded-create-body");
    await act(async () => createAction.click());
    expect(value("item-body")).toBe("discarded-create-body");
    await click("Discard and continue");
    expect(value("item-title")).toBe("");
    expect(value("item-password")).toBe("");
    expect(container?.querySelector("#item-body")).toBeNull();
    expect(container?.querySelector<HTMLSelectElement>("#item-type")?.value).toBe("login");
    expect(container?.textContent).not.toContain(discardedSecret);

    await enter("item-title", "draft guarded from item selection");
    await click("Synthetic login");
    expect(value("item-title")).toBe("draft guarded from item selection");
    await click("Keep editing");
    await click("Synthetic login");
    await click("Discard and continue");
    expect(container?.textContent).toContain("Revision 1 · key version 1");

    await act(async () => createAction.click());

    await submitForm("Create item");
    expect(broker.createCalls).toHaveLength(0);
    await click("Cancel editing");
    expect(document.activeElement).toBe(createAction);
  });

  it("freezes a pending dirty-navigation decision while pagination is busy", async () => {
    let releaseSecondPage: (() => void) | undefined;
    class DelayedNavigationBroker extends FakeBroker {
      override async listItemSummaries(_vaultId: string, _limit: number, cursor?: string) {
        if (cursor === "second")
          await new Promise<void>((resolve) => {
            releaseSecondPage = resolve;
          });
        const firstPage = await super.listItemSummaries(_vaultId, _limit);
        return {
          issues: [],
          items: cursor === undefined ? firstPage.items : [],
          ...(cursor === undefined ? { nextCursor: "second" } : {}),
        };
      }
    }
    const broker = new DelayedNavigationBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    await click("Edit item");
    await enter("item-title", "busy navigation draft");
    await click("Synthetic login");
    await click("Next page");
    await act(async () => Promise.resolve());

    const discard = byText("Discard and continue");
    const keepEditing = byText("Keep editing");
    expect(discard.matches(":disabled")).toBe(true);
    expect(keepEditing.matches(":disabled")).toBe(true);
    await act(async () => discard.click());
    expect(value("item-title")).toBe("busy navigation draft");
    expect(container?.textContent).toContain("Page 2 · loading");

    await act(async () => releaseSecondPage?.());
    expect(discard.matches(":disabled")).toBe(false);
    expect(value("item-title")).toBe("busy navigation draft");
    expect(container?.textContent).not.toContain("Opening item…");
  });

  it("clears stale dirty-navigation intent after successful save and delete", async () => {
    const broker = new FakeBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    await click("Edit item");
    await enter("item-title", "saved over stale navigation");
    await click("Synthetic login");
    expect(container?.textContent).toContain("Discard unsaved changes?");
    await submitForm("Edit item");
    expect(container?.textContent).not.toContain("Discard unsaved changes?");
    expect(container?.textContent).toContain("saved over stale navigation");

    await click("Edit item");
    await enter("item-title", "delete over stale navigation");
    await click("Synthetic login");
    await click("Delete item");
    await click("Confirm delete");
    expect(container?.textContent).not.toContain("Discard unsaved changes?");
    expect(container?.textContent).toContain("Choose an item to decrypt it");
  });

  it("disables every cancel and delete confirmation action while saving", async () => {
    let releaseUpdate: (() => void) | undefined;
    class DelayedUpdateBroker extends FakeBroker {
      override async updateItem(...args: Parameters<FakeBroker["updateItem"]>) {
        const result = await super.updateItem(...args);
        await new Promise<void>((resolve) => {
          releaseUpdate = resolve;
        });
        return result;
      }
    }
    const broker = new DelayedUpdateBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    await click("Edit item");
    await enter("item-title", "busy cancel confirmation");
    await click("Cancel editing");
    await submitForm("Edit item");
    await act(async () => Promise.resolve());
    expect(byText("Discard draft").matches(":disabled")).toBe(true);
    expect(byText("Keep editing").matches(":disabled")).toBe(true);
    await act(async () => releaseUpdate?.());

    await click("Edit item");
    await enter("item-title", "busy delete confirmation");
    await click("Delete item");
    await submitForm("Edit item");
    await act(async () => Promise.resolve());
    expect(byText("Confirm delete").matches(":disabled")).toBe(true);
    expect(byText("Cancel deletion").matches(":disabled")).toBe(true);
    await act(async () => releaseUpdate?.());
  });

  it("requires delete confirmation and sends the exact selected tuple", async () => {
    const broker = new FakeBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    await click("Show password");
    expect(container?.textContent).toContain(secret);
    await click("Edit item");
    expect(container?.textContent).not.toContain(secret);
    expect(value("item-password")).toBe(secret);
    await click("Cancel editing");
    expect(container?.textContent).not.toContain(secret);
    await click("Edit item");
    await click("Delete item");
    expect(document.activeElement?.textContent).toBe("Delete “Synthetic login”?");
    await click("Cancel deletion");
    expect(document.activeElement?.textContent).toBe("Delete item");
    expect(broker.deleteCalls).toHaveLength(0);
    await click("Delete item");
    await click("Confirm delete");
    expect(broker.deleteCalls).toEqual([{ vaultId, itemId, generation: "1", keyVersion: 1 }]);
    expect(container?.textContent).toContain("Choose an item to decrypt it");
    expect(container?.textContent).not.toContain(secret);
  });

  it("returns a saved revision with every detail secret hidden again", async () => {
    const broker = new FakeBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    await click("Show password");
    expect(container?.textContent).toContain(secret);
    await click("Edit item");
    await enter("item-title", "Updated synthetic login");
    await submitForm("Edit item");
    expect(container?.textContent).toContain("Revision 2 · key version 1");
    expect(container?.textContent).not.toContain(secret);
    expect(container?.textContent).toContain("Show password");
  });

  it("dispatches one delayed mutation and suppresses its completion after lock", async () => {
    let resolveCreate:
      | ((revision: { generation: string; id: string; keyVersion: number }) => void)
      | undefined;
    class DelayedCreateBroker extends FakeBroker {
      override async createItem(requestVaultId: string, item: VaultItem) {
        this.createCalls.push({ item, vaultId: requestVaultId });
        return new Promise<{
          generation: string;
          id: string;
          keyVersion: number;
        }>((resolve) => {
          resolveCreate = resolve;
        });
      }
    }
    const broker = new DelayedCreateBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Create item");
    await enter("item-title", "Delayed item");
    const delayedSecret = "delayed-create-secret";
    await enter("item-password", delayedSecret);
    const submit = container?.querySelector<HTMLButtonElement>(
      'form[aria-label="Create item"] button[type="submit"]',
    );
    if (submit === undefined || submit === null) throw new Error("missing create submit");
    act(() => {
      submit.click();
      submit.click();
    });
    expect(broker.createCalls).toHaveLength(1);
    expect(container?.querySelector<HTMLFieldSetElement>(".editor-fields")?.disabled).toBe(true);
    expect(
      [
        ...(container?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          ".editor-fields input, .editor-fields select, .editor-fields textarea",
        ) ?? []),
      ].every((control) => control.matches(":disabled")),
    ).toBe(true);
    await click("Lock now");
    await act(async () => resolveCreate?.({ id: itemId, generation: "1", keyVersion: 1 }));
    expect(container?.textContent).toContain("Welcome back");
    expect(container?.textContent).not.toContain(delayedSecret);
    expect(
      [
        ...(container?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          "input, textarea",
        ) ?? []),
      ].some((input) => input.value.includes(delayedSecret)),
    ).toBe(false);
  });

  it("suppresses a delayed update completion after lock", async () => {
    let resolveUpdate:
      | ((revision: { generation: string; id: string; keyVersion: number }) => void)
      | undefined;
    class DelayedUpdateBroker extends FakeBroker {
      override async updateItem(
        requestVaultId: string,
        requestItemId: string,
        generation: string,
        keyVersion: number,
        item: VaultItem,
      ) {
        this.updateCalls.push({
          generation,
          item,
          itemId: requestItemId,
          keyVersion,
          vaultId: requestVaultId,
        });
        return new Promise<{
          generation: string;
          id: string;
          keyVersion: number;
        }>((resolve) => {
          resolveUpdate = resolve;
        });
      }
    }
    const broker = new DelayedUpdateBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    await click("Edit item");
    const delayedTitle = "delayed-update-title";
    await enter("item-title", delayedTitle);
    await submitForm("Edit item");
    await click("Lock now");
    await act(async () => resolveUpdate?.({ id: itemId, generation: "2", keyVersion: 1 }));
    expect(container?.textContent).toContain("Welcome back");
    expect(container?.textContent).not.toContain(delayedTitle);
  });

  it("suppresses a delayed delete completion after lock", async () => {
    let resolveDelete: (() => void) | undefined;
    class DelayedDeleteBroker extends FakeBroker {
      override async deleteItem(
        requestVaultId: string,
        requestItemId: string,
        generation: string,
        keyVersion: number,
      ) {
        this.deleteCalls.push({
          generation,
          itemId: requestItemId,
          keyVersion,
          vaultId: requestVaultId,
        });
        return new Promise<void>((resolve) => {
          resolveDelete = resolve;
        });
      }
    }
    const broker = new DelayedDeleteBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    await click("Edit item");
    await click("Delete item");
    await click("Confirm delete");
    await click("Lock now");
    await act(async () => resolveDelete?.());
    expect(container?.textContent).toContain("Welcome back");
    expect(container?.textContent).not.toContain(secret);
  });

  it("does not present a committed mutation as retryable when page refresh fails", async () => {
    class RefreshFailureBroker extends FakeBroker {
      listCalls = 0;
      override async listItemSummaries(requestVaultId: string, limit: number, cursor?: string) {
        this.listCalls += 1;
        if (this.listCalls > 1) throw new Error("refresh-secret-leak");
        return super.listItemSummaries(requestVaultId, limit, cursor);
      }
    }
    const broker = new RefreshFailureBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Create item");
    await enter("item-title", "Committed item");
    await submitForm("Create item");
    expect(broker.createCalls).toHaveLength(1);
    expect(container?.querySelector('form[aria-label="Create item"]')).toBeNull();
    expect(container?.textContent).toContain("Committed item");
    expect(container?.textContent).toContain("item list could not refresh");
    expect(container?.textContent).not.toContain("refresh-secret-leak");
  });

  it("navigates page history in memory and distinguishes loading, failure, retry, and empty", async () => {
    const secondId = "4".repeat(32);
    class PagedBroker extends FakeBroker {
      failInitial = true;
      readonly cursors: Array<string | undefined> = [];
      override async listItemSummaries(_vaultId: string, _limit: number, cursor?: string) {
        this.cursors.push(cursor);
        if (this.failInitial) {
          this.failInitial = false;
          throw new Error("redacted list failure");
        }
        return cursor === "second"
          ? {
              issues: [],
              items: [
                {
                  id: secondId,
                  generation: "1",
                  keyVersion: 1,
                  title: "Second page item",
                  type: "secure-note" as const,
                },
              ],
            }
          : { issues: [], items: [], nextCursor: "second" };
      }
    }
    const broker = new PagedBroker();
    const harnessSearch = location.search;
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    expect(container?.textContent).toContain("The item list could not be loaded.");
    expect(container?.textContent).not.toContain("No items on this page.");
    await click("Retry current page");
    expect(container?.textContent).toContain("No items on this page.");
    await click("Create item");
    await enter("item-title", "draft preserved across pages");
    await click("Next page");
    expect(container?.textContent).toContain("Page 2 · 1 shown");
    expect(container?.textContent).toContain("Second page item");
    expect(value("item-title")).toBe("draft preserved across pages");
    await click("Previous page");
    expect(container?.textContent).toContain("Page 1 · 0 shown");
    expect(value("item-title")).toBe("draft preserved across pages");
    expect(broker.cursors).toEqual([undefined, undefined, "second", undefined]);
    expect(location.search).toBe(harnessSearch);
    expect(sessionStorage).toHaveLength(0);
    expect(localStorage).toHaveLength(0);
    await click("Cancel editing");
    await click("Discard draft");
  });

  it("does not retain a discarded dirty editor across a failed item read", async () => {
    let rejectItem: ((cause: Error) => void) | undefined;
    class FailedReadBroker extends FakeBroker {
      override async getItem() {
        return new Promise<Awaited<ReturnType<FakeBroker["getItem"]>>>((_, reject) => {
          rejectItem = reject;
        });
      }
    }
    const broker = new FailedReadBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Create item");
    await enter("item-title", "discard before failed read");
    await click("Synthetic login");
    await click("Discard and continue");
    expect(container?.querySelector('form[aria-label="Create item"]')).toBeNull();
    await act(async () => rejectItem?.(new Error("redacted read failure")));
    expect(container?.textContent).toContain("The operation could not be completed.");
    expect(container?.querySelector('form[aria-label="Create item"]')).toBeNull();

    await click("Create item");
    await enter("item-title", "new guarded draft");
    await click("Synthetic login");
    expect(container?.textContent).toContain("Discard unsaved changes?");
    expect(value("item-title")).toBe("new guarded draft");
  });

  it("replaces a delayed or failed forward page with loading and retry states", async () => {
    let rejectSecond: ((cause: Error) => void) | undefined;
    let failSecond = true;
    class DelayedPageBroker extends FakeBroker {
      override async listItemSummaries(_vaultId: string, _limit: number, cursor?: string) {
        if (cursor === undefined) return { issues: [], items: [], nextCursor: "second" };
        if (failSecond) {
          return new Promise<Awaited<ReturnType<FakeBroker["listItemSummaries"]>>>((_, reject) => {
            rejectSecond = reject;
          });
        }
        return {
          issues: [{ code: "corrupt-item" as const, id: "e".repeat(32) }],
          items: [
            {
              id: "4".repeat(32),
              generation: "1",
              keyVersion: 1,
              title: "Recovered second page",
              type: "login" as const,
            },
          ],
        };
      }
    }
    const broker = new DelayedPageBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    act(() => byText("Next page").click());
    await act(async () => Promise.resolve());
    expect(container?.textContent).toContain("Page 2 · loading");
    expect(container?.textContent).toContain("Loading items…");
    expect(container?.textContent).not.toContain("No items on this page.");
    failSecond = false;
    await act(async () => rejectSecond?.(new Error("redacted delayed failure")));
    expect(container?.textContent).toContain("Page 2 · unavailable");
    expect(container?.textContent).toContain("The item list could not be loaded.");
    expect(container?.textContent).not.toContain("No items on this page.");
    await click("Retry current page");
    expect(container?.textContent).toContain("Page 2 · 1 shown");
    expect(container?.textContent).toContain("Recovered second page");

    failSecond = true;
    act(() => byText("Retry current page").click());
    await act(async () => Promise.resolve());
    expect(container?.textContent).toContain("Page 2 · loading");
    expect(container?.textContent).not.toContain("Recovered second page");
    failSecond = false;
    await act(async () => rejectSecond?.(new Error("redacted retry failure")));
    expect(container?.textContent).toContain("Page 2 · unavailable");
    expect(container?.textContent).not.toContain("Recovered second page");
    await click("Retry current page");
    expect(container?.textContent).toContain("Recovered second page");
  });

  it("keeps every secret item field out of the DOM until its own reveal action", async () => {
    const records = [
      {
        id: "4".repeat(32),
        item: {
          schemaVersion: 1,
          type: "login",
          title: "Secret login",
          tags: ["visible-tag"],
          username: "visible-user",
          password: "login-password-sentinel",
          notes: "login-notes-sentinel",
        },
      },
      {
        id: "5".repeat(32),
        item: {
          schemaVersion: 1,
          type: "secure-note",
          title: "Secret note",
          tags: [],
          body: "note-body-sentinel",
        },
      },
      {
        id: "6".repeat(32),
        item: browserTotp,
      },
      {
        id: "7".repeat(32),
        item: {
          schemaVersion: 1,
          type: "backup-code",
          title: "Secret backup codes",
          tags: [],
          codes: ["backup-one-sentinel", "backup-two-sentinel"],
          notes: "backup-notes-sentinel",
        },
      },
      {
        id: "8".repeat(32),
        item: {
          schemaVersion: 1,
          type: "json",
          title: "Secret JSON",
          tags: [],
          value: { secret: "json-value-sentinel" },
        },
      },
    ] satisfies Array<{ id: string; item: VaultItem }>;
    class SecretBroker extends FakeBroker {
      override async listItemSummaries() {
        return {
          issues: [],
          items: records.map((record) => ({
            id: record.id,
            generation: "1",
            keyVersion: 1,
            title: record.item.title,
            type: record.item.type,
          })),
        };
      }
      override async getItem(_vaultId: string, requestedId: string) {
        const record = records.find(({ id }) => id === requestedId);
        if (record === undefined) throw new Error("missing test record");
        return { ...record, generation: "1", keyVersion: 1 };
      }
    }
    const broker = new SecretBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");

    const cases = [
      ["Secret login", "Show password", "login-password-sentinel"],
      ["Secret login", "Show notes", "login-notes-sentinel"],
      ["Secret note", "Show secure note", "note-body-sentinel"],
      [browserTotp.title, "Show totp secret", browserTotp.secretBase32],
      ["Secret backup codes", "Show backup codes", "backup-one-sentinel"],
      ["Secret backup codes", "Show notes", "backup-notes-sentinel"],
      ["Secret JSON", "Show json value", "json-value-sentinel"],
    ] as const;
    for (const [title, action, sentinel] of cases) {
      await click(title);
      expect(runtimeSurface()).not.toContain(sentinel);
      await click(action);
      expect(container?.textContent).toContain(sentinel);
      const status = container?.querySelector('[role="status"]:last-of-type')?.textContent;
      expect(status).not.toContain(sentinel);
    }
    expect(container?.textContent).not.toContain("backup-one-sentinel");
    await click("Edit item");
    const surfaceWithoutEditorForm = container?.cloneNode(true) as HTMLDivElement | undefined;
    surfaceWithoutEditorForm?.querySelectorAll("form").forEach((form) => {
      form.remove();
    });
    expect(surfaceWithoutEditorForm?.textContent).not.toContain("json-value-sentinel");
    expect(value("item-json")).toContain("json-value-sentinel");
    await click("Lock now");
    for (const [, , sentinel] of cases) expect(container?.textContent).not.toContain(sentinel);
  });

  it("offers a working TOTP retry and identifies corrupt records without claiming repair", async () => {
    const corruptId = "f".repeat(32);
    class RecoveryBroker extends FakeBroker {
      allowTotp = false;
      attempts = 0;
      override async listItemSummaries() {
        return {
          issues: [{ code: "corrupt-item" as const, id: corruptId }],
          items: [
            {
              id: itemId,
              generation: "1",
              keyVersion: 1,
              title: browserTotp.title,
              type: "totp" as const,
            },
          ],
        };
      }
      override async getItem() {
        return {
          id: itemId,
          generation: "1",
          keyVersion: 1,
          item: browserTotp,
        };
      }
      override async computeTotp(vault: string, record: Parameters<FakeBroker["computeTotp"]>[1]) {
        this.attempts += 1;
        if (!this.allowTotp) throw new Error("redacted calculation failure");
        return super.computeTotp(vault, record);
      }
    }
    const broker = new RecoveryBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    expect(container?.textContent).toContain("1 encrypted record was skipped");
    expect(container?.textContent).toContain(corruptId);
    expect(container?.textContent).toContain("not modified");
    await click(browserTotp.title);
    expect(container?.textContent).toContain("could not be calculated");
    broker.allowTotp = true;
    await click("Try calculating again");
    expect(container?.querySelector(".totp-value")?.textContent).toMatch(/^[0-9]{8}$/);
    expect(broker.attempts).toBeGreaterThanOrEqual(2);
  });

  it("clears a revealed TOTP seed when calculation reaches a terminal error", async () => {
    let rejectTotp: ((cause: Error) => void) | undefined;
    class FailedTotpBroker extends FakeBroker {
      override async listItemSummaries() {
        return {
          issues: [],
          items: [
            {
              id: itemId,
              generation: "1",
              keyVersion: 1,
              title: browserTotp.title,
              type: "totp" as const,
            },
          ],
        };
      }
      override async getItem() {
        return { id: itemId, generation: "1", keyVersion: 1, item: browserTotp };
      }
      override async computeTotp() {
        return new Promise<Awaited<ReturnType<FakeBroker["computeTotp"]>>>((_, reject) => {
          rejectTotp = reject;
        });
      }
    }
    const broker = new FailedTotpBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click(browserTotp.title);
    await click("Show totp secret");
    expect(container?.textContent).toContain(browserTotp.secretBase32);
    await act(async () => rejectTotp?.(new Error("redacted TOTP failure")));
    expect(container?.textContent).not.toContain(browserTotp.secretBase32);
    expect(container?.textContent).toContain("could not be calculated");
    expect(container?.textContent).toContain("Try calculating again");
  });
});
