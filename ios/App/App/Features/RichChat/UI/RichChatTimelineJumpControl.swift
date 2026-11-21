import SwiftUI

/// Places Scroll to Bottom in the system rail when the device exposes one.
struct RichChatTimelineJumpControl: ViewModifier {
  let allowsThreadToolbar: Bool
  let showsJumpToBottom: Bool
  let bottomIsVisible: Bool
  let bottomClearance: CGFloat
  let isFinding: Bool
  @Binding var hasVerticalBar: Bool
  let jumpToBottom: () -> Void

  func body(content: Content) -> some View {
    content
      .background {
        if #available(iOS 27.1, *), allowsThreadToolbar {
          PoracodeVerticalBarReader(hasVerticalBar: $hasVerticalBar)
            .allowsHitTesting(false)
        }
      }
      .toolbar {
        if hasVerticalBar && showsJumpToBottom {
          ToolbarItem(placement: .bottomBar) {
            PoracodeToolbarIconButton(title: RichChatStrings.scrollToBottom, systemImage: "arrow.down") {
              jumpToBottom()
            }
            .accessibilityIdentifier("native-e2e.timeline-jump-bottom")
          }
        }
      }
      .overlay(alignment: .bottom) {
        Group {
          if !hasVerticalBar && showsJumpToBottom {
            PoracodeCircleButton {
              jumpToBottom()
            } label: {
              RichChatIcon(.arrowDown)
                .font(.subheadline.weight(.semibold))
            }
            .accessibilityLabel(RichChatStrings.scrollToBottom)
            .accessibilityIdentifier("native-e2e.timeline-jump-bottom")
            .padding(.bottom, bottomClearance + 12)
            .poracodeAvoidKeyboard(isActive: isFinding, reservesSpace: false)
            .transition(.scale.combined(with: .opacity))
          }
        }
        .animation(.snappy(duration: 0.2), value: bottomIsVisible)
      }
  }
}
