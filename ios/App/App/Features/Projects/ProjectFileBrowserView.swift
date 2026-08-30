import SwiftUI
import UIKit

struct ProjectFileBrowserView: View {
  @Bindable var controller: ProjectFileWorkspaceController

  let currentDirectory: String
  let selectedEntry: ProjectWorkspaceEntry?
  let canMutate: Bool
  @Binding var query: String
  @Binding var requestedCreationType: AdvancedProjectEntryType?
  let onOpen: (ProjectWorkspaceEntry) -> Void
  let onOpenDirectory: (String) -> Void
  let onRefresh: () async -> Void
  let onEntryMutated: (ProjectWorkspaceEntryMutation) async -> Void

  @State private var editor: ProjectEntryEditor?
  @State private var pendingDelete: ProjectWorkspaceEntry?
  @State private var mutationFailure: String?

  var body: some View {
    browserList
    .refreshable { await onRefresh() }
    .alert(
      editorTitle,
      isPresented: Binding(
        get: { editor != nil },
        set: { if !$0 { editor = nil } }
      )
    ) {
      TextField(editorFieldLabel, text: editorText)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
      Button(AdvancedOperationsStrings.cancel, role: .cancel) { editor = nil }
      Button(editorActionLabel) { submitEditor() }
        .disabled(!editorCanSubmit)
    }
    .confirmationDialog(
      AdvancedOperationsStrings.action(.deleteProjectEntry),
      isPresented: Binding(
        get: { pendingDelete != nil },
        set: { if !$0 { pendingDelete = nil } }
      ),
      titleVisibility: .visible,
      presenting: pendingDelete
    ) { entry in
      Button(ThreadLifecycleStrings.delete, role: .destructive) {
        pendingDelete = nil
        perform(.delete(path: entry.path))
      }
      Button(AdvancedOperationsStrings.cancel, role: .cancel) { pendingDelete = nil }
    } message: { entry in
      Text(entry.path)
    }
    .task(id: query) {
      guard !query.isEmpty else { return }
      do {
        try await Task.sleep(for: .milliseconds(250))
        try Task.checkCancellation()
      } catch {
        return
      }
      await controller.searchFiles(
        query: query,
        limit: ProjectWorkspaceBounds.searchLimit
      )
    }
    .onChange(of: requestedCreationType) { _, type in
      guard let type else { return }
      requestedCreationType = nil
      editor = .create(parentPath: currentDirectory, type: type)
    }
  }

  private var browserList: some View {
    List {
      if let mutationFailure {
        Section {
          Text(mutationFailure)
            .font(.caption)
            .foregroundStyle(.red)
        }
      }
      if query.isEmpty {
        directoryHeader
        treeContent
      } else {
        searchContent
      }
    }
    .listStyle(.sidebar)
    .navigationTitle(ProjectWorkspaceStrings.files)
    .navigationBarTitleDisplayMode(.inline)
  }

  @ViewBuilder
  private var directoryHeader: some View {
    Section {
      if let parent = ProjectWorkspacePath.parent(of: currentDirectory) {
        Button {
          onOpenDirectory(parent)
        } label: {
          Label(ProjectWorkspaceStrings.parentFolder, systemImage: "arrow.up")
        }
        .accessibilityHint(
          ProjectWorkspaceStrings.openEntry(
            parent.isEmpty ? ProjectWorkspaceStrings.root : parent
          )
        )
      }
    } header: {
      Text(currentDirectory.isEmpty ? ProjectWorkspaceStrings.root : currentDirectory)
        .lineLimit(1)
    }
  }

  @ViewBuilder
  private var treeContent: some View {
    switch controller.treeList.loadState {
    case .idle, .loading:
      loadingRows
    case .loaded, .empty:
      if let result = controller.treeList.value {
        entriesSection(result.entries)
      } else {
        emptyRow(ProjectWorkspaceStrings.noFiles)
      }
    case .failed(let failure):
      failureRow(failure) {
        Task { await onRefresh() }
      }
    }
  }

  @ViewBuilder
  private var searchContent: some View {
    switch controller.fileSearch.loadState {
    case .idle, .loading:
      loadingRows
    case .loaded, .empty:
      if let result = controller.fileSearch.value {
        entriesSection(result.entries)
        Section {
          Text(
            ProjectWorkspaceStrings.searchSummary(
              matches: result.entries.count,
              indexed: result.totalIndexed
            )
          )
          .font(.caption)
          .foregroundStyle(.secondary)
        }
      } else {
        emptyRow(ProjectWorkspaceStrings.noSearchResults)
      }
    case .failed(let failure):
      failureRow(failure) {
        Task {
          await controller.searchFiles(
            query: query,
            limit: ProjectWorkspaceBounds.searchLimit
          )
        }
      }
    }
  }

