import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_COMPLETION_VERSION, queryCompletion, renderCompletion } from "../lib/completion.mjs";
import { runCli } from "../lib/launcher.mjs";

await test("completes local log inspection without owner queries", () => {
  assert.ok(queryCompletion([], "lo").candidates.includes("logs"));
  assert.ok(queryCompletion(["logs"], "--").candidates.includes("--follow"));
  assert.ok(queryCompletion(["logs"], "--").candidates.includes("--lines"));
  assert.equal(queryCompletion(["logs", "--log-file"], "").mode, "files");
  assert.deepEqual(queryCompletion(["logs", "--lines"], "").candidates, []);
});

await test("completes explicit saved-session continuation without guessing a session identity", () => {
  assert.ok(queryCompletion(["run"], "--").candidates.includes("--session"));
  assert.ok(queryCompletion(["run"], "--").candidates.includes("--standalone"));
  assert.ok(queryCompletion(["run"], "--").candidates.includes("--interactive"));
  assert.ok(queryCompletion(["run"], "--").candidates.includes("--directory"));
  assert.equal(queryCompletion(["run", "--directory"], "").mode, "files");
  assert.deepEqual(queryCompletion(["run", "--session"], "").candidates, []);
  assert.ok(!queryCompletion(["run"], "--").candidates.includes("--continue"));
});

await test("completes repeated run file paths without resolving an owner or hiding the repeated flag", () => {
  assert.equal(queryCompletion(["run", "--file"], "").mode, "files");
  assert.ok(queryCompletion(["run", "--file", "first.txt"], "--").candidates.includes("--file"));
  assert.equal(
    queryCompletion(["run", "--session", "saved", "--file", "first.txt", "--file"], "").mode,
    "files",
  );
});

await test("completes session metadata controls without suggesting runtime resume or destructive deletion", () => {
  for (const command of ["rename", "archive", "unarchive", "done", "reopen"])
    assert.ok(queryCompletion(["sessions"], "").candidates.includes(command));
  assert.ok(queryCompletion(["sessions", "rename", "thread"], "--").candidates.includes("--title"));
  assert.ok(queryCompletion(["sessions", "archive", "thread"], "--").candidates.includes("--yes"));
  assert.ok(!queryCompletion(["sessions", "reopen", "thread"], "--").candidates.includes("--yes"));
  assert.ok(!queryCompletion(["sessions"], "").candidates.includes("resume"));
  assert.ok(!queryCompletion(["sessions"], "").candidates.includes("delete"));
});

await test("completes the selected command's supported options without guessing account IDs", () => {
  assert.ok(queryCompletion([], "--").candidates.includes("--no-open"));
  assert.ok(queryCompletion(["serve"], "--").candidates.includes("--open"));
  assert.ok(queryCompletion(["setup"], "--").candidates.includes("--open"));
  assert.ok(queryCompletion(["setup"], "--").candidates.includes("--no-open"));
  assert.ok(queryCompletion(["status"], "--").candidates.includes("--details"));
  assert.ok(!queryCompletion(["--open"], "").candidates.includes("providers"));
  assert.deepEqual(queryCompletion([], "pro"), {
    mode: "candidates",
    candidates: ["providers", "projects"],
  });
  assert.deepEqual(queryCompletion(["projects"], "in"), {
    mode: "candidates",
    candidates: ["inspect"],
  });
  assert.ok(queryCompletion(["projects", "list"], "--").candidates.includes("--cursor"));
  assert.ok(!queryCompletion(["projects", "inspect", "id"], "--").candidates.includes("--name"));
  assert.deepEqual(queryCompletion(["mcp"], "con"), {
    mode: "candidates",
    candidates: ["configure"],
  });
  assert.deepEqual(queryCompletion(["sessions"], "st"), {
    mode: "candidates",
    candidates: ["stop"],
  });
  assert.ok(queryCompletion(["sessions", "list"], "--").candidates.includes("--cursor"));
  assert.deepEqual(queryCompletion(["sessions"], "ex"), {
    mode: "candidates",
    candidates: ["export"],
  });
  assert.ok(
    queryCompletion(["sessions", "export", "thread"], "--").candidates.includes("--output"),
  );
  assert.equal(queryCompletion(["sessions", "export", "thread", "--output"], "").mode, "files");
  assert.ok(
    queryCompletion(["sessions", "stop", "exact-thread"], "--").candidates.includes("--yes"),
  );
  assert.ok(
    !queryCompletion(["sessions", "stop", "exact-thread"], "--").candidates.includes("--wsl"),
  );
  const configure = queryCompletion(["providers", "configure", "exact-profile"], "--");
  assert.equal(configure.mode, "candidates");
  assert.ok(configure.candidates.includes("--prompt-env"));
  assert.ok(configure.candidates.includes("--config-file"));
  assert.ok(!configure.candidates.includes("--driver"));
  assert.ok(!configure.candidates.includes("--wsl"));
  assert.ok(queryCompletion(["plugins", "catalogs"], "ref").candidates.includes("refresh"));
  assert.ok(
    queryCompletion(["plugins", "install", "opaque-id", "notes"], "--").candidates.includes(
      "--review-digest",
    ),
  );
  assert.equal(queryCompletion(["plugins", "catalogs", "add", "--path"], "").mode, "files");
  assert.ok(!queryCompletion(["plugins", "install"], "--").candidates.includes("--account"));
  assert.deepEqual(queryCompletion(["auth", "login"], "private-account"), {
    mode: "candidates",
    candidates: [],
  });
  assert.ok(!queryCompletion(["auth", "accounts"], "--").candidates.includes("--runtime"));
});

