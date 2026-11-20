import SwiftUI

struct HomeShortcutSettingsView: View {
  @AppStorage(HomeShortcutPreferences.storageKey) private var storageValue =
    HomeShortcutPreferences.defaultStorageValue
  @State private var editMode: EditMode = .inactive

  var body: some View {
    List {
      Section {
        ForEach(preferences.order) { shortcut in
          Toggle(isOn: visibilityBinding(for: shortcut)) {
            Label(shortcut.title, systemImage: shortcut.systemImage)
          }
          .poracodeSwitchStyle()
          .accessibilityIdentifier("native-e2e.shortcuts.toggle.\(shortcut.rawValue)")
        }
        .onMove(perform: move)
      } footer: {
        Text(SettingsUIStrings.homeShortcutsDescription)
      }
    }
    .environment(\.editMode, $editMode)
    .accessibilityIdentifier("native-e2e.shortcuts.list")
    .navigationTitle(SettingsUIStrings.homeShortcuts)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItemGroup(placement: .bottomBar) {
        PoracodeToolbarMenu(title: SettingsUIStrings.shortcutVisibility, systemImage: "checklist") {
          Button(SettingsUIStrings.showAllShortcuts, systemImage: "eye") { setAllVisible(true) }
            .disabled(preferences.hidden.isEmpty)
          Button(SettingsUIStrings.hideAllShortcuts, systemImage: "eye.slash") { setAllVisible(false) }
            .disabled(preferences.visible.isEmpty)
        }
        .accessibilityIdentifier("native-e2e.shortcuts.visibility")

        Button(
          editMode.isEditing ? SettingsUIStrings.done : SettingsUIStrings.edit,
          systemImage: editMode.isEditing ? "checkmark" : "arrow.up.arrow.down"
        ) {
          withAnimation { editMode = editMode.isEditing ? .inactive : .active }
        }
        .accessibilityIdentifier("native-e2e.shortcuts.edit")
      }
    }
  }

  private var preferences: HomeShortcutPreferences {
    HomeShortcutPreferences(storageValue: storageValue)
  }

  private func setAllVisible(_ visible: Bool) {
    var updated = preferences
    updated.setAllVisible(visible)
    storageValue = updated.encoded
  }

  private func visibilityBinding(for shortcut: HomeShortcutID) -> Binding<Bool> {
    Binding(
      get: { !preferences.hidden.contains(shortcut) },
      set: { visible in
        var updated = preferences
        updated.setVisible(visible, for: shortcut)
        storageValue = updated.encoded
      }
    )
  }

  private func move(fromOffsets: IndexSet, toOffset: Int) {
    var updated = preferences
    updated.move(fromOffsets: fromOffsets, toOffset: toOffset)
    storageValue = updated.encoded
  }
}
