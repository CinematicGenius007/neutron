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

  async beginEnrollment(_password: string) {
    return kit;
  }

  async cancelEnrollment() {}

  async confirmEnrollment(_recoveryKit: string) {
    return { accountId: "3".repeat(32), arkEpoch: 1, vaults: [{ id: vaultId, keyVersion: 1 }] };
  }

  async unlock(_password: string) {
    return this.confirmEnrollment(kit);
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
  broker: FakeBroker,
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

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("React vault shell", () => {
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
    await enter("new-password", "synthetic master password");
    await enter("new-password-again", "synthetic master password");
    await click("Continue");
    expect(container?.textContent).toContain(kit);
    await enter("recovery-confirmation", kit);
    await click("Confirm and create vault");
    expect(container?.textContent).toContain("Synthetic login");
    expect(container?.textContent).not.toContain(secret);
    await click("Synthetic login");
    expect(container?.textContent).toContain(secret);
    await click("Lock now");
    expect(container?.textContent).not.toContain(secret);
    expect(container?.textContent).not.toContain(kit);
    expect(container?.textContent).toContain("Welcome back");
    expect(broker.lockCalls).toBe(1);
  });
});
