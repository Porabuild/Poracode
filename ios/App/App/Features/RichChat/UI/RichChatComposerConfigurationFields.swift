import SwiftUI

/// Shared native form fields for a new draft and a running thread. The owner
/// decides whether edits apply immediately or are staged behind Save.
struct RichChatComposerConfigurationFields: View {
  @Binding var draft: ThreadConfig
  let catalog: RichChatComposerControlCatalog
  var showsModelSelector = true
  var bindingsReadOnly = false

  var body: some View {
    if showsModelSelector { modelSection }
    reasoningSection
    permissionSection
    if !bindingsReadOnly { mcpSection }
  }

  private var modelSection: some View {
    Section {
      Picker(HomeStrings.model, selection: modelBinding) {
        ForEach(catalog.modelSections()) { section in
          if let heading = section.heading {
            Section(header: Text(heading)) {
              ForEach(section.options) { option in
                modelOptionRow(option).tag(option.id)
              }
            }
          } else {
            Section {
              ForEach(section.options) { option in
                modelOptionRow(option).tag(option.id)
              }
            }
          }
        }
      }
      .accessibilityIdentifier("native-e2e.composer-controls.model")
    } header: {
      Text(HomeStrings.model)
    } footer: {
      if let agentLabel = catalog.agentLabel { Text(agentLabel) }
    }
  }

