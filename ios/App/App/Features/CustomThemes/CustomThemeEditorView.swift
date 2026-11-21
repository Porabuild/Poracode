import Observation
import SwiftUI

@Observable
final class CustomThemeEditSession: Identifiable {
  let id: String
  var draft: CustomThemeDocument
  var mode: String

  init(theme: NativeCustomTheme, mode: String) {
    id = theme.id
    draft = theme.document
    self.mode = mode
  }
}

struct CustomThemeEditorView: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var store: CustomThemeStore
  @Bindable var session: CustomThemeEditSession
  @State private var saveFailure: CustomThemeFailure?
  @State private var exportFile: CustomThemeFile?
  @State private var exporting = false
  @State private var exportError: String?

  private var draft: CustomThemeDocument { session.draft }
  private var valid: Bool { (try? draft.validate()) != nil }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        List {
          Section {
            TextField(text: $session.draft.label) { CustomThemeStrings.text("Theme name") }
              .accessibilityIdentifier("native-e2e.theme.name")
              .onChange(of: draft.label) { _, value in
                if value.unicodeScalars.count > 80 {
                  session.draft.label = String(String.UnicodeScalarView(value.unicodeScalars.prefix(80)))
                }
              }
            Picker(selection: $session.mode) {
              CustomThemeStrings.text("Light").tag("light")
              CustomThemeStrings.text("Dark").tag("dark")
            } label: { CustomThemeStrings.text("Palette mode") }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("native-e2e.theme.mode")
            CustomThemePreview(document: draft)
              .opacity(valid ? 1 : 0)
              .accessibilityHidden(!valid)
          }
          CustomThemePaletteForm(
            palette: session.mode == "dark" ? $session.draft.dark : $session.draft.light,
            mode: session.mode
          )
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
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button { dismiss() } label: {
            Label { CustomThemeStrings.text("Cancel") } icon: { Image(systemName: "xmark") }
          }
          .accessibilityIdentifier("native-e2e.theme.cancel")
        }
        ToolbarItem(placement: .bottomBar) {
          Button(action: beginExport) {
            Label { CustomThemeStrings.text("Export theme") } icon: { Image(systemName: "square.and.arrow.up") }
          }
            .disabled(!valid)
            .accessibilityIdentifier("native-e2e.theme.export")
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(action: save) {
            Label { CustomThemeStrings.text("Save and apply") } icon: { Image(systemName: "checkmark") }
          }
            .disabled(!valid || !store.canEdit)
            .accessibilityIdentifier("native-e2e.theme.save")
        }
      }
    }
    .poracodeFormSheetSizing()
    .presentationDetents([.large])
    .fileExporter(isPresented: $exporting, document: exportFile, contentType: .json, defaultFilename: "poracode-theme") { result in
      if case .failure(let error) = result, (error as NSError).code != NSUserCancelledError { exportError = error.localizedDescription }
    }
  }

  private func save() {
    do { try store.saveAndApply(NativeCustomTheme(id: session.id, document: draft)); dismiss() }
    catch { saveFailure = error as? CustomThemeFailure ?? .unavailableStorage }
  }

  private func beginExport() {
    do { exportFile = try CustomThemeFile(document: draft); exporting = true }
    catch { saveFailure = .invalidDocument }
  }
}
