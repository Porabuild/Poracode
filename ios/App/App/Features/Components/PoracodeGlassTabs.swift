import SwiftUI

/// One selectable segment in a `PoracodeGlassTabs` platter.
struct PoracodeGlassTab<Value: Hashable> {
  let value: Value
  let title: String
  let systemImage: String
  var accessibilityIdentifier: String? = nil
}

/// Floating glass segmented control for mode switching. The platter is one
/// neutral interactive glass capsule; the selected segment keeps primary
/// foreground and slides a soft pill via matched geometry.
struct PoracodeGlassTabs<Value: Hashable>: View {
  let title: String
  @Binding var selection: Value
  let tabs: [PoracodeGlassTab<Value>]
  var glassID: String? = nil
  var glassNamespace: Namespace.ID? = nil

  @Namespace private var selectionNamespace

  var body: some View {
    Group {
      if let glassID, let glassNamespace {
        platter.poracodeGlassID(glassID, in: glassNamespace)
      } else {
        platter
      }
    }
  }

  private var platter: some View {
    HStack(spacing: 0) {
      ForEach(tabs, id: \.value) { tab in
        tabButton(tab)
      }
    }
    .padding(4)
    .poracodeGlassBackground(in: Capsule(), interactive: true)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(title)
  }

  @ViewBuilder
  private func tabButton(_ tab: PoracodeGlassTab<Value>) -> some View {
    let isSelected = tab.value == selection
    Button {
      withAnimation(.snappy(duration: 0.25)) {
        selection = tab.value
      }
    } label: {
      Label(tab.title, systemImage: tab.systemImage)
        .labelStyle(.titleAndIcon)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(isSelected ? Color.primary : Color.secondary)
        .frame(maxWidth: .infinity)
        .frame(height: 44)
        .background {
          if isSelected {
            Capsule()
              .fill(Color.primary.opacity(0.1))
              .matchedGeometryEffect(
                id: "poracode-glass-tabs-selection",
                in: selectionNamespace
              )
          }
        }
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(isSelected ? .isSelected : AccessibilityTraits())
    .poracodeOptionalAccessibilityIdentifier(tab.accessibilityIdentifier)
  }
}

extension View {
  @ViewBuilder
  fileprivate func poracodeOptionalAccessibilityIdentifier(_ identifier: String?) -> some View {
    if let identifier {
      accessibilityIdentifier(identifier)
    } else {
      self
    }
  }
}
