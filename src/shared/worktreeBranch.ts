/**
 * Random worktree branch-name generator (`poracode/<adjective>-<noun>-<8hex>`).
 * Lives in `src/shared` because both the renderer (BranchSelector "new branch"
 * action) and the supervisor (orchestrator `create_thread` MCP tool) mint
 * branches with the same scheme. Uses the Web Crypto global, available in both
 * the renderer and Node >= 20 without imports.
 */

const ADJECTIVES = [
  "awesome",
  "brave",
  "calm",
  "daring",
  "eager",
  "fair",
  "gentle",
  "happy",
  "keen",
  "lively",
  "merry",
  "noble",
  "polite",
  "quiet",
  "royal",
  "sharp",
  "swift",
  "tender",
  "vivid",
  "warm",
  "bold",
  "clear",
  "fresh",
  "grand",
  "bright",
  "clever",
  "cosmic",
  "crisp",
  "golden",
  "honest",
  "nimble",
  "quick",
  "silver",
  "steady",
  "sunny",
  "tidy",
];
const NOUNS = [
  "albatross",
  "badger",
  "condor",
  "dolphin",
  "eagle",
  "falcon",
  "gazelle",
  "heron",
  "ibis",
  "jaguar",
  "kestrel",
  "lemur",
  "marten",
  "newt",
  "otter",
  "puma",
  "quail",
  "raven",
  "stork",
  "tern",
  "viper",
  "wren",
  "yak",
  "zebra",
  "beacon",
  "comet",
  "ember",
  "harbor",
  "lantern",
  "meteor",
  "meadow",
  "pixel",
  "summit",
  "willow",
];

export function generateWorktreeBranch(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hash = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `poracode/${adj}-${noun}-${hash}`;
}
