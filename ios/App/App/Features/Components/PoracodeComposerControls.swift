import SwiftUI

/// Keeps primary actions together. When the model summary cannot retain a
/// readable width, only that summary moves above the action row. A Layout
/// preserves the same controls and recorder identity through this change.
struct PoracodeComposerControls<Leading: View, Configuration: View, Voice: View, Trailing: View>: View {
  @ScaledMetric(relativeTo: .caption2) private var minimumConfigurationWidth: CGFloat = 120
  @ViewBuilder let leading: () -> Leading
  @ViewBuilder let configuration: () -> Configuration
  @ViewBuilder let voice: () -> Voice
  @ViewBuilder let trailing: () -> Trailing

  var body: some View {
    ComposerControlsLayout(minimumConfigurationWidth: minimumConfigurationWidth) {
      leading().frame(width: 44, height: 44)
      configuration().frame(maxWidth: .infinity)
      VStack(spacing: 0) { voice() }
      trailing().frame(width: 44, height: 44)
    }
  }
}

private struct ComposerControlsLayout: Layout {
  let minimumConfigurationWidth: CGFloat
  private let spacing: CGFloat = 7
  private let rowSpacing: CGFloat = 4

  private struct Measurement {
    let leading: CGSize
    let voice: CGSize
    let trailing: CGSize
    let configuration: CGSize
    let configurationWidth: CGFloat
    let stacked: Bool
    let actionHeight: CGFloat
  }

  private func measure(width: CGFloat, subviews: Subviews) -> Measurement {
    let leading = subviews[0].sizeThatFits(.init(width: 44, height: 44))
    let voice = subviews[2].sizeThatFits(.unspecified)
    let trailing = subviews[3].sizeThatFits(.init(width: 44, height: 44))
    let inlineWidth = width - leading.width - voice.width - trailing.width - spacing * (voice.width > 0 ? 3 : 2)
    let stacked = inlineWidth < minimumConfigurationWidth
    let configurationWidth = max(0, stacked ? width : inlineWidth)
    let configuration = subviews[1].sizeThatFits(.init(width: configurationWidth, height: nil))
    return .init(leading: leading, voice: voice, trailing: trailing, configuration: configuration,
      configurationWidth: configurationWidth, stacked: stacked,
      actionHeight: max(leading.height, voice.height, trailing.height))
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard subviews.count == 4 else { return .zero }
    let preferredWidth = minimumConfigurationWidth + 44 * 3 + spacing * 3
    let width = max(0, proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? preferredWidth)
    let value = measure(width: width, subviews: subviews)
    return .init(width: width, height: value.stacked
      ? value.configuration.height + rowSpacing + value.actionHeight : max(value.configuration.height, value.actionHeight))
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    guard subviews.count == 4 else { return }
    let value = measure(width: bounds.width, subviews: subviews)
    let actionY = value.stacked ? bounds.minY + value.configuration.height + rowSpacing : bounds.minY
    let actionHeight = value.stacked ? value.actionHeight : bounds.height
    subviews[0].place(at: .init(x: bounds.minX, y: actionY + actionHeight / 2), anchor: .leading,
      proposal: .init(value.leading))
    subviews[3].place(at: .init(x: bounds.maxX, y: actionY + actionHeight / 2), anchor: .trailing,
      proposal: .init(value.trailing))
    subviews[2].place(at: .init(x: bounds.maxX - value.trailing.width - (value.voice.width > 0 ? spacing : 0),
      y: actionY + actionHeight / 2), anchor: .trailing, proposal: .init(value.voice))
    subviews[1].place(at: .init(x: value.stacked ? bounds.minX : bounds.minX + value.leading.width + spacing,
      y: value.stacked ? bounds.minY + value.configuration.height / 2 : bounds.midY), anchor: .leading,
      proposal: .init(width: value.configurationWidth, height: value.configuration.height))
  }
}
