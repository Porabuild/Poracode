import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  assertRequiredDatabaseSchema,
  LATEST_SCHEMA_VERSION,
  runDatabaseMigrations,
} from "./migrations";
import {
  createSchema53PayloadOriginDatabase,
  migrateSchema53FixtureThrough,
} from "./runtimePayloadOrigins.testFixtures";
import { nativeBindingEnv } from "./runtimeItems.testFixtures";

it("upgrades schema61 without fabricating prices or discarding old usage and dedup baselines", () => {
  mkdirSync("tmp", { recursive: true });
  const dir = mkdtempSync(join("tmp", "costs-schema62-"));
  const previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  const db = createSchema53PayloadOriginDatabase(join(dir, "state.sqlite"));
  try {
    migrateSchema53FixtureThrough(db, 61);
    db.exec(
      "INSERT INTO usage_events (ts,kind,provider,model,value) VALUES (123,'tokens_v2','fixture:work','model',100)",
    );
    db.exec(
      "INSERT INTO usage_token_ledger (provider,scope_id,epoch,last_counter) VALUES ('fixture:work','session',0,100)",
    );
    db.exec("INSERT INTO usage_token_samples (sample_id,ts) VALUES ('old-sample',123)");
    expect(() => assertRequiredDatabaseSchema(db)).toThrow(
      /usage_events.cost_details.*usage_token_ledger.cost_details/,
    );
    runDatabaseMigrations(db, 61);
    expect(() => assertRequiredDatabaseSchema(db)).not.toThrow();
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_usage_token_ledger_scope'",
        )
        .get(),
    ).toEqual({ name: "idx_usage_token_ledger_scope" });
    expect(db.prepare("SELECT value, cost_details FROM usage_events").all()).toEqual([
      { value: 100, cost_details: null },
    ]);
    expect(db.prepare("SELECT last_counter, cost_details FROM usage_token_ledger").all()).toEqual([
      { last_counter: 100, cost_details: null },
    ]);
    expect(db.prepare("SELECT sample_id FROM usage_token_samples").all()).toEqual([
      { sample_id: "old-sample" },
    ]);
    expect(db.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get()).toEqual({
      value: String(LATEST_SCHEMA_VERSION),
    });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
    if (previousBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
  }
});