await test("does not interpret global option values or opaque IDs as subcommands", () => {
  assert.ok(
    queryCompletion(["--base-dir", "mcp", "providers"], "co").candidates.includes("configure"),
  );
  assert.ok(
    queryCompletion(["--base-dir", "E:/profile space", "providers"], "co").candidates.includes(
      "configure",
    ),
  );
  assert.ok(
    queryCompletion(
      ["providers", "configure", "--config-file", "auth", "mcp"],
      "--",
    ).candidates.includes("--prompt-env"),
  );
  assert.ok(!queryCompletion(["--host", "127.0.0.1"], "").candidates.includes("providers"));
  assert.deepEqual(queryCompletion(["providers", "unknown"], ""), { mode: "none", candidates: [] });
  assert.deepEqual(queryCompletion(["version"], ""), { mode: "none", candidates: [] });
  assert.deepEqual(queryCompletion(["completion", "bash"], ""), { mode: "none", candidates: [] });
  assert.deepEqual(queryCompletion(["completion", "--json"], ""), { mode: "none", candidates: [] });
  assert.deepEqual(queryCompletion(["--base-dir=E:/profile space"], ""), {
    mode: "none",
    candidates: [],
  });
  assert.deepEqual(queryCompletion(["serve"], "--config=private"), {
    mode: "none",
    candidates: [],
  });
  assert.deepEqual(queryCompletion(["service", "install", "--prefix=private"], ""), {
    mode: "none",
    candidates: [],
  });
  assert.deepEqual(queryCompletion(["providers", "configure", "work", "--json=true"], ""), {
    mode: "none",
    candidates: [],
  });
});

await test("completes nested account controls without querying credentials or inventing account IDs", () => {
  assert.ok(queryCompletion(["plugins", "accounts"], "log").candidates.includes("login"));
  assert.ok(queryCompletion(["mcp", "auth"], "log").candidates.includes("login"));
  assert.ok(
    queryCompletion(["plugins", "accounts", "login", "fixture"], "--").candidates.includes(
      "--label",
    ),
  );
  assert.ok(
    !queryCompletion(["mcp", "auth", "login", "fixture"], "--").candidates.includes("--account"),
  );
  assert.deepEqual(queryCompletion(["plugins", "accounts"], "s").candidates, ["select"]);
  assert.deepEqual(queryCompletion(["mcp", "auth"], "st").candidates, ["status"]);
  assert.ok(
    queryCompletion(["plugins", "accounts", "logout", "fixture"], "--").candidates.includes(
      "--account",
    ),
  );
  assert.ok(queryCompletion(["mcp", "auth", "logout", "tools"], "--").candidates.includes("--yes"));
  assert.deepEqual(
    queryCompletion(["plugins", "accounts", "select", "fixture", "--account"], "").candidates,
    [],
  );
  assert.ok(
    !queryCompletion(["mcp", "auth", "status", "tools"], "--").candidates.includes("--wsl"),
  );
});

