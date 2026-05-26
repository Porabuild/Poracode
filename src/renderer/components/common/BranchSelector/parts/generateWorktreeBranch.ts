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
];

export function generateWorktreeBranch(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hash = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `lightcode/${adj}-${noun}-${hash}`;
}
