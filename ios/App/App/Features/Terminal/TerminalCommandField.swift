import SwiftUI
import UIKit

/// Why typing into the terminal is currently impossible.
///
/// The session gate folds scope and connectivity into one `canOperate` flag,
/// but they need different copy: a live transport with a denied operate scope
/// is genuinely read-only, while a lost host connection is an availability
/// problem the status line already explains — the operate grant did not
/// disappear, so claiming "read-only" there is wrong. Writes stay blocked in
/// both cases; only the reason differs.
enum TerminalInputAvailability: Equatable, Sendable {
  case operable
  case readOnly
  case unavailable

  static func resolve(canOperate: Bool, isLive: Bool) -> Self {
    if canOperate, isLive { return .operable }
    return isLive ? .readOnly : .unavailable
  }
}

/// Verbatim terminal command entry.
///
/// SwiftUI's `TextField` cannot turn smart punctuation off — the smart
/// quotes/dash/insert-delete traits are UIKit-only — and a terminal must
/// never rewrite a command. A `UITextView` owns every mutation trait, keeps
/// the default Unicode keyboard so CJK and emoji input and paste work, sends
/// on Return instead of inserting, and grows to four lines before scrolling.
struct TerminalCommandField: UIViewRepresentable {
  @Binding var text: String
  let pointSize: CGFloat
  let isDisabled: Bool
  let accessibilityLabel: String
  let onSubmit: () -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(parent: self)
  }

  func makeUIView(context: Context) -> TerminalCommandTextView {
    let view = TerminalCommandTextView()
    view.accessibilityLabel = accessibilityLabel
    view.font = TerminalTextAttributes.font(pointSize: pointSize)
    view.isEditable = !isDisabled
    view.alpha = isDisabled ? 0.55 : 1
    view.text = text
    view.delegate = context.coordinator
    return view
  }

  func updateUIView(_ view: TerminalCommandTextView, context: Context) {
    context.coordinator.parent = self
    view.accessibilityLabel = accessibilityLabel
    if view.font?.pointSize != pointSize {
      view.font = TerminalTextAttributes.font(pointSize: pointSize)
      view.invalidateIntrinsicContentSize()
    }
    let editable = !isDisabled
    if view.isEditable != editable {
      view.isEditable = editable
      if !editable, view.isFirstResponder { view.resignFirstResponder() }
    }
    view.alpha = isDisabled ? 0.55 : 1
    // Only rewrite when the binding differs, so a re-render can never move
    // the cursor mid-command.
    if view.text != text {
      view.text = text
      view.invalidateIntrinsicContentSize()
    }
  }

  func sizeThatFits(
    _ proposal: ProposedViewSize,
    uiView: TerminalCommandTextView,
    context: Context
  ) -> CGSize? {
    let width = proposal.width ?? uiView.bounds.width
    guard width.isFinite, width > 0 else { return nil }
    let fitted = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    return CGSize(
      width: width,
      height: TerminalCommandFieldLayout.height(
        fitted: fitted.height,
        lineHeight: uiView.font?.lineHeight ?? 0
      )
    )
  }

  final class Coordinator: NSObject, UITextViewDelegate {
    var parent: TerminalCommandField

    init(parent: TerminalCommandField) {
      self.parent = parent
    }

    func textViewDidChange(_ textView: UITextView) {
      textView.invalidateIntrinsicContentSize()
      // Written through verbatim: no trimming, no normalisation.
      parent.text = textView.text ?? ""
    }

    func textView(
      _ textView: UITextView,
      shouldChangeTextIn range: NSRange,
      replacementText text: String
    ) -> Bool {
      guard text == "\n" else { return true }
      // Only an intentional Return sends. Mid-composition the key belongs to
      // the IME, a pasted newline is content and must insert, and a disabled
      // field has no sender.
      if textView.markedTextRange != nil { return true }
      if (textView as? TerminalCommandTextView)?.isPasting == true { return true }
      guard !parent.isDisabled else { return true }
      parent.onSubmit()
      return false
    }
  }
}

/// The terminal input's `UITextView`: verbatim-entry traits in `init`, a
/// paste path that inserts synchronously under an intent flag (both a Return
/// keypress and a paste reach the delegate as a `"\n"` replacement — only
/// the flag tells them apart), and an intrinsic height that follows wrapped
/// content.
final class TerminalCommandTextView: UITextView {
  var isPasting = false

  override init(frame: CGRect, textContainer: NSTextContainer?) {
    super.init(frame: frame, textContainer: textContainer)
    backgroundColor = .clear
    overrideUserInterfaceStyle = .dark
    keyboardAppearance = .dark
    textColor = .label
    isSelectable = true
    alwaysBounceVertical = false
    textContainerInset = UIEdgeInsets(
      top: TerminalCommandFieldLayout.verticalInset,
      left: 0,
      bottom: TerminalCommandFieldLayout.verticalInset,
      right: 0
    )
    self.textContainer.lineFragmentPadding = 0
    smartQuotesType = .no
    smartDashesType = .no
    smartInsertDeleteType = .no
    autocorrectionType = .no
    spellCheckingType = .no
    autocapitalizationType = .none
    returnKeyType = .send
    enablesReturnKeyAutomatically = true
    isAccessibilityElement = true
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  /// Plain-text pastes are read here — inside the user's explicit paste
  /// action only — and inserted synchronously, so UIKit's asynchronous paste
  /// pipeline can never deliver a newline after an intent flag resets.
  /// Non-text items fall back to UIKit's default pipeline.
  override func paste(_ sender: Any?) {
    guard let text = UIPasteboard.general.string else {
      super.paste(sender)
      return
    }
    asPasteIntent { insertText(text) }
  }

  private func asPasteIntent(_ insert: () -> Void) {
    let wasPasting = isPasting
    isPasting = true
    insert()
    isPasting = wasPasting
  }

  override var intrinsicContentSize: CGSize {
    let fitted = sizeThatFits(CGSize(width: bounds.width, height: .greatestFiniteMagnitude))
    return CGSize(
      width: UIView.noIntrinsicMetric,
      height: TerminalCommandFieldLayout.height(
        fitted: fitted.height,
        lineHeight: font?.lineHeight ?? 0
      )
    )
  }
}

enum TerminalCommandFieldLayout {
  static let maximumLines = 4
  static let verticalInset: CGFloat = 6

  /// Whole lines only: one line at rest, growing with wrapped content up to
  /// `maximumLines`, after which the text view scrolls.
  static func height(fitted: CGFloat, lineHeight: CGFloat) -> CGFloat {
    let insets = verticalInset * 2
    guard lineHeight > 0 else { return max(fitted, insets) }
    let lineCount = max(1, ((fitted - insets) / lineHeight).rounded(.up))
    return min(CGFloat(maximumLines), lineCount) * lineHeight + insets
  }
}