await test("offers canonical static values and delegates only path arguments to the shell", () => {
  assert.deepEqual(queryCompletion(["configure", "--bind-mode"], "t"), {
    mode: "candidates",
    candidates: ["tailnet"],
  });
  assert.deepEqual(queryCompletion(["configure"], "--log-level=w"), {
    mode: "candidates",
    candidates: ["--log-level=warn"],
  });
  assert.deepEqual(queryCompletion(["providers", "add", "work", "--config-file"], "private path"), {
    mode: "files",
    candidates: [],
    optionPrefix: "",
  });
  assert.deepEqual(queryCompletion(["mcp", "configure", "work"], "--config-file=private path"), {
    mode: "files",
    candidates: [],
    optionPrefix: "--config-file=",
  });
  assert.deepEqual(queryCompletion(["providers", "configure", "work", "--prompt-env"], "SECRET"), {
    mode: "candidates",
    candidates: [],
  });
  assert.deepEqual(queryCompletion(["providers", "add", "work", "--config-file", "="], "private"), {
    mode: "files",
    candidates: [],
    optionPrefix: "",
  });
  assert.ok(
    !queryCompletion(["mcp", "configure", "work", "--yes"], "--").candidates.includes("--yes"),
  );
  assert.ok(
    queryCompletion(
      ["providers", "configure", "work", "--prompt-env", "FIRST_KEY"],
      "--",
    ).candidates.includes("--prompt-env"),
  );
});

await test("never evaluates or echoes unknown command text and bounds query input", () => {
  for (const word of [
    "$(synthetic-private-command)",
    "`synthetic-private-command`",
    ";synthetic-private-command",
    "unknown\nline",
  ])
    assert.deepEqual(queryCompletion([word], ""), { mode: "none", candidates: [] });
  assert.deepEqual(
    queryCompletion(
      Array.from({ length: 513 }, () => "ignored"),
      "",
    ),
    { mode: "none", candidates: [] },
  );
  assert.deepEqual(queryCompletion([], "x".repeat(65_537)), { mode: "none", candidates: [] });
  const output = renderCompletion([
    "--query",
    "1",
    "--current=synthetic-private-value",
    "--",
    "auth",
    "login",
    "--method",
  ]);
  assert.equal(output, "poracode-completion-v1\ncandidates\n");
  assert.ok(!output.includes("synthetic-private"));
});

await test("versions the query and public catalog separately from owner administration", () => {
  const catalog = JSON.parse(renderCompletion(["--json"]));
  assert.equal(catalog.formatVersion, CLI_COMPLETION_VERSION);
  assert.equal(catalog.command, "poracode");
  assert.deepEqual(catalog.shells, ["bash", "zsh", "fish", "powershell"]);
  assert.deepEqual(catalog.commands["mcp configure"].options["--yes"], { kind: "flag" });
  assert.equal(
    renderCompletion(["--query", "1", "--current=", "--", "--base-dir"]),
    "poracode-completion-v1\nfiles\n",
  );
  for (const version of ["0", "2", "99"])
    assert.throws(
      () => renderCompletion(["--query", version, "--current=", "--"]),
      /Unsupported completion query version/u,
    );
  for (const args of [
    [],
    ["unknown"],
    ["bash", "--json"],
    ["--query", "1", "--current="],
    ["--query", "1", "--", ""],
  ])
    assert.throws(() => renderCompletion(args), /Usage|requires/u);
});

for (const shell of ["bash", "zsh", "fish", "powershell"]) {
  await test(`generates ${shell} registration using the exact query version, without evaluating returned text`, () => {
    const script = renderCompletion([shell]);
    assert.ok(script.startsWith("# poracode-completion-v1\n"));
    assert.ok(script.includes("completion --query 1"));
    assert.ok(script.includes("--current="));
    assert.ok(!script.includes("@VERSION@"));
    assert.ok(!script.includes("Invoke-Expression"));
    assert.ok(!script.includes("eval "));
    assert.ok(!script.includes("SafeGetValue"));
    assert.ok(!script.includes("--tokens-raw"));
  });
}

