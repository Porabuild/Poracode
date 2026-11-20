import SwiftUI

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

  var filePath: String? = nil
  var annotationContext: NativeDiffAnnotationContext? = nil

  @State private var annotationTarget: NativeDiffAnnotationTarget?

  private let files: [NativeUnifiedDiffFile]

  init(diff: String, filePath: String? = nil, annotationContext: NativeDiffAnnotationContext? = nil) {
    self.init(files: NativeUnifiedDiffFile.parse(diff), filePath: filePath, annotationContext: annotationContext)
  }

  init(files parsed: [NativeUnifiedDiffFile], filePath: String? = nil, annotationContext: NativeDiffAnnotationContext? = nil) {
    self.filePath = filePath
    self.annotationContext = annotationContext
    files = parsed.count > 1 ? parsed.map { file in
      guard file.path != nil else { return file }
      return NativeUnifiedDiffFile(id: file.id, path: file.path, lines: file.lines.filter { !$0.isStructuralFileHeader })
    } : parsed
  }

  var lineCount: Int {
    files.reduce(0) { $0 + $1.lines.count + (files.count > 1 && $1.path != nil ? 1 : 0) }
  }

  var body: some View {
    ScrollView([.horizontal, .vertical]) {
      LazyVStack(alignment: .leading, spacing: 0) {
        ForEach(files) { file in
          let path = files.count == 1 ? filePath ?? file.path : file.path
          let language = NativeDiffSyntaxLanguage.resolve(path: path)
          let context = annotationContext.flatMap { context in
            files.count == 1 || file.path == context.path ? context : nil
          }
          if files.count > 1, let path {
            Text(path)
              .font(.caption.weight(.semibold))
              .lineLimit(1)
              .fixedSize(horizontal: true, vertical: false)
              .padding(.horizontal, 8)
              .padding(.vertical, 6)
              .accessibilityAddTraits(.isHeader)
              .accessibilityIdentifier("native-e2e.diff-file.\(file.id)")
          }
          ForEach(file.lines) { line in
            contextualizedLine(line, language: language, annotationContext: context)
          }
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
  private func contextualizedLine(
    _ line: NativeUnifiedDiffLine, language: String?, annotationContext: NativeDiffAnnotationContext?
  ) -> some View {
    if let annotationContext, let target = line.annotationTarget {
      lineContent(line, language: language)
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
      lineContent(line, language: language)
    }
  }

  private func lineContent(_ line: NativeUnifiedDiffLine, language: String?) -> some View {
    HStack(spacing: 6) {
      Text(lineNumber(line))
        .foregroundStyle(.tertiary)
        .frame(width: 34, alignment: .trailing)
      highlightedText(line, language: language)
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

  private func highlightedText(_ line: NativeUnifiedDiffLine, language: String?) -> Text {
    switch line.kind {
    case .addition:
      changeText(line, marker: "+", color: .green, language: language)
    case .deletion:
      changeText(line, marker: "−", color: .red, language: language)
    case .context:
      Text(highlightedSource(codeContent(line.text), language: language))
    case .metadata:
      Text(line.text.isEmpty ? " " : line.text)
        .foregroundColor(.secondary)
    case .hunk:
      Text(line.text)
        .foregroundColor(.primary)
    }
  }

  private func changeText(_ line: NativeUnifiedDiffLine, marker: String, color: Color, language: String?) -> Text {
    Text(marker).foregroundColor(color) + Text(highlightedSource(codeContent(line.text), language: language))
  }

  private func highlightedSource(_ source: String, language: String?) -> AttributedString {
    RichChatSyntaxHighlighter.attributed(
      source: source.isEmpty ? " " : source,
      language: language,
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
    case .hunk: Color.primary.opacity(0.1)
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
