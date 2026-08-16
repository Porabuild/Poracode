import SwiftUI

struct ProjectFileBrowserView: View {
  @Bindable var controller: ProjectFileWorkspaceController

  let currentDirectory: String
  let selectedEntry: ProjectWorkspaceEntry?
  let onOpen: (ProjectWorkspaceEntry) -> Void
  let onOpenDirectory: (String) -> Void
  let onRefresh: () async -> Void

  @State private var query = ""

  var body: some View {
    List {
      if query.isEmpty {
        directoryHeader
        treeContent
      } else {
        searchContent
      }
    }
    .listStyle(.sidebar)
    .navigationTitle(ProjectWorkspaceStrings.files)
    .searchable(text: $query, prompt: ProjectWorkspaceStrings.searchFiles)
    .refreshable { await onRefresh() }
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
        }
      }
    }
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
}

private struct ProjectWorkspaceEntryRow: View {
  let entry: ProjectWorkspaceEntry
  let isSelected: Bool

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: entry.type == .directory ? "folder" : "doc.text")
        .foregroundStyle(entry.type == .directory ? Color.accentColor : Color.secondary)
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
          .foregroundStyle(.tint)
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
