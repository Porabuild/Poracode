import SwiftUI

struct ProjectFileDetailView: View {
  @Bindable var controller: ProjectFileWorkspaceController
  @Binding var editor: ProjectWorkspaceEditorState

  let selectedEntry: ProjectWorkspaceEntry?
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
    .navigationTitle(selectedEntry?.name ?? ProjectWorkspaceStrings.files)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar { editorToolbar }
    .safeAreaInset(edge: .bottom) {
      if case .failed(let failure) = controller.fileWrite.loadState,
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
      if access.permitsWrite {
        editableContent
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
    TextEditor(text: $editor.draft)
      .font(.system(.body, design: .monospaced))
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .padding(.horizontal, 8)
      .accessibilityLabel(ProjectWorkspaceStrings.editorLabel)
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
    if selectedEntry != nil, access.permitsWrite {
      ToolbarItemGroup(placement: .topBarTrailing) {
        if editor.isDirty {
          Button(ProjectWorkspaceStrings.discard, action: onDiscard)
        }
        Button {
          onSave()
        } label: {
          if controller.fileWrite.loadState == .loading {
            ProgressView()
              .accessibilityLabel(ProjectWorkspaceStrings.saving)
          } else {
            Label(ProjectWorkspaceStrings.save, systemImage: "square.and.arrow.down")
          }
        }
        .disabled(!editor.canSave || controller.fileWrite.loadState == .loading)
        .accessibilityLabel(
          controller.fileWrite.loadState == .loading
            ? ProjectWorkspaceStrings.saving : ProjectWorkspaceStrings.save
        )
      }
    }
  }

  private func saveFailure(_ failure: ProjectOperationFailure) -> some View {
    HStack(spacing: 10) {
      Image(systemName: "exclamationmark.triangle")
        .accessibilityHidden(true)
      Text(ProjectWorkspaceStrings.failureMessage(failure))
        .font(.footnote)
      Spacer(minLength: 8)
      Button(ProjectWorkspaceStrings.retry, action: onSave)
        .disabled(!access.permitsWrite)
    }
    .padding(12)
    .frame(maxWidth: .infinity)
    .poracodeGlassBackground()
    .padding()
    .accessibilityElement(children: .contain)
  }
}
