import SwiftUI

struct CustomThemeEditorView: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var colorScheme
  @Bindable var store: CustomThemeStore
  private let id: String
  @State private var draft: CustomThemeDocument
  @State private var mode = "light"
  @State private var saveFailure: CustomThemeFailure?
  @State private var exportFile: CustomThemeFile?
  @State private var exporting = false
  @State private var exportError: String?

  init(initial: NativeCustomTheme, store: CustomThemeStore) {
    id = initial.id; self.store = store; _draft = State(initialValue: initial.document)
  }

  private var valid: Bool { (try? draft.validate()) != nil }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        List {
          Section {
            TextField(text: $draft.label) { CustomThemeStrings.text("Theme name") }
              .accessibilityIdentifier("native-e2e.theme.name")
              .onChange(of: draft.label) { _, value in
                if value.unicodeScalars.count > 80 {
                  draft.label = String(String.UnicodeScalarView(value.unicodeScalars.prefix(80)))
                }
              }
            Picker(selection: $mode) {
              CustomThemeStrings.text("Light").tag("light")
              CustomThemeStrings.text("Dark").tag("dark")
            } label: { CustomThemeStrings.text("Palette mode") }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("native-e2e.theme.mode")
            CustomThemePreview(document: draft)
              .opacity(valid ? 1 : 0)
              .accessibilityHidden(!valid)
          }
          CustomThemePaletteForm(palette: mode == "dark" ? $draft.dark : $draft.light, mode: mode)
          Section { CustomThemeContrastView(document: draft) }
          if !valid {
            Section { CustomThemeStrings.text("Enter a theme name and valid hex colors in both palettes.")
              .foregroundStyle(.red).accessibilityIdentifier("native-e2e.theme.validation-error") }
          }
          if let saveFailure {
            Section {
              CustomThemeStrings.text(saveFailure == .limitReached
                ? "The custom theme limit has been reached. Delete a theme before adding another."
                : "Saved themes could not be read. Existing data has been kept.").foregroundStyle(.red)
            }
          }
          if let exportError { Section { Text(verbatim: exportError).foregroundStyle(.red) } }
        }
        .listStyle(.insetGrouped)
        .poracodeReadableListMargins(740)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .navigationTitle(CustomThemeStrings.text("Custom theme"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { CustomThemeStrings.text("Cancel") } } }
      .poracodeBottomBar {
        PoracodeBottomActionBar {
          PoracodeCircleButton(action: beginExport) { Image(systemName: "square.and.arrow.up") }
            .disabled(!valid)
            .accessibilityLabel(CustomThemeStrings.text("Export theme"))
            .accessibilityIdentifier("native-e2e.theme.export")
        } trailing: {
          PoracodeCircleButton(action: save) { Image(systemName: "checkmark") }
            .disabled(!valid || !store.canEdit)
            .accessibilityLabel(CustomThemeStrings.text("Save and apply"))
            .accessibilityIdentifier("native-e2e.theme.save")
        }
      }
      .poracodeUseKeyboardLayoutGuide()
    }
    .poracodeFormSheetSizing()
    .presentationDetents([.large])
    .onAppear { mode = colorScheme == .dark ? "dark" : "light" }
    .fileExporter(isPresented: $exporting, document: exportFile, contentType: .json, defaultFilename: "poracode-theme") { result in
      if case .failure(let error) = result, (error as NSError).code != NSUserCancelledError { exportError = error.localizedDescription }
    }
  }

  private func save() {
    do { try store.saveAndApply(NativeCustomTheme(id: id, document: draft)); dismiss() }
    catch { saveFailure = error as? CustomThemeFailure ?? .unavailableStorage }
  }

  private func beginExport() {
    do { exportFile = try CustomThemeFile(document: draft); exporting = true }
    catch { saveFailure = .invalidDocument }
  }
}
