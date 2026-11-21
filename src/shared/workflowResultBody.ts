import type { ResolvedToolBody } from "./contracts/resolvedToolBody";
import { workflowResultView, projectWorkflowResultRow } from "./workflowResult";

/** The PWA classifier supplies meaning; native clients only render these blocks. */
export function workflowResultBody(text: string): ResolvedToolBody {
  const view = workflowResultView(text);
  if (view.kind === "none") return { blocks: [] };
  if (view.kind === "text") return { blocks: [{ kind: "markdown", text: view.text }] };
  if (view.kind === "json")
    return { blocks: [{ kind: "code", text: view.json, language: "json" }] };
  return {
    blocks: [
      {
        kind: "disclosure-list",
        label: "results",
        countLabel: view.countLabel,
        rows: view.list.items.map((item) =>
          projectWorkflowResultRow(item, view.list.labelKey, view.list.detailKeys),
        ),
      },
    ],
  };
}
