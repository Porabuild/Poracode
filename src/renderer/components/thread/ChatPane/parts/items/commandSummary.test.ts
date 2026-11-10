import { describe, expect, it } from "vitest";
import { commandActionsDisplay, commandPayloadDisplay } from "./commandActionsDisplay";
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
    expect(humanIntentTitle(full)).toBe('Search: "toastId" in src/renderer/notifications.ts');
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
    expect(humanIntentTitle(full)).toBe('Search: "needle" in src');
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

  it("labels blank and pipe-only commands without crashing", () => {
    // Regression: an empty pipeline reached parseHeadFileView, which indexed
    // parts[-1] and iterated undefined ("e is not iterable" renderer crash).
    expect(commandIntentDisplay("").kind).toBe("command");
    expect(commandIntentDisplay("   ").kind).toBe("command");
    expect(commandIntentDisplay("|").kind).toBe("command");
    expect(commandIntentDisplay(" | | ").kind).toBe("command");
    expect(commandIntentDisplay(`bash -c ''`).kind).toBe("command");
    expect(commandIntentDisplay("cd /tmp && ").kind).toBe("command");
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

describe("commandActionsDisplay", () => {
  it("returns null without actions or with unknown kinds", () => {
    expect(commandActionsDisplay(undefined)).toBeNull();
    expect(commandActionsDisplay([])).toBeNull();
    expect(commandActionsDisplay([{ kind: "write", path: "/a" }])).toBeNull();
    expect(commandActionsDisplay([{ kind: "read", path: "/a" }, { kind: "other" }])).toBeNull();
  });

  it("describes a single read action as a view with file parts", () => {
    const display = commandActionsDisplay([
      { kind: "read", path: "E:\\repo\\notes.txt", name: "notes.txt" },
    ]);
    expect(display?.kind).toBe("view");
    expect(display?.title).toBe("View: notes.txt");
    expect(display?.parts).toEqual({
      prefix: "View: ",
      path: "E:\\repo\\notes.txt",
      filePath: true,
    });
  });

  it("marks read paths containing variables as non-file paths", () => {
    const display = commandActionsDisplay([{ kind: "read", path: "$env:X\\notes.txt" }]);
    expect(display?.parts?.filePath).toBe(false);
  });

  it("describes a single list action", () => {
    expect(commandActionsDisplay([{ kind: "list", path: "/repo/src" }])).toEqual({
      title: "List: /repo/src",
      kind: "list",
    });
    expect(commandActionsDisplay([{ kind: "list" }])).toEqual({
      title: "List: .",
      kind: "list",
    });
  });

  it("describes search actions with basename scope for absolute paths", () => {
    expect(
      commandActionsDisplay([{ kind: "search", query: "foo", path: "E:\\repo\\src" }]),
    ).toEqual({ title: 'Search: "foo" in src', kind: "search" });
    expect(commandActionsDisplay([{ kind: "search", query: "foo" }])).toEqual({
      title: 'Search: "foo"',
      kind: "search",
    });
    expect(commandActionsDisplay([{ kind: "search", path: "src" }])).toEqual({
      title: "Search: src",
      kind: "search",
    });
  });

  it("joins multiple read actions into one view title", () => {
    const display = commandActionsDisplay([
      { kind: "read", path: "/repo/a.ts", name: "a.ts" },
      { kind: "read", path: "/repo/b.ts", name: "b.ts" },
    ]);
    expect(display).toEqual({ title: "View: a.ts, b.ts", kind: "view" });
  });

  it("summarizes mixed actions as first title plus a count", () => {
    const display = commandActionsDisplay([
      { kind: "read", path: "/repo/a.ts", name: "a.ts" },
      { kind: "search", query: "foo" },
    ]);
    expect(display?.title).toBe("View: a.ts +1");
    expect(display?.kind).toBe("search");
    expect(display?.parts).toBeUndefined();
  });
});

describe("commandPayloadDisplay", () => {
  it("prefers provider actions over command-line heuristics", () => {
    const payload = {
      command: "pwsh -Command \"rg -n -i -C 2 'alpha|beta' MEMORY.md\"",
      actions: [{ kind: "read" as const, path: "E:\\repo\\notes.txt", name: "notes.txt" }],
    };
    const display = commandPayloadDisplay(payload, payload.command);
    expect(display.kind).toBe("view");
    expect(display.title).toBe("View: notes.txt");
    expect(display.parts?.path).toBe("E:\\repo\\notes.txt");
  });

  it("falls back to heuristics without actions", () => {
    const display = commandPayloadDisplay({ command: "git status" }, "git status");
    expect(display.kind).toBe("git");
  });
});

describe("grep-like search titles", () => {
  it("does not treat ripgrep context-count options as the pattern", () => {
    const full = String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "rg -n -i -C 2 'alpha|beta' MEMORY.md"`;
    const display = commandIntentDisplay(full);
    expect(display.title).toBe('Search: "alpha|beta" in MEMORY.md');
    expect(display.kind).toBe("search");
  });

  it("collects repeated -e patterns into a +n suffix", () => {
    const full = String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "rg -n -e 'answer' -e 'hello' -e 'guide' ."`;
    expect(commandIntentDisplay(full).title).toBe('Search: "answer" +2');
  });

  it("uses the full scoped message plus count for repeated patterns with one scope", () => {
    const full = String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "rg -n -e 'answer' -e 'hello' -e 'guide' MEMORY.md"`;
    expect(commandIntentDisplay(full).title).toBe('Search: "answer" in MEMORY.md +2');
  });

  it("keeps grep option values out of the pattern", () => {
    expect(commandIntentDisplay("grep -C 3 -e foo src/").title).toBe('Search: "foo" in src/');
    expect(commandIntentDisplay("rg --max-count 5 --glob '*.ts' needle src").title).toBe(
      'Search: "needle" in src',
    );
  });
});

describe("PowerShell Get-Content script views", () => {
  it("unescapes double-quoted -Command without mangling backslash paths", () => {
    const full = String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content -LiteralPath 'docs\\guide.md'"`;
    const display = commandIntentDisplay(full);
    expect(display.kind).toBe("view");
    expect(display.parts?.path).toBe("docs\\guide.md");
    expect(display.title).toBe("View: guide.md");
  });

  it("preserves Windows paths containing \\n inside double-quoted -Command", () => {
    const full = String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content -LiteralPath 'C:\\Users\\me\\node\\notes.md'"`;
    const display = commandIntentDisplay(full);
    expect(display.parts?.path).toBe("C:\\Users\\me\\node\\notes.md");
  });

  it("resolves Join-Path variable assignments into a ranged view", () => {
    const full =
      "\"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe\" -Command '$repo = Join-Path (Get-Location) '\"'src'; Get-Content -LiteralPath (Join-Path \"'$repo '\"'app.ts') | Select-Object -First 5\"";
    const display = commandIntentDisplay(full);
    expect(display.kind).toBe("view");
    expect(display.title).toBe("View 1:5: src/app.ts");
    expect(display.parts?.path).toBe("src/app.ts");
    expect(display.parts?.path).not.toMatch(/[($]/);
  });

  it("rejects scripts containing non-view cmdlets", () => {
    const full =
      "\"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe\" -Command '$p = Join-Path (Get-Location) '\"'notes.txt'; Get-Content -LiteralPath \"'$p; Get-ChildItem -Force src | Select-Object Name'";
    const display = commandIntentDisplay(full);
    expect(display.kind).toBe("command");
    expect(display.title.startsWith("Run:")).toBe(true);
  });

  it("aggregates multiple Get-Content statements into one view", () => {
    const full = String.raw`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "Get-Content -LiteralPath 'notes.txt'; Get-Content -LiteralPath 'docs\\guide.md'"`;
    const display = commandIntentDisplay(full);
    expect(display.kind).toBe("view");
    expect(display.title).toBe("View: notes.txt, guide.md");
    expect(display.parts).toBeUndefined();
  });

  it("resolves $env: paths literally with filePath disabled", () => {
    const full = String.raw`pwsh -Command "$repo=Join-Path $env:LOCALAPPDATA 'X'; Get-Content -LiteralPath (Join-Path $repo 'cli.cpp') | Select-Object -Skip 410 -First 160"`;
    const display = commandIntentDisplay(full);
    expect(display.kind).toBe("view");
    expect(display.title).toContain("411:570");
    expect(display.parts?.path).toContain("cli.cpp");
    expect(display.parts?.filePath).toBe(false);
  });

  it("does not invent a view path from named-parameter Join-Path", () => {
    const full =
      "pwsh -Command \"$p = Join-Path -Path (Get-Location) -ChildPath 'notes.txt'; Get-Content -LiteralPath $p\"";
    const display = commandIntentDisplay(full);
    expect(display.kind).toBe("command");
    expect(display.title.startsWith("Run:")).toBe(true);
  });
});
// @vitest-environment node
