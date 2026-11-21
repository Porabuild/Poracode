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

    override func becomeFirstResponder() -> Bool {
      let accepted = super.becomeFirstResponder()
      if accepted { notifyNativeCommandFocusChanged() }
      return accepted
    }

    override func resignFirstResponder() -> Bool {
      let accepted = super.resignFirstResponder()
      if accepted { notifyNativeCommandFocusChanged() }
      return accepted
    }

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

  struct BrowserMirrorAddressField: UIViewRepresentable {
    @Binding var text: String
    @Binding var isFocused: Bool
    let onSubmit: () -> Void
    @Environment(\.nativeCommandRegistry) private var registry

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIView(context: Context) -> AddressTextField {
      let field = AddressTextField()
      field.font = .preferredFont(forTextStyle: .body)
      field.adjustsFontForContentSizeCategory = true
      field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
      field.autocapitalizationType = .none
      field.autocorrectionType = .no
      field.keyboardType = .URL
      field.returnKeyType = .go
      field.delegate = context.coordinator
      field.addTarget(context.coordinator, action: #selector(Coordinator.editingChanged(_:)), for: .editingChanged)
      return field
    }

    func updateUIView(_ field: AddressTextField, context: Context) {
      context.coordinator.parent = self
      field.registry = registry
      field.placeholder = BrowserMirrorStrings.address
      field.accessibilityLabel = BrowserMirrorStrings.address
      if field.text != text { field.text = text }
      if isFocused != field.isFirstResponder {
        Task { @MainActor [weak field, weak coordinator = context.coordinator] in
          guard let field, let coordinator, field.window != nil else { return }
          if coordinator.parent.isFocused { field.becomeFirstResponder() }
          else { field.resignFirstResponder() }
        }
      }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView field: AddressTextField, context: Context) -> CGSize? {
      guard let width = proposal.width, width.isFinite else { return nil }
      let height = max(44, field.intrinsicContentSize.height, field.font?.lineHeight ?? 0)
      return CGSize(width: width, height: height)
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
      var parent: BrowserMirrorAddressField
      init(parent: BrowserMirrorAddressField) { self.parent = parent }

      @objc func editingChanged(_ field: UITextField) { parent.text = field.text ?? "" }
      func textFieldDidBeginEditing(_ field: UITextField) { parent.isFocused = true }
      func textFieldDidEndEditing(_ field: UITextField) { parent.isFocused = false }
      func textFieldShouldReturn(_ field: UITextField) -> Bool {
        if field.markedTextRange == nil { parent.onSubmit() }
        return false
      }
    }

    final class AddressTextField: UITextField, NativeCommandFocusProviding {
      weak var registry: NativeCommandRegistry?
      var nativeCommandFocus: NativeCommandFocus { .init(role: .browser, isTextInput: true) }

      override var keyCommands: [UIKeyCommand]? {
        guard isFirstResponder, markedTextRange == nil, let registry else { return super.keyCommands }
        let commands = registry.activeBindings(focus: nativeCommandFocus).compactMap { binding -> UIKeyCommand? in
          guard binding.command == "browser.tab.new",
            let command = binding.chord.uiKeyCommand(action: #selector(createTab(_:))) else { return nil }
          command.discoverabilityTitle = NativeShortcutStrings.commandTitle(binding.command)
          command.wantsPriorityOverSystemBehavior = true
          return command
        }
        return commands + (super.keyCommands ?? [])
      }

      @objc private func createTab(_ command: UIKeyCommand) {
        guard isFirstResponder, markedTextRange == nil, let registry, let input = command.input,
          let chord = NativeShortcutEvent.chord(keyCode: 0, characters: input, flags: command.modifierFlags),
          registry.activeBindings(focus: nativeCommandFocus).contains(where: { $0.chord == chord && $0.command == "browser.tab.new" })
        else { return }
        registry.perform(chord: chord, focusOverride: nativeCommandFocus)
      }
    }
  }
#endif
