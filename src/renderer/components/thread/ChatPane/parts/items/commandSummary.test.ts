import { describe, expect, it } from "vitest";
import { commandIntentDisplay, humanIntentTitle, summarizeShellCommand } from "./commandSummary";

describe("summarizeShellCommand", () => {
  it("pulls PowerShell -Command single-quoted script", () => {
    const full = String.raw`cd C:\Users\work\proj && "C:\\Program Files\\pwsh\\pwsh.exe" -Command 'Get-Content src/renderer/state/slices/runtimeEventSlice.ts'`;
    expect(summarizeShellCommand(full)).toBe(
      "Get-Content src/renderer/state/slices/runtimeEventSlice.ts",
    );
  });

  it("pulls POSIX shell -lc double-quoted script", () => {
    const full = `/bin/zsh -lc "sed -n '1,260p' src/supervisor/runtime.ts"`;
    expect(summarizeShellCommand(full)).toBe("sed -n '1,260p' src/supervisor/runtime.ts");
  });

  it("unescapes doubled single-quotes inside PS -Command", () => {
    const full = `cd /tmp && pwsh -Command 'Write-Output ''hi'''`;
    expect(summarizeShellCommand(full)).toBe(`Write-Output 'hi'`);
  });

  it("falls back to last && segment when no -Command match", () => {
    expect(summarizeShellCommand("cd /a && cd /b && pnpm exec oxfmt src/foo.ts")).toBe(
      "pnpm exec oxfmt src/foo.ts",
    );
  });

  it("returns trimmed full string when already short", () => {
    expect(summarizeShellCommand("  ls -la  ")).toBe("ls -la");
  });
});

