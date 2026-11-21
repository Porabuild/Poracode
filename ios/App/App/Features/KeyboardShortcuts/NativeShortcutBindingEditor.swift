import SwiftUI

struct NativeShortcutBindingEditor: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var store: NativeKeybindingStore
  @Bindable var target: NativeShortcutEditTarget
  @State private var recording = false
  @State private var failure: String?

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField(NativeShortcutStrings.keys, text: $target.rawKey, prompt: Text(NativeShortcutStrings.keyHint))
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .accessibilityIdentifier("native-e2e.keyboard.keys")
          if recording {
            NativeShortcutCaptureView(chords: store.entries.compactMap(\.chord), captured: { chord in
              target.rawKey = chord.editableDisplay; recording = false
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
          } else if !target.rawKey.isEmpty { Text(NativeShortcutStrings.invalidKey).font(.footnote).foregroundStyle(.secondary) }
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
          Button(NativeShortcutStrings.cancel, systemImage: "xmark") { dismiss() }
        }
        if recording {
          ToolbarItem(placement: .bottomBar) {
            Button(NativeShortcutStrings.cancel, systemImage: "xmark") { recording = false }
              .accessibilityIdentifier("native-e2e.keyboard.cancel-recording")
          }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(NativeShortcutStrings.save, systemImage: "checkmark", action: save)
            .disabled(chord?.isAvailableAppShortcut != true || recording || !store.canEdit)
            .accessibilityIdentifier("native-e2e.keyboard.save")
        }
      }
      .poracodeUseKeyboardLayoutGuide()
    }
    .nativeCommands(identity: target.id.uuidString, blocksParentActions: true)
  }

  private var chord: NativeKeyChord? { NativeKeyChord(target.rawKey) }
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
