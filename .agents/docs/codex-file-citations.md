# Codex artifact file citations

## Provenance (investigated 2026-09-09)

The reported raw `:codex-file-citation{path="..." purpose="output"}` is already
present in the saved assistant response, before Poracode renders it. The affected
session identifies `originator: poracode`, Codex CLI `0.149.0`, and `gpt-6-astra`.
The session's tool outputs show the model reading artifact skill instructions
that request this exact syntax before the first affected answer.

The installed OpenAI primary runtime artifact skills, version `26.905.11957`,
contain the concrete format contract:

- `pdf/skills/pdf/SKILL.md`, "Final response citations": requires inline file
  directives with `purpose="source"` or `purpose="output"`.
- `documents/skills/documents/SKILL.md`, "Final response citations": the same
  directive, with optional `artifact_kind="document"` and `page_number`.
- `spreadsheets/skills/spreadsheets/SKILL.md`, "Final response citations": the same
  directive, with optional `artifact_kind="workbook"`, `sheet`, `range`, and object
  locators.
- `presentations/skills/presentations/SKILL.md`: recommends the directive for the
  final deck **if the app supports it**, otherwise the app's normal file link.

This establishes a skill/client compatibility gap in this session. It does not
establish that Astra uniquely emits this format or when the skills first adopted
it. These installed skill instructions are implementation evidence, not a public
app-server protocol specification.

## Public documentation

Fetched official documentation:

- [Codex App Server](https://developers.openai.com/codex/app-server):
  `agentMessage` contains accumulated `text`; `item/agentMessage/delta` appends
  text. The documented item does not define an artifact citation annotation
  payload. Poracode's mapper preserves that text in canonical messages.
- [Citation Formatting](https://developers.openai.com/api/docs/guides/citation-formatting):
  clients must extract and render model citation syntax. Its examples cover the
  separate `\ue200cite…\ue201` family, not this local-file directive.
- [Work with files](https://learn.chatgpt.com/docs/artifacts-viewer): documents
  generated-file previews in the desktop app and surface-specific file handling;
  it does not specify the directive grammar.

No definition of `codex-file-citation` was found in the fetched combined public
ChatGPT/Codex docs. Do not claim an undocumented schema or model regression.

## Rendering contract

The Codex manifest supplies `formatTranscriptMarkdown`. It recognizes complete
directives with an absolute filesystem `path` and quoted attributes. Attribute
order and source/output purpose do not affect file opening. Other attributes are
accepted but currently open the file without page, slide, or spreadsheet-cell
navigation; the raw transcript retains their original values.

The formatter emits the existing internal Markdown file-link representation.
The shared `markdownPathRefs` module owns its encoding/decoding, and both the
full Markdown renderer and lazy plain-text fallback use that representation.
Explicit references bypass heuristic file-extension/root-name inference. This
matters for `.pptx`/`.pdf` and Windows paths containing spaces or parentheses:
the previous generic autolinker picked up only the path suffix and classified
the artifact as a folder.

Literal code examples and escaped directives are preserved. Incomplete streaming
tails and malformed directives stay visible until a complete valid directive
arrives; parsing must not silently discard text. External URL schemes are not
accepted as filesystem paths. Paths are encoded before Markdown parsing, so
punctuation and percent sequences cannot truncate or alter the link destination.

## Compatibility audit

This changes display interpretation only. Canonical event writers, saved
transcripts, SQLite schemas, renderer persisted stores, IPC payloads, and deployed
helpers retain their existing shapes. Old transcripts remain valid and render
through the newly declared hook immediately; no migration or cache/version bump
is needed. Existing internal link prefixes remain readable. Regression tests
start from the previously stored response shape and exercise both render paths,
actual file-open callbacks, literal examples, and streaming completion.
