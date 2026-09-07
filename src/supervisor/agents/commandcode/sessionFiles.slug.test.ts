import { describe, expect, it } from "vitest";
import { sanitizeCommandCodeCwd, sanitizeCommandCodeMcpCwd } from "./sessionFiles";

// Compatibility contract for the `cwd → projects/<dir>` mapping.
//
// `sanitizeCommandCodeCwd` must byte-match the Command Code CLI (v1.4.1)'s own
// `@sindresorhus/slugify@2.2.1` slug of the cwd, otherwise Poracode looks for
// session transcripts in a directory the CLI never writes to. Every expected
// value below is the literal 2.2.1 output for its input — do NOT regenerate
// them from a newer slugify without also confirming the CLI moved in lockstep.
// All fixtures use paths that exist on no machine, so `realpathSync` falls
// back to the raw path and the mapping stays deterministic across OSes.
const cases: Array<[cwd: string, slug: string]> = [
  // Fixtures already asserted in commandcode.test.ts.
  ["/Users/test-fixture-xyz/work/poracode", "users-test-fixture-xyz-work-poracode"],
  [
    "/Users/test-fixture-xyz/.poracode/worktrees/lc-bbea/lc-golden-pixel-8f39b4b5",
    "users-test-fixture-xyz-poracode-worktrees-lc-bbea-lc-golden-pixel-8f39b4b5",
  ],
  ["/private/var/T/cc-dbg-ca.ppww", "private-var-t-cc-dbg-ca-ppww"],
  ["C:\\Users\\demo\\AppData\\Local\\CommandCode", "c-users-demo-app-data-local-command-code"],
  // Doc-comment examples in sessionFiles.ts.
  ["C:\\Users\\me\\AppData\\Local\\cc", "c-users-me-app-data-local-cc"],
  // Windows drive paths (backslashes, spaces, trailing separators, case).
  ["C:\\Users\\John Doe\\My Projects\\Poracode", "c-users-john-doe-my-projects-poracode"],
  [
    "E:\\work\\lightcode\\.poracode\\worktrees\\lc-test-slug-probe-xyz",
    "e-work-lightcode-poracode-worktrees-lc-test-slug-probe-xyz",
  ],
  ["D:\\a\\b\\c\\", "d-a-b-c"],
  ["C:\\Users\\demo\\AppData\\", "c-users-demo-app-data"],
  ["c:\\users\\demo\\lowercase-drive", "c-users-demo-lowercase-drive"],
  ["c:/users/demo/forward-slash-windows", "c-users-demo-forward-slash-windows"],
  ["C:\\PROGRA~1\\APP", "c-progra-1-app"],
  ["C:\\Users\\demo\\MyHTMLParser", "c-users-demo-my-html-parser"],
  ["C:\\USERS\\DEMO\\APP", "c-users-demo-app"],
  ["C:\\a1\\b2\\c3", "c-a1-b2-c3"],
  ["C:\\Users\\démö\\Projéct", "c-users-demoe-project"],
  // UNC paths.
  ["\\\\SERVER\\share\\project", "server-share-project"],
  ["\\\\wsl$\\Ubuntu\\home\\user\\proj", "wsl-ubuntu-home-user-proj"],
  ["//server/share/dir", "server-share-dir"],
  // WSL /mnt paths.
  ["/mnt/c/Users/demo/project", "mnt-c-users-demo-project"],
  ["/mnt/d/work/light code", "mnt-d-work-light-code"],
  // Dots, underscores, hyphens, consecutive/trailing separators.
  ["/Users/test-fixture-xyz/a.b/c__d/e--f", "users-test-fixture-xyz-a-b-c-d-e-f"],
  ["/Users/test-fixture-xyz/foo/.../bar", "users-test-fixture-xyz-foo-bar"],
  ["/Users/test-fixture-xyz/x/y.tar.gz", "users-test-fixture-xyz-x-y-tar-gz"],
  ["/Users/test-fixture-xyz/.config/.commandcode", "users-test-fixture-xyz-config-commandcode"],
  ["/Users/test-fixture-xyz/a//b///c", "users-test-fixture-xyz-a-b-c"],
  ["C:\\Users\\\\demo", "c-users-demo"],
  ["/Users/test-fixture-xyz/a/b/", "users-test-fixture-xyz-a-b"],
  ["my_app.v2-fix", "my-app-v2-fix"],
  ["--demo--", "demo"],
  ["My Project", "my-project"],
  ["Hello, World! (v2)", "hello-world-v2"],
  // Uppercase, decamelize, digits.
  ["/Users/TEST-FIXTURE-XYZ/UPPER/Proj", "users-test-fixture-xyz-upper-proj"],
  ["/Users/test-fixture-xyz/APIResponse/v2", "users-test-fixture-xyz-api-response-v2"],
  ["/Users/test-fixture-xyz/proj123/v2", "users-test-fixture-xyz-proj123-v2"],
  // Unicode: Cyrillic, CJK (dropped), accented Latin, German, macrons, emoji.
  ["/Users/test-fixture-xyz/пользователь/проект", "users-test-fixture-xyz-polzovatel-proekt"],
  ["/Users/test-fixture-xyz/用户/项目", "users-test-fixture-xyz"],
  ["/Users/test-fixture-xyz/café/naïve", "users-test-fixture-xyz-cafe-naive"],
  ["/Users/test-fixture-xyz/Müller/straße", "users-test-fixture-xyz-mueller-strasse"],
  ["/Users/test-fixture-xyz/ōsaka/tōkyō", "users-test-fixture-xyz-osaka-tokyo"],
  ["/Users/test-fixture-xyz/🎉party/🚀rocket", "users-test-fixture-xyz-party-rocket"],
  // Version-sensitive transliterations: slugify 3.0.0 (transliterate 2.x)
  // renders these differently (Œ→OE, Ə→a, 𝓀→k, 𝕆→O, ⓒ/ⓓ shift). Pinned to the
  // 2.2.1 bytes the v1.4.1 CLI writes; see the slug-diff probe under .tmp/.
  ["/Users/test-fixture-xyz/Œuvre/æther", "users-test-fixture-xyz-uvre-aether"],
  ["/Users/test-fixture-xyz/Əli/ǝsgər", "users-test-fixture-xyz-li-sg-r"],
  ["/Users/test-fixture-xyz/𝓀test", "users-test-fixture-xyz-htest"],
  ["/Users/test-fixture-xyz/𝕆test", "users-test-fixture-xyz-ntest"],
  ["/Users/test-fixture-xyz/ⓒdir/ⓓdir", "users-test-fixture-xyz-b-dir-c-dir"],
  // Apostrophes: 2.2.1 folds straight quotes into contractions but treats the
  // curly U+2019 as a separator; 3.0.0 folds both.
  ["/Users/test-fixture-xyz/o’brien/don’t", "users-test-fixture-xyz-o-brien-don-t"],
  ["it's a test", "its-a-test"],
  ["don’t stop", "don-t-stop"],
  // Punctuation, dashes, ampersands.
  ["/Users/test-fixture-xyz/R&D/A & B", "users-test-fixture-xyz-r-and-d-a-and-b"],
  ["/Users/test-fixture-xyz/My Project (v2)/dir [1]", "users-test-fixture-xyz-my-project-v2-dir-1"],
  ["/Users/test-fixture-xyz/a–b/c—d", "users-test-fixture-xyz-a-b-c-d"],
  // Very long paths.
  [`/${"x".repeat(200)}`, "x".repeat(200)],
  [
    `/Users/test-fixture-xyz/deep/${"a/".repeat(30)}leaf`,
    `users-test-fixture-xyz-deep-${"a-".repeat(30)}leaf`,
  ],
  [`C:\\${"LongFolderName\\".repeat(10)}`, `c-${"long-folder-name-".repeat(10).slice(0, -1)}`],
  // Empty cwd falls back to "root" for sessions but stays empty for MCP.
  ["", "root"],
];

describe("sanitizeCommandCodeCwd slug compatibility (2.2.1 contract)", () => {
  for (const [cwd, expected] of cases) {
    it(`maps ${cwd || "(empty)"} to ${expected}`, () => {
      expect(sanitizeCommandCodeCwd(cwd)).toBe(expected);
    });
  }

  it("keeps the MCP empty-slug fallback distinct from the session fallback", () => {
    expect(sanitizeCommandCodeMcpCwd("")).toBe("");
  });
});
