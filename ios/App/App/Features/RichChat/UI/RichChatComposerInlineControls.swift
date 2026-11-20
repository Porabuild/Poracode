import SwiftUI
import UIKit

/// The empty composer's resume for a cut-off turn: its spoken label and action.
struct RichChatComposerResumeAction {
  let label: String
  let perform: () -> Void
}

struct RichChatComposerTrailingAction: View {
  let hasPrompt: Bool
  let isTurnActive: Bool
  let isSending: Bool
  let showsSendWhenEmpty: Bool
  let importing: Bool
  let isResolvingRequest: Bool
  var queue: (() -> Void)?
  /// Replaces the empty composer's send button for a cut-off turn.
  var resume: RichChatComposerResumeAction? = nil
  let interrupt: () -> Void
  let send: () -> Void

  @Environment(\.poracodeAccent) private var accent

  @ViewBuilder
  var body: some View {
    if (isTurnActive || isSending) && !hasPrompt {
      Button(action: interrupt) {
        Image(systemName: "stop.fill")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(.primary)
          .frame(width: 32, height: 32)
          .background(Color.secondary.opacity(0.16), in: Circle())
          .frame(width: 44, height: 44)
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(RichChatStrings.stop)
      .accessibilityIdentifier("native-e2e.interrupt")
    } else if !hasPrompt, let resume {
      // A turn cut off by an error or a restart is picked back up from the
      // empty composer, so nobody has to type "continue".
      Button(action: resume.perform) {
        Image(systemName: "play.fill")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(Color.primary)
          .frame(width: 32, height: 32)
          .background(accent.opacity(0.2), in: Circle())
          .frame(width: 44, height: 44)
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .disabled(importing || isResolvingRequest)
      .accessibilityLabel(resume.label)
      .accessibilityIdentifier("native-e2e.resume")
    } else if hasPrompt || showsSendWhenEmpty {
      // While a turn is active the plain tap steers (desktop default); a
      // long-press menu offers queueing the same draft as a follow-up — one
      // control, two explicit choices, no accidental double submission.
      if isTurnActive && hasPrompt, let queue {
        sendButton.contextMenu {
          Button {
            queue()
          } label: {
            Label(RichChatStrings.queueSendAction, systemImage: "arrow.triangle.branch")
          }
        }
      } else {
        sendButton
      }
    } else {
      Color.clear
    }
  }

  private var sendButton: some View {
    Button(action: send) {
      Image(systemName: "arrow.up")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(hasPrompt ? Color.primary : Color.poracodeSecondaryLabel)
        .frame(width: 32, height: 32)
        .background(
          hasPrompt ? accent.opacity(0.2) : Color.secondary.opacity(0.12),
          in: Circle()
        )
        .frame(width: 44, height: 44)
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .disabled(!hasPrompt || importing || isSending || isResolvingRequest)
    .accessibilityLabel(RichChatStrings.send)
    .accessibilityIdentifier("native-e2e.send")
  }
}

/// Owns the compact/expanded composer transition and keyboard focus. Compact
/// empty, compact populated, and expanded editing remain distinct states just
/// like the mobile PWA instead of sharing one permanently crowded pill.
struct RichChatAdaptiveComposer<Summary: View, Leading: View, Configuration: View, Voice: View, Trailing: View>: View {
  @Binding var text: String
  @Binding var selection: NSRange?
  @Binding var isExpanded: Bool
  var controlsVisible = false
  var keyboardOwnerID: UUID? = nil
  var keyboardFocusRequest: UInt64 = 0
  let hasPrompt: Bool
  let hasTrailingAction: Bool
  var placeholder: String = RichChatStrings.message
  let submit: () -> Void
  @ViewBuilder let summary: () -> Summary
  @ViewBuilder let leading: () -> Leading
  @ViewBuilder let configuration: () -> Configuration
  @ViewBuilder let voice: () -> Voice
  @ViewBuilder let trailing: () -> Trailing

  /// Plain state, not `@FocusState`: the editor is a UIKit text view, so no
  /// SwiftUI view is bound to a focus state. The text view owns first responder.
  @State private var focused = false
  @AppStorage(PoracodeChatTextSize.storageKey) private var storedTextSize = PoracodeChatTextSize.defaultValue

  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Environment(\.poracodeComposerAvailableHeight) private var keyboardAvailableHeight
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    PoracodeAdaptiveComposerSurface(
      isExpanded: isExpanded, leadingPadding: horizontalSizeClass == .regular ? 16 : 12
    ) {
      if isExpanded {
        VStack(alignment: .leading, spacing: 8) {
          HStack(alignment: .top, spacing: 4) {
            editor(lineLimit: 1...(keyboardAvailableHeight > 0 && keyboardAvailableHeight < 380 ? 2 : 6))
              .frame(maxWidth: .infinity, minHeight: 34, alignment: .topLeading)
            collapseButton
          }
          expandedControls
        }
        .transition(.opacity)
      } else {
        HStack(spacing: 8) {
          if hasPrompt {
            Button { isExpanded = true } label: {
              Text(text)
                .poracodeChatText(.body)
                .foregroundStyle(.primary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.leading, 4)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(placeholder)
            .accessibilityValue(text)
            .accessibilityIdentifier("native-e2e.composer-collapsed")
          } else {
            summary().frame(maxWidth: .infinity)
          }
          if hasTrailingAction { trailing().frame(width: 44, height: 44) }
        }
        .transition(.opacity)
      }
    }
    .preference(key: PoracodeComposerFocusPreferenceKey.self, value: isExpanded && focused && !controlsVisible)
    .animation(reduceMotion ? nil : .smooth(duration: 0.25), value: isExpanded)
    .onChange(of: controlsVisible) { _, visible in if visible { focused = false } }
    .onChange(of: keyboardFocusRequest) { _, _ in
      if isExpanded && !controlsVisible { focused = true }
    }
    .task(id: isExpanded) {
      if isExpanded && !controlsVisible {
        await Task.yield()
        if !Task.isCancelled { focused = true }
      } else {
        focused = false
      }
    }
  }

  private var expandedControls: some View {
    PoracodeComposerControls(leading: leading, configuration: configuration, voice: voice, trailing: trailing)
  }

  private var collapseButton: some View {
    Button {
      focused = false
      isExpanded = false
    } label: {
      Image(systemName: "chevron.down")
        .font(.subheadline)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .foregroundStyle(.secondary)
    .accessibilityLabel(RichChatStrings.hideDetails)
    .accessibilityIdentifier("native-e2e.composer-collapse")
  }

  private func editor(lineLimit: ClosedRange<Int>) -> some View {
    RichChatComposerTextInput(
      text: $text,
      selection: $selection,
      focused: $focused,
      lineLimit: lineLimit,
      placeholder: placeholder,
      pointSize: PoracodeChatTextRole.body.pointSize(for: storedTextSize),
      submit: submit,
      keyboardOwnerID: keyboardOwnerID
    )
    .padding(.horizontal, 4)
    .padding(.vertical, 7)
    .accessibilityLabel(placeholder)
    .accessibilityIdentifier("native-e2e.composer")
  }
}

struct RichChatComposerTextInput: UIViewRepresentable {
  @Environment(\.poracodeTheme) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Binding var text: String
  @Binding var selection: NSRange?
  @Binding var focused: Bool
  let lineLimit: ClosedRange<Int>
  let placeholder: String
  var pointSize: CGFloat = 17
  var submit: (() -> Void)?
  var keyboardOwnerID: UUID? = nil

  static func makeEditor(pointSize: CGFloat) -> RichChatComposerTextView {
    let view = RichChatComposerTextView()
    view.backgroundColor = .clear
    view.font = UIFontMetrics(forTextStyle: .body).scaledFont(for: .systemFont(ofSize: pointSize))
    view.adjustsFontForContentSizeCategory = true
    view.textContainerInset = .zero
    view.textContainer.lineFragmentPadding = 0
    // SwiftUI owns the measured height; UIKit keeps the caret visible once
    // that viewport reaches its line limit. Disabling scrolling clips edits.
    view.isScrollEnabled = true
    view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    return view
  }

  func makeUIView(context: Context) -> RichChatComposerTextView {
    context.coordinator.updating = true
    defer { context.coordinator.updating = false }
    let view = Self.makeEditor(pointSize: pointSize)
    view.delegate = context.coordinator
    view.accessibilityLabel = placeholder
    view.text = text
    view.keyboardOwnerID = keyboardOwnerID
    let label = UILabel()
    label.text = placeholder
    label.isHidden = !text.isEmpty
    label.font = view.font
    label.textColor = .placeholderText
    label.isAccessibilityElement = false
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      label.topAnchor.constraint(equalTo: view.topAnchor),
      label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor),
    ])
    context.coordinator.placeholder = label
    Self.applyPalette(theme.variant(for: colorScheme), to: view, placeholder: label)
    return view
  }

  func updateUIView(_ view: RichChatComposerTextView, context: Context) {
    // Observe render dependencies here; apply their live values after the graph update.
    _ = (text, selection, focused)
    context.coordinator.owner = self
    context.coordinator.updating = true
    defer { context.coordinator.updating = false }
    view.submit = submit
    if view.keyboardOwnerID != keyboardOwnerID {
      view.keyboardOwnerID = keyboardOwnerID
      if view.isFirstResponder { view.notifyNativeCommandFocusChanged() }
    }
    let font = UIFontMetrics(forTextStyle: .body).scaledFont(for: .systemFont(ofSize: pointSize))
    if view.font != font { view.font = font }
    context.coordinator.placeholder?.font = font
    context.coordinator.placeholder?.text = placeholder
    Self.applyPalette(theme.variant(for: colorScheme), to: view, placeholder: context.coordinator.placeholder)
    context.coordinator.scheduleViewUpdate(view)
  }

  static func applyPalette(_ palette: PoracodeThemeVariant, to view: RichChatComposerTextView, placeholder: UILabel?) {
    view.textColor = UIColor(palette.foreground)
    placeholder?.textColor = palette.mutedHex.map { UIColor(Color(poracodeHex: $0)) } ?? .placeholderText
  }

  static func dismantleUIView(_ view: RichChatComposerTextView, coordinator: Coordinator) {
    coordinator.isMounted = false
    view.delegate = nil
    DispatchQueue.main.async { [weak view] in
      if let view, view.isFirstResponder { view.resignFirstResponder() }
    }
  }

  func sizeThatFits(_ proposal: ProposedViewSize, uiView: RichChatComposerTextView, context: Context) -> CGSize? {
    guard let width = proposal.width else { return nil }
    let lineHeight = uiView.font?.lineHeight ?? 22
    let height = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height
    let maxHeight = lineHeight * CGFloat(lineLimit.upperBound)
    return CGSize(width: width, height: min(max(height, lineHeight * CGFloat(lineLimit.lowerBound)), maxHeight))
  }

  func makeCoordinator() -> Coordinator { Coordinator(owner: self) }

  final class Coordinator: NSObject, UITextViewDelegate {
    var owner: RichChatComposerTextInput
    weak var placeholder: UILabel?
    var updating = false
    var isMounted = true
    private var viewUpdateScheduled = false
    init(owner: RichChatComposerTextInput) { self.owner = owner }

    func scheduleViewUpdate(_ view: RichChatComposerTextView) {
      guard !viewUpdateScheduled else { return }
      viewUpdateScheduled = true
      // Bindings read during updateUIView can be an older graph snapshot.
      // Read the latest values after the transaction, before changing UIKit.
      // Focus lookup must also stay outside that graph transaction.
      DispatchQueue.main.async { [weak self, weak view] in
        guard let self else { return }
        self.viewUpdateScheduled = false
        guard self.isMounted, let view else { return }
        let text = self.owner.text
        let selection = self.owner.selection
        self.updating = true
        if view.text != text {
          view.text = text
          view.invalidateIntrinsicContentSize()
        }
        self.placeholder?.isHidden = !text.isEmpty
        if let selection, NSMaxRange(selection) <= view.text.utf16.count,
          view.selectedRange != selection {
          view.selectedRange = selection
        }
        self.updating = false
        if self.owner.focused {
          if view.window != nil && !view.isFirstResponder { view.becomeFirstResponder() }
        } else if view.isFirstResponder {
          view.resignFirstResponder()
        }
      }
    }

    func textViewDidChange(_ textView: UITextView) {
      guard isMounted, !updating else { return }
      let text = textView.text ?? ""
      let selection = textView.selectedRange
      if owner.text != text { owner.text = text }
      if owner.selection != selection { owner.selection = selection }
      placeholder?.isHidden = !text.isEmpty
    }

    func textViewDidChangeSelection(_ textView: UITextView) {
      guard !updating else { return }
      // UIKit may report the new caret before textViewDidChange. Publishing
      // only that caret can render the previous model text back over the edit.
      textViewDidChange(textView)
    }

    func textViewDidBeginEditing(_ textView: UITextView) {
      guard isMounted else { return }
      if !owner.focused { owner.focused = true }
    }
    func textViewDidEndEditing(_ textView: UITextView) {
      guard isMounted else { return }
      if owner.focused { owner.focused = false }
    }
  }
}

final class RichChatComposerTextView: NativeFocusReportingTextView {
  var submit: (() -> Void)?
  var keyboardOwnerID: UUID?


  override var keyCommands: [UIKeyCommand]? {
    guard submit != nil, markedTextRange == nil else { return super.keyCommands }
    let command = UIKeyCommand(input: "\r", modifierFlags: [], action: #selector(submitPrompt))
    command.wantsPriorityOverSystemBehavior = true
    return [command] + (super.keyCommands ?? [])
  }

  @objc private func submitPrompt() { submit?() }
}
