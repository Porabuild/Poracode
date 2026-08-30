import SwiftUI

struct HomeProjectFilterMenu: View {
  @Bindable var session: AppSession
  let options: [HomeProjectFilterOption]
  @Binding var selectedProjectIDs: Set<String>

  @State private var presentation: HomeProjectFilterPresentation?

  var body: some View {
    PoracodeToolbarIconButton(
      systemImage: "line.3.horizontal.decrease",
      color: selectedProjectIDs.isEmpty ? .secondary : .primary
    ) {
      presentation = .filter
    }
    .accessibilityLabel(HomeStrings.filterProjects)
    .accessibilityIdentifier("native-e2e.project-filter")
    .sheet(item: $presentation) { _ in
      HomeProjectFilterDrawer(
        session: session,
        options: options,
        selectedProjectIDs: $selectedProjectIDs
      )
    }
  }
}

private enum HomeProjectFilterPresentation: String, Identifiable {
  case filter

  var id: String { rawValue }
}
