import { snippetAround } from "./unifiedPatch";

/**
 * Quoted material for "Add to agent": the comment and the diff around its line,
 * serialized as one JSON object so none of it can read as an instruction.
 */
export function commentAgentContext(input: {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  text: string;
  patch: string | undefined;
}): string {
  const snippet = input.patch ? snippetAround(input.patch, input.side, input.line) : "";
  return JSON.stringify(
    {
      file: input.path,
      line: input.line,
      side: input.side === "LEFT" ? "old" : "new",
      comment: input.text,
      ...(snippet ? { diff: snippet } : {}),
    },
    null,
    2,
  );
}
