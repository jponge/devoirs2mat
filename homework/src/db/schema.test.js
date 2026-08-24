// @vitest-environment node
//
// A source guard, like `src/theme-css.test.js`: it reads the Rust migrations off
// disk. The node environment is needed because Vite rewrites
// `new URL(<relative>, import.meta.url)` into an http URL in web transform mode,
// which `fileURLToPath` then rejects.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION } from "@/db/schema";
import { DATABASE_URL } from "@/db/client";

const migrationsRs = readFileSync(
  fileURLToPath(new URL("../../src-tauri/src/migrations.rs", import.meta.url)),
  "utf8",
);

// Only the declarations, not the assertions in the Rust tests below them.
const declaredVersions = [...migrationsRs.matchAll(/^\s*version:\s*(\d+),/gm)].map(
  (match) => Number(match[1]),
);

describe("SCHEMA_VERSION", () => {
  it("is the version the current migrations produce", () => {
    expect(declaredVersions.length).toBeGreaterThan(0);
    expect(SCHEMA_VERSION).toBe(Math.max(...declaredVersions));
  });

  // Appending a migration without bumping the constant would let the application
  // export a header claiming an older schema, and refuse its own exports after
  // the next release. Nothing else detects that, hence this test.
  it("counts as many migrations as there are versions", () => {
    expect(SCHEMA_VERSION).toBe(declaredVersions.length);
  });
});

describe("the wiring that only fails at runtime", () => {
  // Three things compile and start cleanly while being wrong, and each fails
  // later with an error that does not point at the cause.
  const libRs = readFileSync(
    fileURLToPath(new URL("../../src-tauri/src/lib.rs", import.meta.url)),
    "utf8",
  );
  const cargoToml = readFileSync(
    fileURLToPath(new URL("../../src-tauri/Cargo.toml", import.meta.url)),
    "utf8",
  );
  const capabilities = readFileSync(
    fileURLToPath(new URL("../../src-tauri/capabilities/default.json", import.meta.url)),
    "utf8",
  );

  // The plugin keys migrations by this exact string. If the two halves drift the
  // app opens an un-migrated database and every query fails with `no such table`.
  it("registers the migrations under the URL the client opens", () => {
    expect(libRs).toContain(`add_migrations("${DATABASE_URL}"`);
  });

  // Without the feature the crate compiles and every query fails at runtime.
  it("enables the sqlite feature on tauri-plugin-sql", () => {
    expect(cargoToml).toMatch(/tauri-plugin-sql\s*=\s*\{[^}]*features\s*=\s*\[[^\]]*"sqlite"/);
  });

  // `sql:default` grants only close/load/select. Without `sql:allow-execute`
  // every read works and every write fails — the database just stays empty.
  it("grants both the default SQL permissions and execute", () => {
    const permissions = JSON.parse(capabilities).permissions;
    expect(permissions).toContain("sql:default");
    expect(permissions).toContain("sql:allow-execute");
  });
});
