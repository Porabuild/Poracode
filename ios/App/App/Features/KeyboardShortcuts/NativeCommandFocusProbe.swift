import SwiftUI
import UIKit
import Combine

private struct NativeCommandFocusKey: FocusedValueKey { typealias Value = NativeCommandFocus }
extension FocusedValues {
  var nativeCommandFocus: NativeCommandFocus? {
    get { self[NativeCommandFocusKey.self] }
    set { self[NativeCommandFocusKey.self] = newValue }
  }
}

/// UIKit bridges report their semantic role; ordinary text fields keep their
/// system editing behavior. This probe never becomes or replaces a responder.
@MainActor protocol NativeCommandFocusProviding: AnyObject {
  var nativeCommandFocus: NativeCommandFocus { get }
}

struct NativeCommandFocusProbe: UIViewRepresentable {
  let registry: NativeCommandRegistry

  func makeUIView(context: Context) -> ProbeView { ProbeView(registry: registry) }
  func updateUIView(_ view: ProbeView, context: Context) { view.registry = registry }

  final class ProbeView: UIView {
    weak var registry: NativeCommandRegistry?
    private var observers = Set<AnyCancellable>()

    init(registry: NativeCommandRegistry) {
      self.registry = registry
      super.init(frame: .zero)
      isUserInteractionEnabled = false
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      observers.removeAll()
      guard window != nil else { return }
      for name in [UITextField.textDidBeginEditingNotification, UITextField.textDidEndEditingNotification,
        UITextView.textDidBeginEditingNotification, UITextView.textDidEndEditingNotification,
        UIWindow.didBecomeKeyNotification, UIWindow.didResignKeyNotification, NativeInputFocusChanges.changed] {
        NotificationCenter.default.publisher(for: name).sink { [weak self] _ in
          Task { @MainActor [weak self] in self?.refresh() }
        }.store(in: &observers)
      }
      refresh()
    }

    private func refresh() {
      guard let window, window.isKeyWindow else { return }
      guard let responder = Self.firstResponder(in: window) else {
        registry?.focus = NativeCommandFocus()
        return
      }
      var ancestor: UIView? = responder
      while let view = ancestor {
        if let provider = view as? any NativeCommandFocusProviding {
          registry?.focus = provider.nativeCommandFocus
          return
        }
        ancestor = view.superview
      }
      registry?.focus = NativeCommandFocus(role: .input,
        isTextInput: responder is UITextField || responder is UITextView)
    }

    private static func firstResponder(in view: UIView) -> UIView? {
      if view.isFirstResponder { return view }
      for child in view.subviews {
        if let responder = firstResponder(in: child) { return responder }
      }
      return nil
    }

  }
}

extension RichChatComposerTextView: NativeCommandFocusProviding {
  var nativeCommandFocus: NativeCommandFocus { .init(role: .composer, isTextInput: true, ownerID: keyboardOwnerID) }
}
extension TerminalCommandTextView: NativeCommandFocusProviding {
  var nativeCommandFocus: NativeCommandFocus { .init(role: .terminal, isTextInput: true) }
}
extension TerminalTranscriptView: NativeCommandFocusProviding {
  var nativeCommandFocus: NativeCommandFocus { .init(role: .terminal, isTextInput: true) }
}
extension BrowserMirrorKeyInputView: NativeCommandFocusProviding {
  var nativeCommandFocus: NativeCommandFocus { .init(role: .browser, isTextInput: true) }
}