await test("answers generation, query, help and JSON before any artifact, cache, owner or child operation", async () => {
  const options = {
    env: {
      PORACODE_SERVER_TARBALL: "deliberately-incomplete-private-override",
      PORACODE_RUNTIME_TARGET: "unsupported",
    },
    spawnImpl() {
      assert.fail("Completion must not spawn a server.");
    },
  };
  for (const args of [
    ["bash"],
    ["--json"],
    ["--help"],
    ["--query", "1", "--current=", "--", "--base-dir"],
  ]) {
    let text = "";
    assert.equal(
      await runCli(["completion", ...args], {
        ...options,
        stdout: {
          write: (chunk) => {
            text += chunk;
          },
        },
      }),
      0,
    );
    assert.equal(text, renderCompletion(args));
  }
  let text = "";
  assert.equal(
    await runCli(["--base-dir", "./unused profile", "completion", "bash"], {
      ...options,
      stdout: {
        write: (chunk) => {
          text += chunk;
        },
      },
    }),
    0,
  );
  assert.equal(text, renderCompletion(["bash"]));
  await assert.rejects(
    runCli(["completion", "--query", "2", "--current=", "--"], options),
    /Unsupported completion query version/u,
  );
});

await test(
  "Bash adapter preserves split scopes, profile paths and quoted filename candidates",
  { skip: process.platform === "win32" },
  (context) => {
    let major;
    try {
      major = Number(
        execFileSync("bash", ["--noprofile", "--norc", "-c", 'printf "%s" "${BASH_VERSINFO[0]}"'], {
          encoding: "utf8",
        }),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      context.skip("Bash is unavailable; native completion qualification remains pending.");
      return;
    }
    if (major < 4) {
      context.skip("The generated adapter requires Bash 4+; native qualification remains pending.");
      return;
    }
    const packageTestDirectory = dirname(fileURLToPath(import.meta.url));
    const scratch = resolve(packageTestDirectory, "..", "..", "..", "tmp");
    mkdirSync(scratch, { recursive: true });
    const root = mkdtempSync(join(scratch, "cli-completion-bash-"));
    try {
      const bin = join(root, "bin");
      mkdirSync(bin);
      const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
      const shim = join(bin, "poracode");
      writeFileSync(
        shim,
        `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(resolve(packageTestDirectory, "..", "bin", "poracode.mjs"))} "$@"\n`,
      );
      chmodSync(shim, 0o700);
      const script = join(root, "completion.bash");
      writeFileSync(script, renderCompletion(["bash"]));
      const candidate = join(root, "file sample.json");
      writeFileSync(candidate, "synthetic fixture");
      const run = (words, cursor) =>
        execFileSync(
          "bash",
          [
            "--noprofile",
            "--norc",
            "-c",
            [
              // This controlled adapter test mocks compopt outside Readline; actual
              // interactive completion/quoting qualification is a separate gate.
              "compopt() { :; }",
              'source "$FIXTURE_SCRIPT"',
              `COMP_WORDS=(${words})`,
              `COMP_CWORD=${cursor}`,
              "_poracode_complete",
              'printf "%s\\n" "${COMPREPLY[@]}"',
            ].join("\n"),
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              PATH: bin + delimiter + process.env.PATH,
              FIXTURE_SCRIPT: script,
              FIXTURE_ROOT: root,
              PORACODE_SERVER_TARBALL: "deliberately-incomplete-override",
              PORACODE_SERVER_TARBALL_SHA256: "",
            },
          },
        );
      assert.equal(run("poracode pairings create --scope session : r", 6), "read\n");
      assert.equal(run("poracode pairings create --scope = session : r", 7), "read\n");
      assert.equal(
        run('poracode --base-dir "$FIXTURE_ROOT/profile space" providers co', 4),
        "configure\n",
      );
      assert.equal(
        run('poracode mcp add saved --config-file "$FIXTURE_ROOT/file s"', 5),
        candidate + "\n",
      );
      assert.equal(
        run('poracode mcp add saved --config-file = "$FIXTURE_ROOT/file s"', 6),
        candidate + "\n",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