describe("humanIntentTitle", () => {
  it("describes Get-Content as a file view", () => {
    const full = String.raw`cd C:\proj && pwsh -Command 'Get-Content src/shared/contracts/agentInstance.ts'`;
    expect(humanIntentTitle(full)).toBe("View: agentInstance.ts");
    expect(commandIntentDisplay(full).parts).toEqual({
      prefix: "View: ",
      path: "src/shared/contracts/agentInstance.ts",
      filePath: true,
    });
  });

  it("describes PowerShell Get-Content -Path ranges", () => {
    const full = String.raw`cd C:\Users\sdsle\work\lightcode && "C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.6.1.0_x64__8wekyb3d8bbwe\\pwsh.exe" -Command 'Get-Content -Path src/renderer/components/thread/ChatPane/parts/items/ToolCallGroup.tsx | Select-Object -Skip 550 -First 110'`;
    const display = commandIntentDisplay(full);

    expect(display.title).toBe(
      "View 551:660: src/renderer/components/thread/ChatPane/parts/items/ToolCallGroup.tsx",
    );
    expect(display.kind).toBe("view");
    expect(display.parts).toEqual({
      prefix: "View 551:660: ",
      path: "src/renderer/components/thread/ChatPane/parts/items/ToolCallGroup.tsx",
      filePath: true,
    });
  });

  it("preserves Windows paths in PowerShell Get-Content -LiteralPath", () => {
    const full = String.raw`pwsh -Command 'Get-Content -LiteralPath C:\Users\sdsle\work\lightcode\src\foo.ts'`;
    const display = commandIntentDisplay(full);

    expect(display.title).toBe("View: foo.ts");
    expect(display.parts).toEqual({
      prefix: "View: ",
      path: String.raw`C:\Users\sdsle\work\lightcode\src\foo.ts`,
      filePath: true,
    });
  });

  it("uses Check: for lint/typecheck scripts", () => {
    expect(humanIntentTitle(`cd /x && pnpm run lint`)).toBe("Check: pnpm run lint");
    expect(humanIntentTitle(`npm run typecheck`)).toBe("Check: npm run typecheck");
    expect(commandIntentDisplay(`pnpm run test`).kind).toBe("check");
  });

  it("labels oxfmt via pnpm exec", () => {
    expect(humanIntentTitle("cd /p && pnpm exec oxfmt a.ts b.ts")).toBe("Format files");
  });

  it("strips PowerShell cd …; before intent", () => {
    const full = 'cd "c:\\Users\\me\\work\\lightcode"; pnpm exec oxfmt src/a.ts';
    expect(humanIntentTitle(full)).toBe("Format files");
  });

  it("describes sed -n ranges as viewed lines", () => {
    const full = `/bin/zsh -lc "sed -n '1,260p' src/supervisor/runtime.ts"`;
    const display = commandIntentDisplay(full);
    expect(humanIntentTitle(full)).toBe("View 1:260: src/supervisor/runtime.ts");
    expect(display.kind).toBe("view");
    expect(display.parts).toEqual({
      prefix: "View 1:260: ",
      path: "src/supervisor/runtime.ts",
    });
  });

  it("describes ripgrep commands as searches", () => {
    const full = `/bin/zsh -lc 'rg -n "agent status|AgentStatus" src/main src/supervisor src/shared -S'`;
    expect(humanIntentTitle(full)).toBe('Search: "agent status|AgentStatus"');
    expect(commandIntentDisplay(full).kind).toBe("search");
    expect(commandIntentDisplay(full).parts).toBeUndefined();
  });

  it("describes plain grep commands as searches", () => {
    const full = `grep -n "toastId" src/renderer/notifications.ts`;
    expect(humanIntentTitle(full)).toBe('Search: "toastId"');
    expect(commandIntentDisplay(full).kind).toBe("search");
  });

  it("describes recursive grep with multiple paths as a search", () => {
    const full = `grep -rn "filteredCommands" src/renderer src/shared`;
    expect(commandIntentDisplay(full)).toEqual({
      title: 'Search: "filteredCommands"',
      kind: "search",
    });
  });

  it("describes egrep/fgrep as searches", () => {
    expect(commandIntentDisplay(`egrep -i "foo|bar" src/x.ts`).kind).toBe("search");
    expect(commandIntentDisplay(`fgrep "literal" src/x.ts`).kind).toBe("search");
  });

  it("handles grep -e PATTERN form", () => {
    const full = `grep -rn -e "needle" src`;
    expect(humanIntentTitle(full)).toBe('Search: "needle"');
  });

  it("describes cat piped through sed as viewed lines", () => {
    const full = `cat node_modules/.modules.yaml 2>/dev/null | sed -n '1,180p'`;
    expect(humanIntentTitle(full)).toBe("View 1:180: node_modules/.modules.yaml");
    expect(commandIntentDisplay(full).kind).toBe("view");
  });

  it("describes numbered file output piped through sed as viewed lines", () => {
    const full = `nl -ba src/renderer/components/thread/ChatPane/parts/items/toolDisplay.ts | sed -n '1,260p'`;
    const display = commandIntentDisplay(full);

    expect(display.title).toBe(
      "View 1:260: src/renderer/components/thread/ChatPane/parts/items/toolDisplay.ts",
    );
    expect(display.kind).toBe("view");
    expect(display.parts).toEqual({
      prefix: "View 1:260: ",
      path: "src/renderer/components/thread/ChatPane/parts/items/toolDisplay.ts",
    });
  });

  it("describes find commands as searches", () => {
    const full = `find node_modules/.pnpm -maxdepth 4 -type f -name 'vitest.mjs' | sed -n '1,80p'`;
    expect(humanIntentTitle(full)).toBe('Search: "vitest.mjs"');
    expect(commandIntentDisplay(full).kind).toBe("search");
    expect(commandIntentDisplay(full).parts).toBeUndefined();
  });

  it("describes directory listings and package manager commands", () => {
    expect(humanIntentTitle("ls -la node_modules/.pnpm/vitest@4.1.5")).toBe(
      "List: node_modules/.pnpm/vitest@4.1.5",
    );
    expect(commandIntentDisplay("ls -la node_modules").kind).toBe("list");

    expect(humanIntentTitle("pnpm install --force --offline")).toBe(
      "Install packages: pnpm install",
    );
    expect(commandIntentDisplay("pnpm install --prod=false").kind).toBe("install");
    expect(humanIntentTitle("pnpm config list")).toBe("Package config: pnpm config list");
    expect(commandIntentDisplay("pnpm list --depth 0").kind).toBe("list");
    expect(commandIntentDisplay("pnpm --version").kind).toBe("package");
  });

  it("marks git commands with git intent", () => {
    expect(commandIntentDisplay("git diff -- src/foo.ts").kind).toBe("git");
  });
});
