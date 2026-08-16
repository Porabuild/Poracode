#if canImport(SwiftUI) && canImport(UIKit)
  import SwiftUI
  import UIKit

  struct BrowserMirrorKeyboardProxy: UIViewRepresentable {
    let accessibilityLabel: String
    let insertText: (String) -> Void
    let sendKey: (BrowserMirrorSafeKey) -> Void

    func makeUIView(context _: Context) -> BrowserMirrorKeyInputView {
      let view = BrowserMirrorKeyInputView()
      view.onInsertText = insertText
      view.onKey = sendKey
      view.accessibilityLabel = accessibilityLabel
      return view
    }

    func updateUIView(_ view: BrowserMirrorKeyInputView, context _: Context) {
      view.onInsertText = insertText
      view.onKey = sendKey
      view.accessibilityLabel = accessibilityLabel
    }
  }

  final class BrowserMirrorKeyInputView: UIView, UIKeyInput {
    var onInsertText: ((String) -> Void)?
    var onKey: ((BrowserMirrorSafeKey) -> Void)?

    override var canBecomeFirstResponder: Bool { true }
    var hasText: Bool { true }

    override init(frame: CGRect) {
      super.init(frame: frame)
      isAccessibilityElement = true
      accessibilityTraits = .keyboardKey
      backgroundColor = UIColor.secondarySystemFill
      layer.cornerRadius = 9

      let image = UIImageView(image: UIImage(systemName: "keyboard"))
      image.tintColor = .label
      image.contentMode = .scaleAspectFit
      image.translatesAutoresizingMaskIntoConstraints = false
      addSubview(image)
      NSLayoutConstraint.activate([
        image.centerXAnchor.constraint(equalTo: centerXAnchor),
        image.centerYAnchor.constraint(equalTo: centerYAnchor),
        image.widthAnchor.constraint(equalToConstant: 21),
        image.heightAnchor.constraint(equalToConstant: 21),
      ])
      addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(focus)))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
      fatalError()
    }

    func insertText(_ text: String) {
      switch text {
      case "\n", "\r": onKey?(.enter)
      case "\t": onKey?(.tab)
      case "\u{1B}": onKey?(.escape)
      default: onInsertText?(text)
      }
    }

    func deleteBackward() {
      onKey?(.backspace)
    }

    override var keyCommands: [UIKeyCommand]? {
      [
        UIKeyCommand(
          input: UIKeyCommand.inputUpArrow,
          modifierFlags: [],
          action: #selector(arrowUp)
        ),
        UIKeyCommand(
          input: UIKeyCommand.inputDownArrow,
          modifierFlags: [],
          action: #selector(arrowDown)
        ),
        UIKeyCommand(
          input: UIKeyCommand.inputLeftArrow,
          modifierFlags: [],
          action: #selector(arrowLeft)
        ),
        UIKeyCommand(
          input: UIKeyCommand.inputRightArrow,
          modifierFlags: [],
          action: #selector(arrowRight)
        ),
        UIKeyCommand(input: "\u{1B}", modifierFlags: [], action: #selector(escape)),
      ]
    }

    @objc private func focus() {
      becomeFirstResponder()
    }

    @objc private func arrowUp() { onKey?(.arrowUp) }
    @objc private func arrowDown() { onKey?(.arrowDown) }
    @objc private func arrowLeft() { onKey?(.arrowLeft) }
    @objc private func arrowRight() { onKey?(.arrowRight) }
    @objc private func escape() { onKey?(.escape) }
  }
#endif
