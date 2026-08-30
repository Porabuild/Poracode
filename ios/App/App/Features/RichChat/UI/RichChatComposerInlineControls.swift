import SwiftUI

/// Compact PWA-aligned configuration summary shown inside an empty native
/// composer. It keeps the current provider/model/effort visible while the
/// complete editable controls remain in the native configuration sheet.
struct RichChatComposerInlineConfiguration: View {
  let agentKind: String
  let configuration: ThreadConfig
  let catalog: RichChatComposerControlCatalog
  let canOpen: Bool
  var showsStatusIcons = true
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      HStack(spacing: 5) {
        HomeProviderIcon(kind: agentKind)
          .foregroundStyle(.primary.opacity(0.92))
          .frame(width: 13, height: 13)
        Text(catalog.modelLabel(configuration.model))
          .font(.caption.weight(.semibold))
          .foregroundStyle(.primary)
          .lineLimit(1)
        if let effortLabel {
          Text(effortLabel)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        if showsStatusIcons {
          RichChatComposerModeIcon(configuration: configuration)
          RichChatComposerStatusIcon(systemImage: "checkmark.shield")
        }
      }
      .fixedSize(horizontal: true, vertical: false)
    }
    .buttonStyle(.plain)
    .tint(.secondary)
    .allowsHitTesting(canOpen)
    .accessibilityLabel(RichChatStrings.composerControls)
  }

  private var effortLabel: String? {
    guard let effort = configuration.effort else { return nil }
    return catalog.effortOptions(for: configuration.model).first { $0.id == effort }?.label
      ?? effort.capitalized
  }
}

struct RichChatComposerModeIcon: View {
  let configuration: ThreadConfig

  var body: some View {
    RichChatComposerStatusIcon(
      systemImage: configuration.mode == "plan" ? "list.bullet.clipboard" : "hammer"
    )
  }
}

struct RichChatComposerStatusIcon: View {
  let systemImage: String

  var body: some View {
    Image(systemName: systemImage)
      .resizable()
      .scaledToFit()
      .foregroundStyle(.secondary)
      .frame(width: 12, height: 12)
      .frame(width: 14, height: 14)
  }
}

struct RichChatComposerConfigurationIcon: View {
  let systemImage: String
  let canOpen: Bool
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      RichChatComposerStatusIcon(systemImage: systemImage)
        .frame(width: 28, height: 28)
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .tint(.secondary)
    .allowsHitTesting(canOpen)
    .accessibilityLabel(RichChatStrings.composerControls)
  }
}

struct RichChatComposerTrailingAction: View {
  let hasPrompt: Bool
  let isTurnActive: Bool
  let isSending: Bool
  let showsSendWhenEmpty: Bool
  let importing: Bool
  let isResolvingRequest: Bool
  let interrupt: () -> Void
  let send: () -> Void

  @ViewBuilder
  var body: some View {
    if (isTurnActive || isSending) && !hasPrompt {
      Button(action: interrupt) {
        Image(systemName: "stop.fill")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(.primary)
          .frame(width: 32, height: 32)
          .background(Color.secondary.opacity(0.16), in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(RichChatStrings.stop)
      .accessibilityIdentifier("native-e2e.interrupt")
    } else if hasPrompt || showsSendWhenEmpty {
      Button(action: send) {
        Image(systemName: "arrow.up")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(hasPrompt ? Color.white : Color.secondary)
          .frame(width: 32, height: 32)
          .background(
            hasPrompt ? Color.accentColor.opacity(0.78) : Color.secondary.opacity(0.12),
            in: Circle()
          )
      }
      .buttonStyle(.plain)
      .disabled(!hasPrompt || importing || isSending || isResolvingRequest)
      .accessibilityLabel(RichChatStrings.send)
      .accessibilityIdentifier("native-e2e.send")
    } else {
      Color.clear
    }
  }
}

/// Owns the compact/expanded composer transition and keyboard focus. Compact
/// empty, compact populated, and expanded editing remain distinct states just
/// like the mobile PWA instead of sharing one permanently crowded pill.
struct RichChatAdaptiveComposer<Summary: View, Toolbar: View, Trailing: View>: View {
  @Binding var text: String
  @Binding var isExpanded: Bool
  let hasPrompt: Bool
  let hasTrailingAction: Bool
  let submit: () -> Void
  @ViewBuilder let summary: () -> Summary
  @ViewBuilder let toolbar: () -> Toolbar
  @ViewBuilder let trailing: () -> Trailing

  @FocusState private var focused: Bool
  @State private var expandedHasFocused = false

  var body: some View {
    Group {
      if isExpanded {
        PoracodeExpandedComposerSurface {
          editor(lineLimit: 1...6)
            .frame(minHeight: 34, alignment: .topLeading)
        } toolbar: {
          HStack(spacing: 7) {
            toolbar()
            Spacer(minLength: 0)
            trailing()
              .frame(width: 36, height: 36)
          }
        }
      } else {
        PoracodeComposerBar(leadingWidth: 0, trailingWidth: hasTrailingAction ? 36 : 0) {
          EmptyView()
        } content: {
          HStack(spacing: 6) {
            Button {
              isExpanded = true
            } label: {
              Text(hasPrompt ? text : RichChatStrings.message)
                .poracodeChatText(.body)
                .foregroundStyle(hasPrompt ? .primary : .secondary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)
                .padding(.vertical, 7)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(RichChatStrings.message)
            .accessibilityIdentifier("native-e2e.composer-collapsed")
            if !hasPrompt { summary() }
          }
        } trailing: {
          trailing()
        }
      }
    }
    .animation(.snappy(duration: 0.22), value: isExpanded)
    .onChange(of: focused) { _, next in
      if next {
        expandedHasFocused = true
      } else if isExpanded, expandedHasFocused {
        isExpanded = false
      }
    }
    .onChange(of: isExpanded) { _, next in
      if next {
        DispatchQueue.main.async { focused = true }
      } else {
        focused = false
        expandedHasFocused = false
      }
    }
  }

  private func editor(lineLimit: ClosedRange<Int>) -> some View {
    TextField(
      "",
      text: $text,
      prompt: Text(RichChatStrings.message).foregroundStyle(.secondary),
      axis: .vertical
    )
    .poracodeChatText(.body)
    .lineLimit(lineLimit)
    .padding(.horizontal, 4)
    .padding(.vertical, 7)
    .focused($focused)
    .accessibilityLabel(RichChatStrings.message)
    .accessibilityIdentifier("native-e2e.composer")
    .onSubmit(submit)
  }
}
