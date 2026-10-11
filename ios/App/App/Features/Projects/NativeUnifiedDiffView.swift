import SwiftUI

enum NativeUnifiedDiffLineKind: Equatable {
  case metadata
  case hunk
  case addition
  case deletion
  case context
}

struct NativeUnifiedDiffLine: Identifiable, Equatable {
  let id: Int
  let text: String
  let kind: NativeUnifiedDiffLineKind
  let oldLineNumber: Int64?
  let newLineNumber: Int64?

  var annotationTarget: (lineNumber: Int64, side: RichDiffSide)? {
    switch kind {
    case .addition:
      newLineNumber.map { ($0, .new) }
    case .deletion:
      oldLineNumber.map { ($0, .old) }
    case .context:
      newLineNumber.map { ($0, .new) }
    case .metadata, .hunk:
      nil
    }
  }

  static func parse(_ diff: String) -> [NativeUnifiedDiffLine] {
    var oldLine: Int64?
    var newLine: Int64?
    return diff.split(separator: "\n", omittingEmptySubsequences: false)
      .enumerated()
      .map { offset, rawLine in
        let text = String(rawLine)
        let kind = classify(text)
        if kind == .hunk, let starts = hunkStarts(text) {
          oldLine = starts.old
          newLine = starts.new
        }

        let line = NativeUnifiedDiffLine(
          id: offset,
          text: text,
          kind: kind,
          oldLineNumber: kind == .deletion || kind == .context ? oldLine : nil,
          newLineNumber: kind == .addition || kind == .context ? newLine : nil
        )
        if kind == .deletion || kind == .context { oldLine? += 1 }
        if kind == .addition || kind == .context { newLine? += 1 }
        return line
      }
  }

  private static func classify(_ line: String) -> NativeUnifiedDiffLineKind {
    if line.hasPrefix("@@") { return .hunk }
    if line.hasPrefix("diff ") || line.hasPrefix("index ")
      || line.hasPrefix("---") || line.hasPrefix("+++")
      || line.hasPrefix("\\ No newline")
    {
      return .metadata
    }
    if line.hasPrefix("+") { return .addition }
    if line.hasPrefix("-") { return .deletion }
    return .context
  }

  private static func hunkStarts(_ line: String) -> (old: Int64, new: Int64)? {
    let fields = line.split(separator: " ")
    guard fields.count >= 3,
      let old = start(from: fields[1], prefix: "-"),
      let new = start(from: fields[2], prefix: "+")
    else { return nil }
    return (old, new)
  }

  private static func start(from field: Substring, prefix: Character) -> Int64? {
    guard field.first == prefix else { return nil }
    return Int64(field.dropFirst().split(separator: ",", maxSplits: 1)[0])
  }
}

struct NativeDiffAnnotationContext {
  let path: String
  let staged: Bool
  let enqueue: (RichPromptSegment) -> Void
}

private struct NativeDiffAnnotationTarget: Identifiable {
  let path: String
  let lineNumber: Int64
  let side: RichDiffSide
  let staged: Bool
  let enqueue: (RichPromptSegment) -> Void

  var id: String { "\(path):\(side.rawValue):\(lineNumber):\(staged)" }
}

struct NativeUnifiedDiffView: View {
  @Environment(\.colorScheme) private var colorScheme

  let diff: String
  var filePath: String? = nil
  var annotationContext: NativeDiffAnnotationContext? = nil

  @State private var annotationTarget: NativeDiffAnnotationTarget?

  private var lines: [NativeUnifiedDiffLine] {
    NativeUnifiedDiffLine.parse(diff)
  }

  private var syntaxLanguage: String? {
    NativeDiffSyntaxLanguage.resolve(path: filePath ?? inferredFilePath)
  }

  var body: some View {
    ScrollView([.horizontal, .vertical]) {
      LazyVStack(alignment: .leading, spacing: 0) {
        ForEach(lines) { line in
          contextualizedLine(line)
        }
      }
      .padding(.vertical, 8)
      .textSelection(.enabled)
    }
    .defaultScrollAnchor(.topLeading)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .sheet(item: $annotationTarget) { target in
      NativeDiffAnnotationEditor(target: target)
    }
  }

  @ViewBuilder
  private func contextualizedLine(_ line: NativeUnifiedDiffLine) -> some View {
    if let annotationContext, let target = line.annotationTarget {
      lineContent(line)
        .contextMenu {
          Button(ProjectWorkspaceStrings.reviewComment, systemImage: "text.bubble") {
            selectAnnotation(
              context: annotationContext,
              lineNumber: target.lineNumber,
              side: target.side
            )
          }
        }
        .accessibilityAction(named: ProjectWorkspaceStrings.reviewComment) {
          selectAnnotation(
            context: annotationContext,
            lineNumber: target.lineNumber,
            side: target.side
          )
        }
        .accessibilityValue("\(annotationContext.path):\(target.lineNumber)")
    } else {
      lineContent(line)
    }
  }

