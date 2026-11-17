import SwiftUI

struct NativeShortcutBindingEditor: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var store: NativeKeybindingStore
  let target: NativeShortcutEditTarget
  @State private var rawKey: String
  @State private var recording = false
  @State private var failure: String?

  init(store: NativeKeybindingStore, target: NativeShortcutEditTarget) {
    self.store = store; self.target = target
    _rawKey = State(initialValue: target.original?.chord?.editableDisplay ?? target.original?.rawChord ?? "")
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField(NativeShortcutStrings.keys, text: $rawKey, prompt: Text(NativeShortcutStrings.keyHint))
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .accessibilityIdentifier("native-e2e.keyboard.keys")
          if recording {
            NativeShortcutCaptureView(chords: store.entries.compactMap(\.chord), captured: { chord in
              rawKey = chord.editableDisplay; recording = false
            }, cancelled: { recording = false })
              .frame(minHeight: 64)
              .accessibilityIdentifier("native-e2e.keyboard.capture")
          } else {
            Button(NativeShortcutStrings.record, systemImage: "keyboard") { recording = true }
              .buttonStyle(.plain)
              .accessibilityIdentifier("native-e2e.keyboard.record")
          }
          if let chord, chord.keyboardShortcut != nil {
            Text(chord.nativeDisplay).font(.title3.monospaced())
            if !chord.isAvailableAppShortcut { Text(NativeShortcutStrings.systemReserved).font(.footnote).foregroundStyle(.secondary) }
          } else if !rawKey.isEmpty { Text(NativeShortcutStrings.invalidKey).font(.footnote).foregroundStyle(.secondary) }
        }
        if let conflict {
          Section {
            Label {
              Text(NativeShortcutStrings.conflict + ": " + NativeShortcutStrings.commandTitle(conflict))
            } icon: { Image(systemName: "exclamationmark.triangle").foregroundStyle(.orange) }
          }
        }
        if let condition = target.condition {
          Section {
            DisclosureGroup(NativeShortcutStrings.details) { Text(condition).font(.caption.monospaced()).foregroundStyle(.secondary) }
          }
        }
        if let failure { Section { Text(failure).font(.footnote).foregroundStyle(.red) } }
      }
      .navigationTitle(NativeShortcutStrings.commandTitle(target.command))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(NativeShortcutStrings.cancel) { dismiss() }
        }
      }
      .poracodeBottomBar {
        PoracodeBottomActionBar {
          if recording {
            PoracodeCircleButton { recording = false } label: { Image(systemName: "xmark") }
              .accessibilityLabel(NativeShortcutStrings.cancel)
              .accessibilityIdentifier("native-e2e.keyboard.cancel-recording")
          }
        } trailing: {
          PoracodeCircleButton(action: save) { Image(systemName: "checkmark") }
            .disabled(chord?.isAvailableAppShortcut != true || recording || !store.canEdit)
            .accessibilityLabel(NativeShortcutStrings.save)
            .accessibilityIdentifier("native-e2e.keyboard.save")
        }
      }
      .poracodeUseKeyboardLayoutGuide()
    }
    .nativeCommands(identity: target.id.uuidString, blocksParentActions: true)
  }

  private var chord: NativeKeyChord? { NativeKeyChord(rawKey) }
  private var conflict: String? { chord.flatMap { store.conflict(for: $0, excluding: target.command) } }

  private func save() {
    guard let chord, chord.isAvailableAppShortcut else { return }
    do {
      if let index = target.index, let original = target.original {
        try store.replace(at: index, with: chord, expected: original)
      } else {
        try store.append(command: target.command, chord: chord, condition: target.condition)
      }
      dismiss()
    } catch { failure = NativeShortcutStrings.changed }
  }
}
