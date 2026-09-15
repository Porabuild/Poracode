import SwiftUI

struct HomeProjectFilterDrawer: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme

  @Bindable var session: AppSession
  let options: [HomeProjectFilterOption]
  @Binding var selectedProjectIDs: Set<String>

  @State private var projectActions: HomeProjectFilterOption?
  @State private var selectedDetent: PresentationDetent

  init(
    session: AppSession,
    options: [HomeProjectFilterOption],
    selectedProjectIDs: Binding<Set<String>>
  ) {
    self.session = session
    self.options = options
    _selectedProjectIDs = selectedProjectIDs
    _selectedDetent = State(
      initialValue: .height(Self.filterPreferredHeight(optionCount: options.count))
    )
  }

  var body: some View {
    NavigationStack {
      List {
        HomeAllProjectsFilterRow(
          isSelected: selectedProjectIDs.isEmpty,
          accent: palette.accent,
          select: selectAllProjects
        )

        ForEach(options) { option in
          HomeProjectFilterRow(
            option: option,
            isSelected: selectedProjectIDs.isEmpty || selectedProjectIDs.contains(option.id),
            accent: palette.accent,
            select: { toggle(option.id) },
            openActions: { projectActions = option }
          )
        }
      }
      .poracodeDrawerListStyle()
      .navigationTitle(HomeStrings.filterProjects)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(SettingsUIStrings.done) { dismiss() }
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
    .presentationDetents([.height(compactHeight), .large], selection: $selectedDetent)
    .presentationDragIndicator(.visible)
    .presentationCornerRadius(28)
    .onChange(of: projectActions?.id) { _, _ in
      selectedDetent = .height(compactHeight)
    }
  }

  private var preferredHeight: CGFloat {
    Self.filterPreferredHeight(optionCount: options.count)
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

  private var palette: PoracodeThemeVariant {
    theme.variant(for: colorScheme)
  }

  private static func filterPreferredHeight(optionCount: Int) -> CGFloat {
    min(188 + CGFloat(optionCount) * 58, 430)
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
