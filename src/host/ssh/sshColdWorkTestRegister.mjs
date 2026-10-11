// Test-only Node hook for the cold-work process fixture. The runtime source
// hash is a build-time declaration replaced by tsdown; a fixture child that
// runs from source needs a syntactically valid digest, so this hook serves the
// same mocked value the in-process suites use. Never imported by production.
import { registerHooks } from "node:module";

const MOCK_SOURCE = `export const RUNTIME_BUILD_SOURCE_HASH = "${"d".repeat(64)}";\n`;

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith("/runtimeBuildIdentity.ts")) {
      return { format: "module", source: MOCK_SOURCE, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
