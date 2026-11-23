import Foundation
import SwiftUI

/// Client for the `resolveLinkMetadata` procedure over `POST /api/git/call`,
/// plus inline math/task-list helpers and workspace `.html` file visual preview.
struct ResolvedLinkMetadata: Equatable, Sendable {
  let url: String
  let title: String?
  let description: String?
  let siteName: String?
}

actor RichChatLinkMetadataClient {
  static let shared = RichChatLinkMetadataClient()
  private var cache: [String: ResolvedLinkMetadata] = [:]

  func resolve(url: String, api: RemoteAPIClient) async -> ResolvedLinkMetadata? {
    if let cached = cache[url] { return cached }
    let payload: [String: Any] = [
      "procedure": "resolveLinkMetadata",
      "payload": ["url": url],
    ]
    guard let body = try? JSONSerialization.data(withJSONObject: payload),
      let data = try? await api.requestData(path: "/api/git/call", method: "POST", jsonBody: body),
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let result = root["result"] as? [String: Any]
    else { return nil }
    let metadata = ResolvedLinkMetadata(
      url: (result["url"] as? String) ?? url,
      title: result["title"] as? String,
      description: result["description"] as? String,
      siteName: result["siteName"] as? String
    )
    cache[url] = metadata
    return metadata
  }
}

enum RichChatMathFormatter {
  private static let replacements: [(String, String)] = [
    ("\\alpha", "α"), ("\\beta", "β"), ("\\gamma", "γ"), ("\\delta", "δ"),
    ("\\epsilon", "ε"), ("\\theta", "θ"), ("\\lambda", "λ"), ("\\mu", "μ"),
    ("\\pi", "π"), ("\\sigma", "σ"), ("\\omega", "ω"), ("\\Delta", "Δ"),
    ("\\Sigma", "Σ"), ("\\Omega", "Ω"), ("\\sum", "∑"), ("\\prod", "∏"),
    ("\\int", "∫"), ("\\sqrt", "√"), ("\\infty", "∞"), ("\\pm", "±"),
    ("\\times", "×"), ("\\cdot", "·"), ("\\div", "÷"), ("\\leq", "≤"),
    ("\\le", "≤"), ("\\geq", "≥"), ("\\ge", "≥"), ("\\neq", "≠"),
    ("\\ne", "≠"), ("\\approx", "≈"), ("\\to", "→"), ("\\rightarrow", "→"),
    ("\\leftarrow", "←"), ("\\Rightarrow", "⇒"), ("\\in", "∈"), ("\\notin", "∉"),
    ("^2", "²"), ("^3", "³"), ("^n", "ⁿ"),
  ]

  static func formatLatex(_ source: String) -> String {
    var out = source
    for (token, symbol) in replacements {
      out = out.replacingOccurrences(of: token, with: symbol)
    }
    return out
  }

  /// Extracts `(depth, taskChecked, cleanText)` for GFM task-list items and nested lists.
  static func parseListItem(_ raw: String) -> (depth: Int, checked: Bool?, text: String) {
    let leadingSpaces = raw.prefix(while: { $0 == " " }).count
    let depth = min(4, leadingSpaces / 2)
    let trimmed = String(raw.dropFirst(leadingSpaces))
    if trimmed.hasPrefix("[x] ") || trimmed.hasPrefix("[X] ") {
      return (depth, true, String(trimmed.dropFirst(4)))
    }
    if trimmed.hasPrefix("[ ] ") {
      return (depth, false, String(trimmed.dropFirst(4)))
    }
    return (depth, nil, trimmed)
  }

  /// Renders inline `$...$` expressions inside prose using readable Unicode math symbols.
  static func expandInlineMath(_ text: String) -> String {
    guard text.contains("$") else { return text }
    var result = ""
    var idx = text.startIndex
    while idx < text.endIndex {
      if text[idx] == "$" {
        let isBlock = text.index(after: idx) < text.endIndex && text[text.index(after: idx)] == "$"
        let openEnd = isBlock ? text.index(idx, offsetBy: 2) : text.index(after: idx)
        let delim = isBlock ? "$$" : "$"
        if let closeRange = text.range(of: delim, range: openEnd..<text.endIndex) {
          let expr = String(text[openEnd..<closeRange.lowerBound])
          result += formatLatex(expr.trimmingCharacters(in: .whitespaces))
          idx = closeRange.upperBound
          continue
        }
      }
      result.append(text[idx])
      idx = text.index(after: idx)
    }
    return result
  }
}

/// Inline sandboxed HTML preview card for `.html`/`.htm` workspace artifact links.
struct RichChatHtmlFilePreviewCard: View {
  let ref: RichChatFileRef
  @Environment(\.richChatFileDownloads) private var downloads
  @State private var loadedHTML: String?
  @State private var loading = false
  @State private var expanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        Image(systemName: "doc.richtext")
          .foregroundStyle(.secondary)
        Text(ref.fileName)
          .font(.footnote.weight(.medium))
          .lineLimit(1)
        Spacer()
        if loading {
          ProgressView().controlSize(.small)
        } else {
          Button(expanded ? "Hide" : "Preview") {
            if expanded {
              expanded = false
            } else if loadedHTML != nil {
              expanded = true
            } else {
              loadHTML()
            }
          }
          .font(.caption.weight(.medium))
          .buttonStyle(.bordered)
        }
      }
      if expanded, let html = loadedHTML {
        RichChatHtmlVisualView(
          visual: RichHtmlVisualPresentation(
            title: ref.fileName,
            html: html,
            version: RichInlineVisualParser.formatVersion,
            complete: true,
            limited: false
          )
        )
      }
    }
    .padding(10)
    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
  }

  private func loadHTML() {
    guard let downloads else { return }
    loading = true
    Task { @MainActor in
      defer { loading = false }
      guard let access = try? RichChatFilePolicy.resolve(ref.path, location: downloads.location) else { return }
      if let downloaded = await downloads.controller.fetchFileDownload(
        request: access,
        projectLocation: downloads.location,
        suggestedName: ref.fileName,
        resolveWorkspaceBasename: nil
      ) {
        defer { try? FileManager.default.removeItem(at: downloaded.directory) }
        if let text = try? String(contentsOf: downloaded.fileURL, encoding: .utf8) {
          loadedHTML = text
          expanded = true
        }
      }
    }
  }
}
