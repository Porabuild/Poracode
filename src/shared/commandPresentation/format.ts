import type {
  CommandIntent,
  CommandIntentDisplay,
  CommandTitle,
  CommandTitleLabels,
} from "./model";

export function formatCommandViewPrefix(label: string, lines?: string): string {
  return lines ? `${label} ${lines.replace(/-/g, ":")}: ` : `${label}: `;
}

function formatTitle(title: CommandTitle, labels: CommandTitleLabels): string {
  switch (title.kind) {
    case "label":
      return title.text === undefined
        ? labels.label(title.label)
        : `${labels.label(title.label)}: ${title.text}`;
    case "view":
      return formatCommandViewPrefix(labels.label("view"), title.lines) + title.text;
    case "search": {
      const text = title.scope
        ? labels.searchIn(title.query, title.scope)
        : `${labels.label("search")}: "${title.query}"`;
      return title.additionalPatterns ? `${text} +${title.additionalPatterns}` : text;
    }
  }
}

/** Localizes presentation without re-parsing a shell or provider payload. */
export function formatCommandIntent(
  intent: CommandIntent,
  labels: CommandTitleLabels,
): CommandIntentDisplay {
  const text = formatTitle(intent.title, labels);
  return {
    title: intent.additionalActions ? `${text} +${intent.additionalActions}` : text,
    kind: intent.kind,
    ...(intent.title.kind === "view" && intent.path
      ? {
          parts: {
            prefix: formatCommandViewPrefix(labels.label("view"), intent.title.lines),
            ...intent.path,
          },
        }
      : {}),
  };
}
