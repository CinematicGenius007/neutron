import type { VaultItem } from "@neutron/vault-domain/items";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { VaultApp, type VaultBroker } from "../../src/app.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const kit = `ntrk1${"q".repeat(85)}`;
const vaultId = "1".repeat(32);
const itemId = "2".repeat(32);
const secret = "synthetic-rendered-secret";
const supported = Object.freeze({ missing: Object.freeze([]), supported: true });

class FakeBroker implements VaultBroker {
  isClosed = false;
  lockCalls = 0;
  readonly createCalls: Array<{ item: VaultItem; vaultId: string }> = [];
  readonly deleteCalls: Array<{
    generation: string;
    itemId: string;
    keyVersion: number;
    vaultId: string;
  }> = [];
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
    return { accountId: "3".repeat(32), arkEpoch: 1, vaults: [{ id: vaultId, keyVersion: 1 }] };
  }

  async createItem(requestVaultId: string, item: VaultItem) {
    this.createCalls.push({ item, vaultId: requestVaultId });
    return { id: itemId, generation: "1", keyVersion: 1 };
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

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
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
    expect(container?.textContent).toContain(secret);
    await click("Lock now");
    expect(container?.textContent).not.toContain(secret);
    expect(container?.textContent).not.toContain(kit);
    expect(container?.textContent).toContain("Welcome back");
    expect(broker.lockCalls).toBe(1);
    expect(document.activeElement?.textContent).toContain("Welcome back");
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
    expect(container?.querySelector(".editor-error")?.textContent).toBe(
      "Check the item fields and limits.",
    );
    expect(container?.querySelector(".editor-error")?.textContent).not.toContain(rejectedSecret);
    expect(broker.createCalls).toHaveLength(0);

    await enter("item-json", "{}");
    await enter("item-title", "🔐".repeat(65));
    await submitForm("Create item");
    expect(broker.createCalls).toHaveLength(0);
    await enter("item-title", "Rejected tags");
    await enter("item-tags", "duplicate\nduplicate");
    await submitForm("Create item");
    expect(broker.createCalls).toHaveLength(0);

    await choose("item-type", "totp");
    await enter("item-title", "Rejected TOTP");
    await enter("item-tags", "");
    await enter("item-totp-secret", "jbswy3dpehpk3pxp");
    await submitForm("Create item");
    expect(broker.createCalls).toHaveLength(0);

    await choose("item-type", "backup-code");
    await enter("item-title", "Rejected backup codes");
    await enter("item-codes", "duplicate\nduplicate");
    await submitForm("Create item");
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
        throw Object.assign(new Error("broker-secret-leak"), { code: "conflict" });
      }
    }
    const broker = new ConflictBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    await click("Edit item");
    expect(container?.querySelector<HTMLSelectElement>("#item-type")?.disabled).toBe(true);
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
    expect(container?.textContent).toContain("Your draft was not saved.");
    expect(container?.textContent).not.toContain("broker-secret-leak");
  });

  it("gives every create action a fresh draft and restores focus after cancellation", async () => {
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
    expect(value("item-title")).toBe("");
    expect(value("item-password")).toBe("");
    expect(container?.querySelector<HTMLInputElement>("#item-has-url")?.checked).toBe(false);
    expect(container?.querySelector<HTMLSelectElement>("#item-type")?.value).toBe("login");

    await choose("item-type", "secure-note");
    await enter("item-title", "discarded create title");
    await enter("item-body", "discarded-create-body");
    await act(async () => createAction.click());
    expect(value("item-title")).toBe("");
    expect(value("item-password")).toBe("");
    expect(container?.querySelector("#item-body")).toBeNull();
    expect(container?.querySelector<HTMLSelectElement>("#item-type")?.value).toBe("login");
    expect(container?.textContent).not.toContain(discardedSecret);

    await submitForm("Create item");
    expect(broker.createCalls).toHaveLength(0);
    await click("Cancel editing");
    expect(document.activeElement).toBe(createAction);
  });

  it("requires delete confirmation and sends the exact selected tuple", async () => {
    const broker = new FakeBroker();
    await render(broker);
    await enter("unlock-password", "synthetic master password");
    await click("Unlock vault");
    await click("Synthetic login");
    await click("Edit item");
    await click("Delete item");
    expect(document.activeElement?.textContent).toBe("Delete this item?");
    await click("Cancel deletion");
    expect(document.activeElement?.textContent).toBe("Delete item");
    expect(broker.deleteCalls).toHaveLength(0);
    await click("Delete item");
    await click("Confirm delete");
    expect(broker.deleteCalls).toEqual([{ vaultId, itemId, generation: "1", keyVersion: 1 }]);
    expect(container?.textContent).toContain("Choose an item to decrypt it");
    expect(container?.textContent).not.toContain(secret);
  });

  it("dispatches one delayed mutation and suppresses its completion after lock", async () => {
    let resolveCreate:
      | ((revision: { generation: string; id: string; keyVersion: number }) => void)
      | undefined;
    class DelayedCreateBroker extends FakeBroker {
      override async createItem(requestVaultId: string, item: VaultItem) {
        this.createCalls.push({ item, vaultId: requestVaultId });
        return new Promise<{ generation: string; id: string; keyVersion: number }>((resolve) => {
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
        return new Promise<{ generation: string; id: string; keyVersion: number }>((resolve) => {
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
});