  @ViewBuilder
  private func entriesSection(_ entries: [ProjectWorkspaceEntry]) -> some View {
    if entries.isEmpty {
      emptyRow(
        query.isEmpty ? ProjectWorkspaceStrings.noFiles : ProjectWorkspaceStrings.noSearchResults)
    } else {
      Section {
        ForEach(ProjectWorkspaceBounds.entries(entries)) { entry in
          Button {
            onOpen(entry)
          } label: {
            ProjectWorkspaceEntryRow(
              entry: entry,
              isSelected: entry.id == selectedEntry?.id
            )
          }
          .buttonStyle(.plain)
          .accessibilityLabel(ProjectWorkspaceStrings.openEntry(entry.name))
          .contextMenu { entryActions(entry) }
          .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
              pendingDelete = entry
            } label: {
              Label(ThreadLifecycleStrings.delete, systemImage: "trash")
            }
            .disabled(!canMutate || isMutating)
          }
        }
      }
    }
  }

  @ViewBuilder
  private func entryActions(_ entry: ProjectWorkspaceEntry) -> some View {
    if entry.type == .directory {
      Button(createLabel(.file), systemImage: "doc.badge.plus") {
        editor = .create(parentPath: entry.path, type: .file)
      }
      .disabled(!canMutate || isMutating)
      Button(createLabel(.directory), systemImage: "folder.badge.plus") {
        editor = .create(parentPath: entry.path, type: .directory)
      }
      .disabled(!canMutate || isMutating)
    }
    Button(copyLabel(.absolutePath), systemImage: "doc.on.doc") {
      UIPasteboard.general.string = absolutePath(entry.path)
    }
    Button(copyLabel(.path), systemImage: "list.bullet.clipboard") {
      UIPasteboard.general.string = entry.path
    }
    Button(ThreadLifecycleStrings.rename, systemImage: "pencil") {
      editor = .rename(entry)
    }
    .disabled(!canMutate || isMutating)
    Button(ThreadLifecycleStrings.moveToWorktreeConfirm, systemImage: "folder") {
      editor = .move(entry)
    }
    .disabled(!canMutate || isMutating)
    Button(ThreadLifecycleStrings.delete, systemImage: "trash", role: .destructive) {
      pendingDelete = entry
    }
    .disabled(!canMutate || isMutating)
  }

  private var loadingRows: some View {
    Section {
      ForEach(0..<4, id: \.self) { _ in
        ProjectWorkspaceEntryRow(
          entry: ProjectWorkspaceEntry(
            path: ProjectWorkspaceStrings.loading,
            name: ProjectWorkspaceStrings.loading,
            type: .file
          ),
          isSelected: false
        )
      }
      .redacted(reason: .placeholder)
      .allowsHitTesting(false)
    }
  }

  private func emptyRow(_ title: String) -> some View {
    Section {
      Label(title, systemImage: query.isEmpty ? "folder" : "magnifyingglass")
        .foregroundStyle(.secondary)
    }
  }

  private func failureRow(
    _ failure: ProjectOperationFailure,
    retry: @escaping () -> Void
  ) -> some View {
    Section {
      Text(ProjectWorkspaceStrings.failureMessage(failure))
        .font(.callout)
        .foregroundStyle(.secondary)
      Button(ProjectWorkspaceStrings.retry, action: retry)
    }
  }

  private var isMutating: Bool {
    controller.entryMutation.loadState == .loading
  }

  private var editorTitle: String {
    switch editor {
    case .create: AdvancedOperationsStrings.action(.createProjectEntry)
    case .rename: ThreadLifecycleStrings.rename
    case .move: ThreadLifecycleStrings.moveToWorktreeConfirm
    case nil: ProjectWorkspaceStrings.files
    }
  }

  private var editorFieldLabel: String {
    switch editor {
    case .move: AdvancedOperationsStrings.field(.nextParentPath)
    default: AdvancedOperationsStrings.field(.nextName)
    }
  }

  private var editorActionLabel: String {
    switch editor {
    case .create: AdvancedOperationsStrings.confirm
    case .rename: ThreadLifecycleStrings.rename
    case .move: ThreadLifecycleStrings.moveToWorktreeConfirm
    case nil: AdvancedOperationsStrings.confirm
    }
  }

  private var editorCanSubmit: Bool {
    if case .move = editor { return true }
    return !editorText.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private var editorText: Binding<String> {
    Binding(
      get: { editor?.value ?? "" },
      set: { editor?.value = $0 }
    )
  }

  private func createLabel(_ type: AdvancedProjectEntryType) -> String {
    let kind =
      type == .file
      ? AdvancedOperationsStrings.entryTypeFile : AdvancedOperationsStrings.entryTypeDirectory
    return "\(AdvancedOperationsStrings.action(.createProjectEntry)) · \(kind)"
  }

  private func copyLabel(_ field: AdvancedFormFieldKey) -> String {
    "\(SettingsIntegrationsStrings.copy) · \(AdvancedOperationsStrings.field(field))"
  }

  private func absolutePath(_ relativePath: String) -> String {
    guard let location = controller.context?.lease.location else { return relativePath }
    switch location {
    case .windows(let root, _):
      let separator = root.hasSuffix("\\") || root.hasSuffix("/") ? "" : "\\"
      return "\(root)\(separator)\(relativePath.replacingOccurrences(of: "/", with: "\\"))"
    case .wsl(_, let root, _, _), .posix(let root, _):
      let separator = root.hasSuffix("/") ? "" : "/"
      return "\(root)\(separator)\(relativePath)"
    }
  }

  private func submitEditor() {
    guard let editor else { return }
    let value = editor.value.trimmingCharacters(in: .whitespacesAndNewlines)
    if case .move = editor {
      // An empty parent path explicitly means the project root.
    } else if value.isEmpty {
      return
    }
    self.editor = nil
    switch editor {
    case .create(let parentPath, let type, _):
      let path = parentPath.isEmpty ? value : "\(parentPath)/\(value)"
      perform(.create(path: path, type: type), openCreatedPath: type == .file ? path : nil)
    case .rename(let entry, _):
      let parent = ProjectWorkspacePath.parent(of: entry.path) ?? ""
      let nextPath = parent.isEmpty ? value : "\(parent)/\(value)"
      perform(
        .rename(path: entry.path, nextName: value),
        openCreatedPath: selectedEntry?.path == entry.path && entry.type == .file ? nextPath : nil
      )
    case .move(let entry, _):
      let name = entry.path.split(separator: "/").last.map(String.init) ?? entry.path
      let nextPath = value.isEmpty ? name : "\(value)/\(name)"
      perform(
        .move(path: entry.path, nextParentPath: value.isEmpty ? nil : value),
        openCreatedPath: selectedEntry?.path == entry.path && entry.type == .file ? nextPath : nil
      )
    }
  }

  private func perform(
    _ mutation: ProjectWorkspaceEntryMutation,
    openCreatedPath: String? = nil
  ) {
    guard canMutate, !isMutating else { return }
    mutationFailure = nil
    Task {
      guard await controller.mutateEntry(mutation) else {
        if case .failed(let failure) = controller.entryMutation.loadState {
          mutationFailure = ProjectWorkspaceStrings.failureMessage(failure)
        }
        return
      }
      await onEntryMutated(mutation)
      if !query.isEmpty {
        await controller.searchFiles(
          query: query,
          limit: ProjectWorkspaceBounds.searchLimit
        )
      }
      if let openCreatedPath {
        onOpen(
          ProjectWorkspaceEntry(
            path: openCreatedPath,
            name: openCreatedPath.split(separator: "/").last.map(String.init) ?? openCreatedPath,
            type: .file
          )
        )
      }
    }
  }
}