  /// Model row with the provider-content pricing hint muted beneath the label.
  @ViewBuilder
  private func modelOptionRow(_ option: RichChatComposerOption) -> some View {
    if let modelDescription = option.modelDescription {
      VStack(alignment: .leading, spacing: 2) {
        Text(option.label)
        Text(modelDescription)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    } else {
      Text(option.label)
    }
  }

  @ViewBuilder
  private var reasoningSection: some View {
    let selectors = catalog.familySelectors(for: draft).filter { $0.options.count > 1 }
    let efforts = catalog.effortOptions(for: draft.model)
    let contexts = catalog.contextOptions(for: draft.model)
    let supportsFast = catalog.supportsFast(draft.model)
    let supportsThinking = catalog.supportsThinking(draft.model)
    let supportsWorkflows = catalog.supportsWorkflows(draft.model)
    if !selectors.isEmpty || efforts.count > 1 || contexts.count > 1 || supportsFast
      || supportsThinking || supportsWorkflows
    {
      Section(SettingsUIStrings.configurationSection) {
        // Conditional family selectors: they change only the model coordinate
        // they name, resolving to the exact member of the current tuple.
        ForEach(selectors) { control in
          Picker(control.label, selection: selectorBinding(control)) {
            ForEach(control.options) { option in Text(option.label).tag(option.id) }
          }
          .accessibilityIdentifier("native-e2e.composer-controls.family.\(control.id)")
        }
        if efforts.count > 1 {
          Picker(HomeStrings.effort, selection: effortBinding(efforts)) {
            ForEach(efforts) { option in Text(option.label).tag(option.id) }
          }
          .accessibilityIdentifier("native-e2e.composer-controls.effort")
        }
        if contexts.count > 1 {
          Picker(HomeStrings.context, selection: contextBinding(contexts)) {
            ForEach(contexts) { option in Text(option.label).tag(option.id) }
          }
        }
        if supportsFast {
          Toggle(HomeStrings.fast, isOn: fastBinding)
          .poracodeSwitchStyle()
          .disabled(!catalog.canEditFast(draft))
          .accessibilityIdentifier("native-e2e.composer-controls.fast")
        }
        if supportsThinking {
          Toggle(RichChatStrings.thinking, isOn: optionalBooleanBinding(\.thinking))
          .poracodeSwitchStyle()
        }
        if supportsWorkflows {
          Toggle(catalog.workflowsLabel, isOn: optionalBooleanBinding(\.workflows))
          .poracodeSwitchStyle()
        }
      }
    }
  }

  @ViewBuilder
  private var permissionSection: some View {
    let options = catalog.permissionOptions.map {
      RichChatComposerOption(
        id: $0.id, label: catalog.permissionOptionLabel($0),
        modelDescription: $0.modelDescription)
    }
    if options.count > 1 {
      Section(HomeStrings.permissions) {
        choicePicker(
          HomeStrings.permissions, options: options,
          selection: Binding(
            get: {
              guard let option = options.first(where: { $0.id == catalog.effectivePermissionPolicy(draft) }),
                catalog.isPermissionOptionSelected(option, configuration: draft) else { return "" }
              return option.id
            },
            set: { catalog.applyPermissionPolicy($0, to: &draft) }
          )
        )
        Text(catalog.permissionSelectionLabel(draft)).font(.caption).foregroundStyle(.secondary)
      }
    }
  }

  /// Permissions use a native segmented picker for the small,
  /// mutually exclusive option sets (2–3), matching Android; larger sets keep
  /// the menu picker.
  @ViewBuilder
  private func choicePicker(
    _ title: String,
    options: [RichChatComposerOption],
    selection: Binding<String>
  ) -> some View {
    if (2...3).contains(options.count) {
      Picker(title, selection: selection) {
        ForEach(options) { option in Text(option.label).tag(option.id) }
      }
      .pickerStyle(.segmented)
      .labelsHidden()
    } else {
      Picker(title, selection: selection) {
        ForEach(options) { option in Text(option.label).tag(option.id) }
      }
    }
  }

  private var mcpSection: some View {
    Section(HomeStrings.mcpServers) {
      Toggle(isOn: optionalBooleanBinding(\.browserMcp)) {
        Label(HomeStrings.browser, systemImage: "globe")
      }
      .poracodeSwitchStyle()
      Toggle(isOn: optionalBooleanBinding(\.crossagentMcp)) {
        Label(HomeStrings.crossagents, systemImage: "person.2")
      }
      .poracodeSwitchStyle()
      Toggle(isOn: optionalBooleanBinding(\.chromeMcp)) {
        Label(HomeStrings.chrome, systemImage: "rectangle")
      }
      .poracodeSwitchStyle()
      Toggle(isOn: optionalBooleanBinding(\.computerUse)) {
        Label(HomeStrings.computerUse, systemImage: "desktopcomputer")
      }
      .poracodeSwitchStyle()
    }
  }

  private var modelBinding: Binding<String> {
    Binding(
      get: { draft.model },
      set: { model in
        // The row's own origin carries the intent: the projected family row
        // retains/adopts through the relation; every exact row selects that
        // exact UID.
        catalog.applyModelRowSelection(model, to: &draft)
      }
    )
  }

  private func selectorBinding(_ control: RichChatComposerFamilySelectorControl) -> Binding<String> {
    Binding(
      get: { control.currentOptionID ?? control.options.first?.id ?? "" },
      set: { catalog.applySelectorEdit(selectorID: control.id, value: $0, to: &draft) }
    )
  }

  private func effortBinding(_ options: [RichChatComposerOption]) -> Binding<String> {
    Binding(
      // Display order: inside a model-bound family the member's encoded
      // effort, then the negotiated current value of the session's model (a
      // display fallback that never writes the configuration), then the saved
      // carrier itself.
      get: {
        catalog.displayedEffort(for: draft) ?? catalog.effortDefault(for: draft.model)
          ?? options.first?.id ?? ""
      },
      set: { catalog.applyEffortEdit($0, to: &draft) }
    )
  }

  private var fastBinding: Binding<Bool> {
    Binding(
      // Display derives from the member UID inside a model-bound family; the
      // persisted carrier only ever moves through the resolved edit.
      get: { catalog.displayedFast(draft) },
      set: { catalog.applyFastEdit($0, to: &draft) }
    )
  }

  private func contextBinding(_ options: [RichChatComposerOption]) -> Binding<String> {
    Binding(
      get: { draft.contextSize ?? options.first?.id ?? "" },
      set: { catalog.applyContextSizeEdit($0, to: &draft) }
    )
  }

  private func optionalBooleanBinding(
    _ keyPath: WritableKeyPath<ThreadConfig, Bool?>
  ) -> Binding<Bool> {
    Binding(
      get: { draft[keyPath: keyPath] == true },
      set: { value in
        if keyPath == \.thinking { catalog.applyThinkingEdit(value, to: &draft) }
        else { draft[keyPath: keyPath] = value }
      }
    )
  }
}
