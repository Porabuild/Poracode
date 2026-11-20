import SwiftUI

struct HomeProjectFilterDrawer: View {
  @Environment(\.dismiss) private var dismiss

  @Bindable var session: AppSession
  let options: [HomeProjectFilterOption]
  @Binding var selectedProjectIDs: Set<String>
  @Binding var status: HomeThreadListStatus
  let doneCount: Int?

  @State private var projectActions: HomeProjectFilterOption?
  @State private var selectedDetent: PresentationDetent

  init(
    session: AppSession,
    options: [HomeProjectFilterOption],
    selectedProjectIDs: Binding<Set<String>>,
    status: Binding<HomeThreadListStatus>,
    doneCount: Int?
  ) {
    self.session = session
    self.options = options
    _selectedProjectIDs = selectedProjectIDs
    _status = status
    self.doneCount = doneCount
    _selectedDetent = State(
      initialValue: .height(Self.filterPreferredHeight(optionCount: options.count, showsStatus: doneCount != nil))
    )
  }

  var body: some View {
    NavigationStack {
      List {
        if let doneCount {
          Section {
            HomeThreadStatusFilterRow(status: .active, isSelected: status == .active) { status = .active }
            HomeThreadStatusFilterRow(status: .done, count: doneCount, isSelected: status == .done) { status = .done }
          }
        }

        HomeAllProjectsFilterRow(
          isSelected: selectedProjectIDs.isEmpty,
          select: selectAllProjects
        )

        ForEach(options) { option in
          HomeProjectFilterRow(
            option: option,
            isSelected: selectedProjectIDs.isEmpty || selectedProjectIDs.contains(option.id),
            select: { toggle(option.id) },
            openActions: { projectActions = option }
          )
        }
      }
      .poracodeDrawerListStyle()
      .navigationTitle(doneCount == nil ? HomeStrings.filterProjects : HomeStrings.filterThreads)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(SettingsUIStrings.done, systemImage: "checkmark") { dismiss() }
            .accessibilityIdentifier("native-e2e.project-filter.done")
        }
      }
      .navigationDestination(item: $projectActions) { option in
        HomeProjectActionsDrawer(
          session: session,
          option: option,
          selectedDetent: $selectedDetent
        )
      }
    }
    .poracodeFormSheetSizing()
    .presentationDetents([.height(compactHeight), .large], selection: $selectedDetent)
    .presentationDragIndicator(.visible)
    .presentationCornerRadius(28)
    .onChange(of: projectActions?.id) { _, _ in
      selectedDetent = .height(compactHeight)
    }
  }

  private var preferredHeight: CGFloat {
    Self.filterPreferredHeight(optionCount: options.count, showsStatus: doneCount != nil)
  }

  private var compactHeight: CGFloat {
    guard let option = projectActions else { return preferredHeight }
    let project = HomeProjectSnapshotResolver.project(
      connectionID: option.connectionID,
      projectID: option.project.id,
      selectedConnectionID: session.state.selectedConnectionId,
      selectedSnapshot: session.state.snapshot,
      hostSnapshots: session.state.hostSnapshots,
      fallback: option.project
    )
    return HomeProjectActionsDrawer.preferredHeight(for: project)
  }

  private static func filterPreferredHeight(optionCount: Int, showsStatus: Bool) -> CGFloat {
    let statusHeight: CGFloat = showsStatus ? 102 : 0
    return min(188 + CGFloat(optionCount) * 58 + statusHeight, 430 + statusHeight)
  }

  private func selectAllProjects() {
    selectedProjectIDs.removeAll()
  }

  private func toggle(_ id: String) {
    selectedProjectIDs = HomeProjectFilterSelection.toggling(
      id,
      selection: selectedProjectIDs,
      available: Set(options.map(\.id))
    )
  }
}
