import SwiftUI

struct HomeProjectFilterMenu: View {
  let title: String
  let isFiltered: Bool
  var usesCircleButton: Bool = false
  var circleButtonSize: CGFloat = 30
  let open: () -> Void

  var body: some View {
    trigger
      .accessibilityIdentifier("native-e2e.project-filter")
  }

  @ViewBuilder
  private var trigger: some View {
    let color: Color = isFiltered ? .primary : .secondary
    if usesCircleButton {
      PoracodeCircleButton(color: color, size: circleButtonSize, action: open) {
        Image(systemName: "line.3.horizontal.decrease")
          .font(circleButtonSize < 28 ? .footnote : .subheadline)
      }
      .accessibilityLabel(title)
    } else {
      PoracodeToolbarIconButton(
        title: title,
        systemImage: "line.3.horizontal.decrease",
        color: color,
        action: open
      )
    }
  }
}
