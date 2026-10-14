import SwiftUI

enum HomeThreadSearchPresentation {
  static let resultLimit = 50

  static func results(
    from items: [UnifiedThreadListItem],
    query: String,
    limit: Int = resultLimit
  ) -> [UnifiedThreadListItem] {
    let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let filtered =
      normalized.isEmpty
      ? items
      : items.filter { $0.thread.title.localizedCaseInsensitiveContains(normalized) }
    return Array(
      filtered.sorted { lhs, rhs in
        if lhs.thread.isStarred != rhs.thread.isStarred {
          return lhs.thread.isStarred && !rhs.thread.isStarred
        }
        if lhs.thread.updatedAt != rhs.thread.updatedAt {
          return lhs.thread.updatedAt > rhs.thread.updatedAt
        }
        return lhs.id < rhs.id
      }.prefix(max(0, limit))
    )
  }
}

/// Dedicated native search destination matching compact PWA behavior while
/// using iOS search placement, list rows, dismissal, and navigation depth.
struct HomeThreadSearchView: View {
  @Environment(\.dismiss) private var dismiss

  let items: [UnifiedThreadListItem]
  let open: (UnifiedThreadListItem) -> Void
  let drafts: RichChatComposerDraftStore
  let lifecycle: HomeThreadLifecycleCoordinator

  @State private var query = ""

  var body: some View {
    NavigationStack {
      Group {
        if results.isEmpty {
          if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            ContentUnavailableView(
              HomeStrings.emptyThreadsTitle,
              systemImage: "bubble.left.and.bubble.right",
              description: Text(HomeStrings.emptyThreadsDescription)
            )
          } else {
            ContentUnavailableView.search(text: query)
          }
        } else {
          List(results) { item in
            resultButton(item)
          }
          .listStyle(.plain)
        }
      }
      .navigationTitle(HomeStrings.searchThreads)
      .navigationBarTitleDisplayMode(.inline)
      .searchable(
        text: $query,
        placement: .navigationBarDrawer(displayMode: .always),
        prompt: HomeStrings.searchThreads
      )
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(SettingsUIStrings.done) { dismiss() }
        }
      }
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
    .presentationCornerRadius(28)
  }

  private var results: [UnifiedThreadListItem] {
    HomeThreadSearchPresentation.results(from: items, query: query)
  }

  private func resultButton(_ item: UnifiedThreadListItem) -> some View {
    Button {
      dismiss()
      DispatchQueue.main.async { open(item) }
    } label: {
      PoracodeThreadRow(
        thread: item.thread,
        projectName: item.project.name,
        hostName: item.hostName,
        hasDraft: hasDraft(item),
        showsRelativeTime: true,
        showsGitBranch: item.thread.worktreePath?.isEmpty == false
      )
    }
    .buttonStyle(.plain)
    .contextMenu {
      Button(RichChatStrings.closeThread, systemImage: "xmark.circle") {
        dismiss()
        DispatchQueue.main.async {
          lifecycle.requestClose(item)
        }
      }
      .disabled(!lifecycle.canClose(item))
      ThreadLifecycleActionsContent(
        thread: item.thread,
        enabled: lifecycle.canOperate(item),
        isBusy: lifecycle.controller.isBusy,
        perform: { action in
          dismiss()
          DispatchQueue.main.async {
            lifecycle.perform(action, on: item)
          }
        }
      )
    }
    .accessibilityLabel(
      ([
        item.thread.title,
        item.project.name,
        HomeDeviceName.display(item.hostName),
        ThreadLifecycleStrings.status(item.thread.status),
      ] + (hasDraft(item) ? [HomeStrings.unsentDraft] : [])).joined(separator: ", ")
    )
    .accessibilityIdentifier("native-e2e.search-thread.\(item.thread.id)")
  }

  private func hasDraft(_ item: UnifiedThreadListItem) -> Bool {
    drafts.hasDraft(
      for: RichChatComposerDraftKey(
        connectionID: item.connectionID,
        threadID: item.thread.id
      )
    )
  }

}
