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
    const full = String.raw`cd C:\Users\sdsle\work\poracode && "C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.6.1.0_x64__8wekyb3d8bbwe\\pwsh.exe" -Command 'Get-Content -Path src/renderer/components/thread/ChatPane/parts/items/ToolCallGroup.tsx | Select-Object -Skip 550 -First 110'`;
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

  it("describes PowerShell Get-Content array slices as viewed lines", () => {
    const full =
      "pwsh -Command '$lines = Get-Content src/renderer/commands/registry.ts; $lines[430..490] -join \"`n\"'";
    const display = commandIntentDisplay(full);

    expect(display.title).toBe("View 431:491: src/renderer/commands/registry.ts");
    expect(display.kind).toBe("view");
    expect(display.parts).toEqual({
      prefix: "View 431:491: ",
      path: "src/renderer/commands/registry.ts",
      filePath: true,
    });
  });

  it("describes PowerShell Get-Content variable paths with range loops as viewed lines", () => {
    const full = String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '$p='"'src/supervisor/agents/base/index.ts'; "'$lines=Get-Content -LiteralPath $p; foreach($range in @(@(250,315),@(380,430),@(610,650))){ for($i=$range[0];$i -le $range[1];$i++){ if($i -le $lines.Length){ '"'{0}: {1}' -f "'$i,$lines[$i-1] }} }'`;
    const display = commandIntentDisplay(full);

    expect(display.title).toBe("View 250:315,380:430,610:650: src/supervisor/agents/base/index.ts");
    expect(display.kind).toBe("view");
    expect(display.parts).toEqual({
      prefix: "View 250:315,380:430,610:650: ",
      path: "src/supervisor/agents/base/index.ts",
      filePath: true,
    });
  });

  it("preserves Windows paths in PowerShell Get-Content -LiteralPath", () => {
    const full = String.raw`pwsh -Command 'Get-Content -LiteralPath C:\Users\sdsle\work\poracode\src\foo.ts'`;
    const display = commandIntentDisplay(full);

    expect(display.title).toBe("View: foo.ts");
    expect(display.parts).toEqual({
      prefix: "View: ",
      path: String.raw`C:\Users\sdsle\work\poracode\src\foo.ts`,
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
    const full = 'cd "c:\\Users\\me\\work\\poracode"; pnpm exec oxfmt src/a.ts';
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

  it("does not include a statement separator in a batched sed view path", () => {
    const full = `/bin/zsh -lc "sed -n '1,80p' src/shared/settings.ts; sed -n '570,630p' src/shared/settings.ts"`;
    const display = commandIntentDisplay(full);

    expect(display.title).toBe("View 1:80: src/shared/settings.ts");
    expect(display.parts).toEqual({
      prefix: "View 1:80: ",
      path: "src/shared/settings.ts",
    });
  });

  it("describes ripgrep commands as searches", () => {
    const full = `/bin/zsh -lc 'rg -n "agent status|AgentStatus" src/main src/supervisor src/shared -S'`;
    expect(humanIntentTitle(full)).toBe('Search: "agent status|AgentStatus"');
    expect(commandIntentDisplay(full).kind).toBe("search");
    expect(commandIntentDisplay(full).parts).toBeUndefined();
  });

  it("describes ripgrep all-line windows as viewed lines", () => {
    const full = String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'rg -n "''^" src/renderer/components/thread/ChatPane/parts/items/commandSummary.ts | Select-Object -Skip 1 -First 180'`;
    const display = commandIntentDisplay(full);

    expect(display.title).toBe(
      "View 2:181: src/renderer/components/thread/ChatPane/parts/items/commandSummary.ts",
    );
    expect(display.kind).toBe("view");
    expect(display.parts).toEqual({
      prefix: "View 2:181: ",
      path: "src/renderer/components/thread/ChatPane/parts/items/commandSummary.ts",
      filePath: true,
    });
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

  it("describes cat piped through head as viewed lines", () => {
    const full = `cat package.json 2>/dev/null | head -100`;
    expect(humanIntentTitle(full)).toBe("View 1:100: package.json");
    expect(commandIntentDisplay(full).kind).toBe("view");
    expect(commandIntentDisplay(full).parts).toEqual({
      prefix: "View 1:100: ",
      path: "package.json",
    });
  });

  it("describes cat piped through head inside an && chain", () => {
    const full = `cd /home/me/proj && echo "=== ROOT ===" && ls -la && echo "=== package.json ===" && cat package.json 2>/dev/null | head -100`;
    const display = commandIntentDisplay(full);
    expect(display.title).toBe("View 1:100: package.json");
    expect(display.kind).toBe("view");
  });

  it("describes head -n N file as viewed lines", () => {
    expect(humanIntentTitle("head -n 40 src/supervisor/runtime.ts")).toBe(
      "View 1:40: src/supervisor/runtime.ts",
    );
    expect(commandIntentDisplay("head -40 src/supervisor/runtime.ts").kind).toBe("view");
  });

  it("defaults a bare head to its 10-line window", () => {
    expect(humanIntentTitle("cat src/foo.ts | head")).toBe("View 1:10: src/foo.ts");
  });

  it("describes head with the file operand before the count flag", () => {
    expect(humanIntentTitle("head src/foo.ts -n 40")).toBe("View 1:40: src/foo.ts");
    expect(humanIntentTitle("head src/foo.ts -40")).toBe("View 1:40: src/foo.ts");
  });

  it("skips shell redirections when locating the head file operand", () => {
    expect(humanIntentTitle("head 2>/dev/null -100 package.json")).toBe("View 1:100: package.json");
  });

  it("keeps grep piped through head as a search, not a view", () => {
    expect(commandIntentDisplay('grep -n "foo" src/foo.ts | head -20').kind).toBe("search");
  });

  it("does not treat a filtered pipeline before head as a file view", () => {
    expect(commandIntentDisplay("cat foo | grep x | head -20").kind).not.toBe("view");
    expect(commandIntentDisplay("cat a | nl | grep x | head -20").kind).not.toBe("view");
  });

  it("does not treat head byte windows as line views", () => {
    expect(commandIntentDisplay("cat src/foo.ts | head -c 200").kind).toBe("command");
    expect(commandIntentDisplay("head -c-200 src/foo.ts").kind).toBe("command");
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
// @vitest-environment node
