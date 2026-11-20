import SwiftUI
import UIKit

enum NativeShortcutEvent {
  static func chord(keyCode: Int, characters: String, flags: UIKeyModifierFlags) -> NativeKeyChord? {
    if (0xE0...0xE7).contains(keyCode) { return nil }
    let key: String
    switch keyCode {
    case 0x28: key = "enter"; case 0x29: key = "esc"; case 0x2A: key = "backspace"
    case 0x2B: key = "tab"; case 0x2C: key = "space"; case 0x4A: key = "home"
    case 0x4B: key = "pageup"; case 0x4C: key = "delete"; case 0x4D: key = "end"
    case 0x4E: key = "pagedown"; case 0x4F: key = "right"; case 0x50: key = "left"
    case 0x51: key = "down"; case 0x52: key = "up"
    case 0x3A...0x45: key = "f\(keyCode - 0x3A + 1)"
    case 0x68...0x73: key = "f\(keyCode - 0x68 + 13)"
    default: key = named[characters] ?? characters
    }
    return NativeKeyChord.event(key: key, control: flags.contains(.control), command: flags.contains(.command),
      option: flags.contains(.alternate), shift: flags.contains(.shift))
  }

  private static let named = ["\u{1B}": "esc", "\r": "enter", "\n": "enter", "\t": "tab", " ": "space",
    "\u{7F}": "backspace", "\u{F700}": "up", "\u{F701}": "down", "\u{F702}": "left", "\u{F703}": "right",
    "\u{F728}": "delete", "\u{F729}": "home", "\u{F72B}": "end", "\u{F72C}": "pageup", "\u{F72D}": "pagedown"]
}

struct NativeShortcutCaptureView: UIViewRepresentable {
  let chords: [NativeKeyChord]
  let captured: (NativeKeyChord) -> Void
  let cancelled: () -> Void

  func makeUIView(context: Context) -> CaptureView { CaptureView() }
  func updateUIView(_ view: CaptureView, context: Context) {
    view.chords = chords; view.captured = captured; view.cancelled = cancelled
    if view.window != nil, !view.isFirstResponder {
      DispatchQueue.main.async { [weak view] in
        guard let view, view.window != nil else { return }
        view.becomeFirstResponder()
      }
    }
  }

  static func dismantleUIView(_ view: CaptureView, coordinator: ()) {
    view.captured = nil; view.cancelled = nil
    if view.isFirstResponder { view.resignFirstResponder() }
  }

  final class CaptureView: UIView, NativeCommandFocusProviding {
    var chords: [NativeKeyChord] = []
    var captured: ((NativeKeyChord) -> Void)?
    var cancelled: (() -> Void)?
    private var isFinishing = false
    var nativeCommandFocus: NativeCommandFocus { .init(role: .shortcutCapture) }
    override var canBecomeFirstResponder: Bool { true }

    init() {
      super.init(frame: .zero)
      let label = UILabel()
      label.text = NativeShortcutStrings.recording
      label.font = .preferredFont(forTextStyle: .body)
      label.adjustsFontForContentSizeCategory = true
      label.numberOfLines = 0
      label.textColor = .secondaryLabel
      label.translatesAutoresizingMaskIntoConstraints = false
      addSubview(label)
      NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo: leadingAnchor),
        label.trailingAnchor.constraint(equalTo: trailingAnchor), label.topAnchor.constraint(equalTo: topAnchor),
        label.bottomAnchor.constraint(equalTo: bottomAnchor)])
      isAccessibilityElement = true
      accessibilityLabel = NativeShortcutStrings.recording
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      if window != nil { DispatchQueue.main.async { [weak self] in self?.becomeFirstResponder() } }
    }

    override func becomeFirstResponder() -> Bool {
      let accepted = super.becomeFirstResponder()
      if accepted { notifyNativeCommandFocusChanged() }
      return accepted
    }

    override func resignFirstResponder() -> Bool {
      let accepted = super.resignFirstResponder()
      if accepted { notifyNativeCommandFocusChanged() }
      if accepted, !isFinishing { cancelled?() }
      return accepted
    }

    // Explicit recording is the one surface that consumes existing app and
    // editing shortcuts. This ends as soon as recording ends; it never installs
    // a window-global responder or changes system behavior outside this field.
    override var keyCommands: [UIKeyCommand]? {
      let editing = ["Meta+A", "Meta+B", "Meta+C", "Meta+I", "Meta+U", "Meta+V", "Meta+X", "Meta+Z",
        "Meta+Shift+Z", "Meta+Shift+V", "Meta+Alt+Shift+V", "Esc"].compactMap(NativeKeyChord.init)
      return Set(chords + editing).compactMap { chord in
        guard let command = chord.uiKeyCommand(action: #selector(recordCommand(_:))) else { return nil }
        command.wantsPriorityOverSystemBehavior = true
        return command
      }
    }

    @objc private func recordCommand(_ command: UIKeyCommand) {
      guard let input = command.input,
        let chord = NativeShortcutEvent.chord(keyCode: 0, characters: input, flags: command.modifierFlags)
      else { return }
      finish(chord)
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
      for press in presses {
        if let key = press.key,
          let chord = NativeShortcutEvent.chord(keyCode: key.keyCode.rawValue,
            characters: key.charactersIgnoringModifiers ?? "", flags: key.modifierFlags) {
          finish(chord); return
        }
      }
      super.pressesBegan(presses, with: event)
    }

    private func finish(_ chord: NativeKeyChord) {
      guard !isFinishing else { return }
      isFinishing = true
      defer { isFinishing = false }
      if chord.canonical == "esc" { cancelled?() } else { captured?(chord) }
      resignFirstResponder()
    }
  }
}
