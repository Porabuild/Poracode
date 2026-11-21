import SwiftUI

/// The hardware-key route opens the same projected model choices directly.
/// Selection edits and reload confirmation follow the touch selector contract.
struct NativeComposerModelPicker: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var configuration: ThreadConfig
  let catalog: RichChatComposerControlCatalog
  let hasStartedSession: Bool
  let canConfigure: Bool
  @State private var query = ""
  @State private var pending: ThreadConfig?

  var body: some View {
    NavigationStack {
      List {
        let selected = catalog.selectedModelRow(for: configuration)
        ForEach(catalog.modelSections(matching: query)) { section in
          Section {
            ForEach(section.options) { option in
              Button {
                guard canConfigure else { return }
                var next = configuration
                catalog.applyModelRowSelection(option.id, to: &next)
                if catalog.confirmsContextChange(from: configuration, to: next, hasStartedSession: hasStartedSession) {
                  pending = next
                } else { apply(next) }
              } label: {
                HStack {
                  VStack(alignment: .leading, spacing: 3) {
                    Text(option.label).foregroundStyle(.primary)
                    if let description = option.modelDescription { Text(description).font(.caption).foregroundStyle(.secondary) }
                  }
                  Spacer(minLength: 8)
                  if selected == option.id { Image(systemName: "checkmark").foregroundStyle(.secondary) }
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
              }
              .buttonStyle(.plain).disabled(!canConfigure)
              .accessibilityIdentifier("native-e2e.keyboard.model.\(option.id)")
            }
          } header: { if let heading = section.heading { Text(heading) } }
        }
      }
      .listStyle(.insetGrouped)
      .navigationTitle(HomeStrings.model)
      .navigationBarTitleDisplayMode(.inline)
      .searchable(text: $query, prompt: HomeStrings.searchModels)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button(RichChatStrings.cancel) { dismiss() } } }
      .alert(RichChatStrings.contextWindow, isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } })) {
        Button(RichChatStrings.cancel, role: .cancel) { pending = nil }
        Button(RichChatStrings.save) { if let pending { apply(pending) }; pending = nil }
      } message: {
        Text(catalog.contextSizeReloadStopsSubagents
          ? RichChatStrings.contextReloadBody + "\n\n" + RichChatStrings.contextReloadStopsSubagents : RichChatStrings.contextReloadBody)
      }
    }
  }

  private func apply(_ next: ThreadConfig) {
    guard canConfigure else { return }
    configuration = ModelSelectionBindings.validated(next, owner: catalog.selectionOwner)
    dismiss()
  }
}
