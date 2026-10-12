// Mirrored by the supervisor provider installer; its regression test checks parity.
export const OPENCODE2_INSTALL_COMMANDS = {
  posix:
    'npm install --ignore-scripts --include=optional --prefix "$HOME/.opencode2" "@opencode/cli@^2.0.26" && npm --prefix "$HOME/.opencode2/node_modules/@opencode/cli" run postinstall && "$HOME/.opencode2/node_modules/@opencode/cli/bin/opencode.exe" --version',
  windows:
    '$ErrorActionPreference = "Stop"; npm install --ignore-scripts --include=optional --prefix "$env:USERPROFILE/.opencode2" "@opencode/cli@^2.0.26"; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm --prefix "$env:USERPROFILE/.opencode2/node_modules/@opencode/cli" run postinstall; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & "$env:USERPROFILE/.opencode2/node_modules/@opencode/cli/bin/opencode.exe" --version; exit $LASTEXITCODE',
};