  private func lineContent(_ line: NativeUnifiedDiffLine) -> some View {
    HStack(spacing: 6) {
      Text(lineNumber(line))
        .foregroundStyle(.tertiary)
        .frame(width: 34, alignment: .trailing)
      highlightedText(line)
    }
    .font(.caption.monospaced())
    .padding(.horizontal, 8)
    .padding(.vertical, 3)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(background(line.kind))
    .contentShape(Rectangle())
    .fixedSize(horizontal: true, vertical: false)
  }

  private func selectAnnotation(
    context: NativeDiffAnnotationContext,
    lineNumber: Int64,
    side: RichDiffSide
  ) {
    annotationTarget = NativeDiffAnnotationTarget(
      path: context.path,
      lineNumber: lineNumber,
      side: side,
      staged: context.staged,
      enqueue: context.enqueue
    )
  }

  private var inferredFilePath: String? {
    lines.lazy.compactMap { line -> String? in
      guard line.text.hasPrefix("+++ ") else { return nil }
      let path = String(line.text.dropFirst(4))
      return path.hasPrefix("b/") ? String(path.dropFirst(2)) : path
    }.first
  }

  private func highlightedText(_ line: NativeUnifiedDiffLine) -> Text {
    switch line.kind {
    case .addition:
      changeText(line, marker: "+", color: .green)
    case .deletion:
      changeText(line, marker: "−", color: .red)
    case .context:
      Text(highlightedSource(codeContent(line.text)))
    case .metadata:
      Text(line.text.isEmpty ? " " : line.text)
        .foregroundColor(.secondary)
    case .hunk:
      Text(line.text)
        .foregroundColor(.accentColor)
    }
  }

  private func changeText(_ line: NativeUnifiedDiffLine, marker: String, color: Color) -> Text {
    Text(marker).foregroundColor(color) + Text(highlightedSource(codeContent(line.text)))
  }

  private func highlightedSource(_ source: String) -> AttributedString {
    RichChatSyntaxHighlighter.attributed(
      source: source.isEmpty ? " " : source,
      language: syntaxLanguage,
      colorScheme: colorScheme
    )
  }

  private func codeContent(_ text: String) -> String {
    guard let first = text.first, first == "+" || first == "-" || first == " " else {
      return text
    }
    return String(text.dropFirst())
  }

  private func lineNumber(_ line: NativeUnifiedDiffLine) -> String {
    line.newLineNumber.map { String($0) } ?? line.oldLineNumber.map { String($0) } ?? ""
  }

  private func background(_ kind: NativeUnifiedDiffLineKind) -> Color {
    switch kind {
    case .hunk: Color.accentColor.opacity(0.1)
    case .addition: Color.green.opacity(0.09)
    case .deletion: Color.red.opacity(0.09)
    case .metadata, .context: .clear
    }
  }
}

private enum NativeDiffSyntaxLanguage {
  static func resolve(path: String?) -> String? {
    guard let path else { return nil }
    return switch URL(fileURLWithPath: path).pathExtension.lowercased() {
    case "swift": "swift"
    case "js", "mjs", "cjs": "javascript"
    case "jsx": "jsx"
    case "ts", "mts", "cts": "typescript"
    case "tsx": "tsx"
    case "json", "jsonc": "json"
    case "py": "python"
    case "sh", "bash", "zsh": "shell"
    case "md", "mdx", "markdown": "markdown"
    default: nil
    }
  }
}

private struct NativeDiffAnnotationEditor: View {
  @Environment(\.dismiss) private var dismiss
  let target: NativeDiffAnnotationTarget
  @State private var commentText = ""

  var body: some View {
    NavigationStack {
      Form {
        Section {
          ZStack(alignment: .topLeading) {
            if commentText.isEmpty {
              Text(ProjectWorkspaceStrings.leaveReviewComment)
                .foregroundStyle(.tertiary)
                .padding(.horizontal, 5)
                .padding(.vertical, 8)
            }
            TextEditor(text: $commentText)
              .frame(minHeight: 130)
              .accessibilityLabel(ProjectWorkspaceStrings.reviewComment)
          }
        } footer: {
          Text("\(target.path):\(target.lineNumber)")
        }
      }
      .navigationTitle(ProjectWorkspaceStrings.reviewComment)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(ProjectWorkspaceStrings.addReviewComment) { submit() }
            .disabled(commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
      }
    }
    .presentationDetents([.medium])
  }

  private func submit() {
    let trimmed = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    target.enqueue(
      .diffComment(
        path: target.path,
        lineNumber: target.lineNumber,
        side: target.side,
        staged: target.staged,
        body: trimmed
      )
    )
    dismiss()
  }
}
