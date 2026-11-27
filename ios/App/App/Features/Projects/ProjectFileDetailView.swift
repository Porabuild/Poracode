import SwiftUI

struct ProjectFileDetailView: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeEmbeddedInInspector) private var embeddedInInspector
  @Environment(\.richChatInspectorVisible) private var inspectorVisible
  @Bindable var controller: ProjectFileWorkspaceController
  @Binding var editor: ProjectWorkspaceEditorState

  let selectedEntry: ProjectWorkspaceEntry?
  var selectedLine: Int? = nil
  var showsEmptyTitle = true
  let access: ProjectWorkspaceAccessState
  let onDiscard: () -> Void
  let onSave: () -> Void
  let onReload: () -> Void

  var body: some View {
    Group {
      if let selectedEntry {
        selectedFile(selectedEntry)
      } else {
        ContentUnavailableView {
          Label(ProjectWorkspaceStrings.selectFile, systemImage: "doc.text.magnifyingglass")
        } description: {
          Text(ProjectWorkspaceStrings.selectFileDescription)
        }
      }
    }
    .navigationTitle(selectedEntry?.name ?? (showsEmptyTitle ? ProjectWorkspaceStrings.files : ""))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar { editorToolbar }
    .nativeCommands(identity: selectedEntry?.path ?? "files", context: [
      "editorSurfaceOpen": .bool(isSurfaceActive && selectedEntry != nil),
      "markdownActive": .bool(isSurfaceActive && canPreviewMarkdown),
    ], actions: [
      "editor.save": .init(enabled: isSurfaceActive && canSave) { _ in onSave() },
      "editor.toggle-markdown-preview": .init(enabled: isSurfaceActive && canPreviewMarkdown) { _ in editor.showsMarkdownPreview.toggle() },
    ])
    .poracodeTopBar {
      if controller.fileWritePath == selectedEntry?.path,
        case .failed(let failure) = controller.fileWrite.loadState,
        ProjectWorkspaceSaveRecovery.classify(failure) == .none
      {
        saveFailure(failure)
      }
    }
  }

  @ViewBuilder
  private func selectedFile(_ entry: ProjectWorkspaceEntry) -> some View {
    switch controller.fileRead.loadState {
    case .idle, .loading:
      ProjectWorkspaceLoadingView()
    case .failed(let failure):
      ProjectWorkspaceFailureView(failure: failure, retry: onReload)
    case .loaded, .empty:
      if let result = controller.fileRead.value, result.path == entry.path {
        fileContent(result)
      } else {
        ProjectWorkspaceLoadingView()
      }
    }
  }

  @ViewBuilder
  private func fileContent(_ result: ProjectFileReadResult) -> some View {
    switch result.status {
    case .ready:
      if isMarkdown, editor.showsMarkdownPreview {
        markdownPreview(editor.previewContent(for: result))
      } else if access.permitsWrite {
        editableContent
      } else if let selectedLine {
        ProjectLinkedTextEditor(text: .constant(result.content ?? ""), line: selectedLine, isEditable: false)
      } else {
        readOnlyContent(result.content ?? "")
      }
    case .binary:
      unavailableFile(
        ProjectWorkspaceStrings.binaryFile,
        description: ProjectWorkspaceStrings.binaryFileDescription,
        systemImage: "doc.zipper"
      )
    case .tooLarge:
      unavailableFile(
        ProjectWorkspaceStrings.largeFile,
        description: ProjectWorkspaceStrings.largeFileDescription,
        systemImage: "doc.badge.ellipsis"
      )
    case .unsupported:
      unavailableFile(
        ProjectWorkspaceStrings.unsupportedFile,
        description: ProjectWorkspaceStrings.unsupportedFileDescription,
        systemImage: "doc.questionmark"
      )
    }
  }

  private var editableContent: some View {
    ProjectLinkedTextEditor(text: $editor.draft, line: selectedLine, isEditable: true)
      .padding(.horizontal, 8)
  }

  private func readOnlyContent(_ content: String) -> some View {
    ScrollView([.horizontal, .vertical]) {
      Text(content)
        .font(.system(.body, design: .monospaced))
        .textSelection(.enabled)
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityLabel(ProjectWorkspaceStrings.fileContentsLabel)
        .padding()
    }
  }

  private func markdownPreview(_ content: String) -> some View {
    ScrollView {
      Text(markdown(content))
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
        .padding()
        .accessibilityLabel(ProjectWorkspaceStrings.fileContentsLabel)
    }
  }

  private func markdown(_ content: String) -> AttributedString {
    (try? AttributedString(
      markdown: content,
      options: .init(interpretedSyntax: .full)
    )) ?? AttributedString(content)
  }

  private func unavailableFile(
    _ title: String,
    description: String,
    systemImage: String
  ) -> some View {
    ContentUnavailableView {
      Label(title, systemImage: systemImage)
    } description: {
      Text(description)
    }
  }

  @ToolbarContentBuilder
  private var editorToolbar: some ToolbarContent {
    if selectedEntry != nil {
      ToolbarItemGroup(placement: .topBarTrailing) {
        if access.permitsWrite {
          let title = isSavingSelectedFile ? ProjectWorkspaceStrings.saving : ProjectWorkspaceStrings.save
          editorToolbarButton(
            title,
            systemImage: isSavingSelectedFile ? "hourglass" : "square.and.arrow.down",
            isEnabled: canSave,
            action: onSave
          )
          .accessibilityLabel(title)
          .accessibilityIdentifier("native-e2e.project-file.save")
        }
        if canPreviewMarkdown {
          editorToolbarButton(
            editor.showsMarkdownPreview ? ProjectWorkspaceStrings.editorLabel : ProjectWorkspaceStrings.fileContentsLabel,
            systemImage: editor.showsMarkdownPreview ? "chevron.left.forwardslash.chevron.right" : "eye"
          ) {
            editor.showsMarkdownPreview.toggle()
          }
          .accessibilityIdentifier("native-e2e.project-file.preview")
        }
        if access.permitsWrite && editor.isDirty {
          editorToolbarButton(ProjectWorkspaceStrings.discard, systemImage: "arrow.uturn.backward",
            isEnabled: !isSavingSelectedFile, action: onDiscard)
          .accessibilityIdentifier("native-e2e.project-file.discard")
        }
      }
    }
  }

  private func editorToolbarButton(
    _ title: String, systemImage: String, isEnabled: Bool = true, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Label {
        Text(title)
      } icon: {
        Image.poracodeToolbarSymbol(systemImage, colorScheme: colorScheme, isEnabled: isEnabled)
      }
    }
    .disabled(!isEnabled)
  }

  private var isMarkdown: Bool {
    guard let name = selectedEntry?.name.lowercased() else { return false }
    return name.hasSuffix(".md") || name.hasSuffix(".mdx") || name.hasSuffix(".markdown")
      || name.hasSuffix(".mdown")
  }

  private var canPreviewMarkdown: Bool {
    isMarkdown && controller.fileRead.value?.path == selectedEntry?.path && controller.fileRead.value?.status == .ready
  }

  private var canSave: Bool {
    access.permitsWrite && selectedEntry?.path == editor.path && editor.canSave
      && controller.fileRead.loadState == .loaded && controller.fileWrite.loadState != .loading
      && controller.fileRead.value?.path == editor.path && controller.fileRead.value?.status == .ready
  }

  private var isSavingSelectedFile: Bool {
    controller.fileWritePath == selectedEntry?.path && controller.fileWrite.loadState == .loading
  }

  private var isSurfaceActive: Bool { !embeddedInInspector || inspectorVisible }

  private func saveFailure(_ failure: ProjectOperationFailure) -> some View {
    HStack(spacing: 10) {
      Image(systemName: "exclamationmark.triangle")
        .accessibilityHidden(true)
      Text(ProjectWorkspaceStrings.failureMessage(failure))
        .font(.footnote)
      Spacer(minLength: 8)
      Button(ProjectWorkspaceStrings.retry, systemImage: "arrow.clockwise", action: onSave)
        .disabled(!canSave)
    }
    .padding(12)
    .frame(maxWidth: .infinity)
    .poracodeGlassBackground()
    .padding()
    .accessibilityElement(children: .contain)
  }
}