private enum ProjectEntryEditor: Identifiable {
  case create(parentPath: String, type: AdvancedProjectEntryType, value: String = "")
  case rename(ProjectWorkspaceEntry, value: String? = nil)
  case move(ProjectWorkspaceEntry, value: String = "")

  var id: String {
    switch self {
    case .create(let parentPath, let type, _): "create:\(parentPath):\(type.rawValue)"
    case .rename(let entry, _): "rename:\(entry.path)"
    case .move(let entry, _): "move:\(entry.path)"
    }
  }

  var value: String {
    get {
      switch self {
      case .create(_, _, let value), .move(_, let value): value
      case .rename(let entry, let value): value ?? entry.name
      }
    }
    set {
      switch self {
      case .create(let parentPath, let type, _):
        self = .create(parentPath: parentPath, type: type, value: newValue)
      case .rename(let entry, _):
        self = .rename(entry, value: newValue)
      case .move(let entry, _):
        self = .move(entry, value: newValue)
      }
    }
  }
}

private struct ProjectWorkspaceEntryRow: View {
  let entry: ProjectWorkspaceEntry
  let isSelected: Bool

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: entry.type == .directory ? "folder" : "doc.text")
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(entry.name)
          .lineLimit(1)
        if entry.path != entry.name {
          Text(entry.path)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      Spacer(minLength: 8)
      if isSelected {
        Image(systemName: "checkmark")
          .foregroundStyle(.secondary)
          .accessibilityHidden(true)
      } else if entry.type == .directory {
        Image(systemName: "chevron.forward")
          .font(.caption)
          .foregroundStyle(.tertiary)
          .accessibilityHidden(true)
      }
    }
    .contentShape(Rectangle())
  }
}
