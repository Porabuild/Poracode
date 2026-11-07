export function fallbackChatLinkLabel(href: string): string {
  try {
    const url = new URL(href);
    const segments = url.pathname.split("/").filter(Boolean).map(decodeSegment);
    const host = url.hostname.toLowerCase();

    if (host.endsWith(".atlassian.net")) {
      const ticket = /\/browse\/([A-Z][A-Z0-9]+-\d+)/iu.exec(url.pathname)?.[1];
      if (ticket) return ticket;
    }

    if (host === "github.com") {
      const [owner, repo, kind, number] = segments;
      if (owner && repo && (kind === "pull" || kind === "issues") && /^\d+$/u.test(number ?? "")) {
        return `#${number} · ${owner}/${repo}`;
      }
      if (owner && repo && kind === "commit" && /^[\da-f]{7,40}$/iu.test(number ?? "")) {
        return `${owner}/${repo}@${number!.slice(0, 7)}`;
      }
      if (owner && repo) return `${owner}/${repo}`;
    }

    if (host === "gitlab.com") {
      const index = segments.indexOf("merge_requests");
      const number = segments[index + 1];
      if (index > 0 && /^\d+$/u.test(number ?? "")) {
        return `!${number} · ${segments.slice(0, index - 1).join("/")}`;
      }
    }

    if (host === "linear.app") {
      const index = segments.indexOf("issue");
      const issue = segments[index + 1];
      if (issue) return issue;
    }

    const last = segments.at(-1);
    return last ? humanizeSegment(last) : url.host;
  } catch {
    return href;
  }
}

export function resolvedChatLinkLabel(title: string | null, href: string): string {
  const cleaned = title?.replace(/\s+/gu, " ").trim();
  const githubItem = parseGitHubWorkItem(href);
  if (cleaned && githubItem) {
    const { owner, repo, number, kind } = githubItem;
    const suffix = ` · ${kind === "pull" ? "Pull Request" : "Issue"} #${number} · ${owner}/${repo}`;
    let titleRoot = cleaned.endsWith(suffix) ? cleaned.slice(0, -suffix.length) : cleaned;
    titleRoot = titleRoot.replace(/\s+by\s+[^·]+$/u, "").trim();
    if (titleRoot) return `#${number} · ${titleRoot}`;
  }
  return cleaned && cleaned.length >= 5 ? cleaned : fallbackChatLinkLabel(href);
}

function parseGitHubWorkItem(href: string) {
  try {
    const url = new URL(href);
    if (url.hostname.toLowerCase() !== "github.com") return null;
    const [owner, repo, kind, number] = url.pathname.split("/").filter(Boolean).map(decodeSegment);
    if (!owner || !repo || (kind !== "pull" && kind !== "issues") || !/^\d+$/u.test(number ?? "")) {
      return null;
    }
    return { owner, repo, kind, number: number! };
  } catch {
    return null;
  }
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function humanizeSegment(segment: string): string {
  if (/^[A-Z][A-Z0-9]+-\d+$/u.test(segment)) return segment;
  const withoutExtension = segment.replace(/\.[a-z\d]+$/iu, "");
  const words = withoutExtension.replace(/[-_]+/gu, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : segment;
}
