import SwiftUI

struct CustomThemeSettingsView: View {
  @Bindable var store: CustomThemeStore
  @AppStorage(PoracodeThemePreset.storageKey) private var selectedID = PoracodeThemePreset.defaultID
  @Environment(\.colorScheme) private var colorScheme
  @State private var editing: CustomThemeEditSession?
  @State private var deleting: NativeCustomTheme?
  @State private var importing = false
  @State private var importFailed = false
  @State private var exportFile: CustomThemeFile?
  @State private var exporting = false
  @State private var operationError: String?

  var body: some View {
    List {
      if let issue = store.storageIssue {
        Section {
          CustomThemeStrings.text(issue == .unsupportedVersion
            ? "Update Poracode to edit themes saved by a newer version."
            : "Saved themes could not be read. Existing data has been kept.")
            .foregroundStyle(.secondary)
        }
      }
      if store.themes.isEmpty {
        Section { Label { CustomThemeStrings.text("Custom theme") } icon: { Image(systemName: "paintpalette") }
          .foregroundStyle(.secondary) }
      }
      ForEach(store.themes) { theme in
        Button { selectedID = theme.id } label: { row(theme) }
          .buttonStyle(.plain)
          .accessibilityAddTraits(selectedID == theme.id ? .isSelected : [])
          .accessibilityIdentifier("native-e2e.theme.row.\(theme.id)")
          .contextMenu { actions(theme) }
          .accessibilityActions { actions(theme) }
      }
      if importFailed {
        Section {
          CustomThemeStrings.text("Could not import this theme. Use a version 1 theme JSON file under 32 KB with a name and valid light and dark palettes.")
            .foregroundStyle(.red).accessibilityIdentifier("native-e2e.theme.import-error")
        }
      }
      if let operationError { Section { Text(verbatim: operationError).foregroundStyle(.red) } }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .navigationTitle(CustomThemeStrings.text("Custom theme"))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItemGroup(placement: .bottomBar) {
        Button { importing = true } label: {
          Label { CustomThemeStrings.text("Import theme") } icon: { Image(systemName: "square.and.arrow.down") }
        }
          .disabled(!store.canEdit)
          .accessibilityIdentifier("native-e2e.theme.import")
        Button(action: create) {
          Label { CustomThemeStrings.text("Create custom theme") } icon: { Image(systemName: "plus") }
        }
          .disabled(!store.canEdit || CustomThemeCatalog.bundled.presets.isEmpty)
          .accessibilityIdentifier("native-e2e.theme.create")
      }
    }
    .poracodeUseKeyboardLayoutGuide()
    .sheet(item: $editing) { session in CustomThemeEditorView(store: store, session: session) }
    .confirmationDialog(CustomThemeStrings.text("Delete theme"), isPresented: Binding(
      get: { deleting != nil }, set: { if !$0 { deleting = nil } }
    ), titleVisibility: .visible) {
      Button(role: .destructive) {
        if let deleting { do { try store.remove(deleting.id) } catch { operationError = error.localizedDescription } }
        deleting = nil
      } label: { CustomThemeStrings.text("Delete") }
      Button(role: .cancel) { deleting = nil } label: { CustomThemeStrings.text("Cancel") }
    } message: { CustomThemeStrings.text("Delete this custom theme? If it is active, Poracode will use the default theme.") }
    .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
      switch result {
      case .success(let url):
        do { beginEditing(NativeCustomTheme(document: try CustomThemeFile.imported(from: url))); importFailed = false }
        catch { importFailed = true }
      case .failure(let error):
        if (error as NSError).code != NSUserCancelledError { importFailed = true }
      }
    }
    .fileExporter(isPresented: $exporting, document: exportFile, contentType: .json, defaultFilename: "poracode-theme") { result in
      if case .failure(let error) = result, (error as NSError).code != NSUserCancelledError { operationError = error.localizedDescription }
    }
  }

  private func row(_ theme: NativeCustomTheme) -> some View {
    let variant = colorScheme == .dark ? theme.document.dark.nativeVariant(mode: "dark") : theme.document.light.nativeVariant(mode: "light")
    return HStack(spacing: 12) {
      ThemeSwatch(variant: variant)
      Text(verbatim: theme.document.label).foregroundStyle(.primary)
      Spacer(minLength: 8)
      if theme.id == selectedID { Image(systemName: "checkmark").foregroundStyle(.primary) }
    }
    .contentShape(Rectangle()).frame(minHeight: 44)
  }

  @ViewBuilder private func actions(_ theme: NativeCustomTheme) -> some View {
    Button { beginEditing(theme) } label: { CustomThemeStrings.text("Edit theme") }.disabled(!store.canEdit)
    Button { beginExport(theme) } label: { CustomThemeStrings.text("Export theme") }
    Button(role: .destructive) { deleting = theme } label: { CustomThemeStrings.text("Delete theme") }.disabled(!store.canEdit)
  }

  private func create() {
    guard var document = CustomThemeCatalog.bundled.source(for: selectedID, custom: store.themes) else { return }
    document.label = CustomThemeStrings.initialName
    beginEditing(NativeCustomTheme(document: document))
  }

  private func beginEditing(_ theme: NativeCustomTheme) {
    editing = CustomThemeEditSession(theme: theme, mode: colorScheme == .dark ? "dark" : "light")
  }

  private func beginExport(_ theme: NativeCustomTheme) {
    do { exportFile = try CustomThemeFile(document: theme.document); exporting = true }
    catch { operationError = error.localizedDescription }
  }
}
