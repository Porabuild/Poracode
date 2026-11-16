import SwiftUI

struct HomeProjectFilterMenu: View {
  @Bindable var session: AppSession
  let options: [HomeProjectFilterOption]
  @Binding var selectedProjectIDs: Set<String>
  var usesCircleButton: Bool = false
  var circleButtonSize: CGFloat = 30

  @State private var presentation: HomeProjectFilterPresentation?

  var body: some View {
    trigger
      .accessibilityIdentifier("native-e2e.project-filter")
      .sheet(item: $presentation) { _ in
        HomeProjectFilterDrawer(
          session: session,
          options: options,
          selectedProjectIDs: $selectedProjectIDs
        )
      }
  }

  @ViewBuilder
  private var trigger: some View {
    let color: Color = selectedProjectIDs.isEmpty ? .secondary : .primary
    if usesCircleButton {
      PoracodeCircleButton(color: color, size: circleButtonSize) {
        presentation = .filter
      } label: {
        Image(systemName: "line.3.horizontal.decrease")
          .font(circleButtonSize < 28 ? .footnote : .subheadline)
      }
      .accessibilityLabel(HomeStrings.filterProjects)
    } else {
      PoracodeToolbarIconButton(
        title: HomeStrings.filterProjects,
        systemImage: "line.3.horizontal.decrease",
        color: color
      ) {
        presentation = .filter
      }
    }
  }
}

private enum HomeProjectFilterPresentation: String, Identifiable {
  case filter

  var id: String { rawValue }
}
