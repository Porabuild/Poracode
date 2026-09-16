import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let declared: string | undefined;

/**
 * Layout-contract escape hatch for synthetic-server test harnesses: the
 * declaration only requires an existing absolute directory, and the synthetic
 * host never consumes its contents, so one temp dir per test process is
 * enough — independent of prepared checkout resources (CI test shards stage
 * none).
 */
export function ensureDeclaredAssetsDir(): string {
  declared ??= mkdtempSync(join(tmpdir(), "poracode-test-assets-"));
  return declared;
}
