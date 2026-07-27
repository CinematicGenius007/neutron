import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateSyntheticEnvelopeCandidates,
  generateSyntheticMigrationCandidates,
} from "../dist/reference-generator.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(packageRoot, "fixtures/crypto-envelope-v1.json");
const digestPath = join(packageRoot, "fixtures/crypto-envelope-v1.sha256");
const pendingPath = join(packageRoot, "requirements/crypto-envelope-v1.pending.json");

const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const pending = JSON.parse(await readFile(pendingPath, "utf8"));
const generated = [
  ...generateSyntheticEnvelopeCandidates(),
  ...generateSyntheticMigrationCandidates(),
];
const generatedIds = new Set(generated.map(({ id }) => id));

if (generatedIds.size !== generated.length) throw new Error("duplicate generated envelope id");
const pendingIds = new Set(pending.requirements.map(({ id }) => id));
const fixtureIds = new Set(fixture.cases.map(({ id }) => id));
for (const id of generatedIds) {
  if (!pendingIds.has(id) && !fixtureIds.has(id) && !id.startsWith("hardening-"))
    throw new Error(`generated requirement is neither pending nor executable: ${id}`);
}

fixture.cases = [...fixture.cases.filter(({ id }) => !generatedIds.has(id)), ...generated];
pending.requirements = pending.requirements.filter(({ id }) => !generatedIds.has(id));

const fixtureJson = `${JSON.stringify(fixture, null, 2)}\n`;
await Promise.all([
  writeFile(fixturePath, fixtureJson),
  writeFile(digestPath, `${createHash("sha256").update(fixtureJson).digest("hex")}\n`),
  writeFile(pendingPath, `${JSON.stringify(pending, null, 2)}\n`),
]);
