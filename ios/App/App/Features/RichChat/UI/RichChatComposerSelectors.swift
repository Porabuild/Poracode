import SwiftUI

/// Direct native controls on a wide composer. A compact picker keeps one
/// model line and one detail line; the full selection remains accessible.
struct RichChatComposerSelectors: View {
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Binding var configuration: ThreadConfig
  let agentKind: String
  let catalog: RichChatComposerControlCatalog
  let canConfigure: Bool
  let hasStartedSession: Bool
  let openAll: () -> Void
  var expandComposer: (() -> Void)? = nil
  /// New-thread editors can choose a different provider; running threads keep
  /// their capability-scoped model menu and explicit provider handoff flow.
  var chooseModel: (() -> Void)? = nil
  var openCrew: (() -> Void)? = nil
  @State private var pendingConfiguration: ThreadConfig?

  private var effort: String? {
    let id = catalog.displayedEffort(for: configuration) ?? catalog.effortDefault(for: configuration.model)
    return id.map { value in catalog.effortOptions(for: configuration.model).first { $0.id == value }?.label ?? value.capitalized }
  }
  private var context: String? {
    guard let id = configuration.contextSize ?? catalog.contextOptions(for: configuration.model).first?.id else { return nil }
    return catalog.contextOptions(for: configuration.model).first { $0.id == id }?.label ?? id
  }
  private var permission: String {
    catalog.permissionSelectionLabel(configuration)
  }
  private var fast: Bool { catalog.displayedFast(configuration) }
  private var expansionLabel: String {
    catalog.agentLabel.map(RichChatStrings.messageAgent) ?? RichChatStrings.message
  }
  private var details: String { detailSummary(showEffortLabel: true) }
  private var compactDetails: String { detailSummary(showEffortLabel: false) }
  private func detailSummary(showEffortLabel: Bool) -> String {
    var values = catalog.familySelectors(for: configuration).compactMap { control -> String? in
      guard let value = control.options.first(where: { $0.id == control.currentOptionID }) else { return nil }
      return "\(control.label): \(value.label)"
    }
    if !catalog.effortOptions(for: configuration.model).isEmpty {
      let value = effort ?? HomeStrings.auto
      values.append(showEffortLabel ? "\(HomeStrings.effort): \(value)" : value)
    }
    if let context { values.append(context) }
    if catalog.supportsFast(configuration.model), fast { values.append(HomeStrings.fast) }
    values.append(permission)
    if configuration.mode == "plan" { values.append(RichChatStrings.plan) }
    return values.joined(separator: " · ")
  }

  private var selectedCrew: ThreadCrewBinding? { openCrew == nil ? nil : ThreadCrewBinding(wire: configuration.crew) }
  private var primaryLabel: String { selectedCrew?.name ?? (selectedCrew == nil ? catalog.modelLabel(configuration.model) : RichChatStrings.crew) }

  @ViewBuilder var body: some View {
    if !canConfigure, expandComposer == nil {
      combinedLabel
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(HomeStrings.model)
        .accessibilityValue("\(primaryLabel), \(details)")
        .accessibilityIdentifier("native-e2e.composer-selectors.combined")
    } else { interactiveControls }
  }

  private var interactiveControls: some View {
    Group {
      if expandComposer != nil, horizontalSizeClass == .compact {
        combined
      } else {
        adaptiveControls
      }
    }
    .buttonStyle(.plain)
    .tint(.secondary)
    .alert(RichChatStrings.contextWindow, isPresented: Binding(
      get: { pendingConfiguration != nil }, set: { if !$0 { pendingConfiguration = nil } }
    )) {
      Button(RichChatStrings.cancel, role: .cancel) { pendingConfiguration = nil }
      Button(RichChatStrings.save) {
        if let pendingConfiguration { configuration = pendingConfiguration }
        pendingConfiguration = nil
      }
    } message: {
      Text(catalog.contextSizeReloadStopsSubagents
        ? RichChatStrings.contextReloadBody + "\n\n" + RichChatStrings.contextReloadStopsSubagents
        : RichChatStrings.contextReloadBody)
    }
  }

  private var adaptiveControls: some View {
    ViewThatFits(in: .horizontal) {
      if let expandComposer {
        HStack(spacing: 8) {
          separate
          Button(action: expandComposer) {
            Color.clear
              .frame(minWidth: 44, maxWidth: .infinity)
              .frame(height: 44)
              .contentShape(Rectangle())
          }
          .accessibilityLabel(expansionLabel)
          .accessibilityIdentifier("native-e2e.composer-collapsed")
        }
      } else {
        separate
      }
      combined
    }
  }

  private var separate: some View {
    HStack(spacing: 8) {
      modelSelector
      if let openCrew, chooseModel != nil {
        Button(action: openCrew) { controlLabel(RichChatStrings.crew, systemImage: "slider.horizontal.3", chevron: false) }
          .accessibilityIdentifier("native-e2e.composer.crew")
      }
      if openCrew == nil {
      ForEach(catalog.familySelectors(for: configuration).filter { $0.options.count > 1 }) { control in
        familyMenu(control)
      }
      if !catalog.effortOptions(for: configuration.model).isEmpty
        || !catalog.contextOptions(for: configuration.model).isEmpty { effortMenu }
      if catalog.supportsFast(configuration.model) { fastButton }
      }
      permissionMenu
      if configuration.mode == "plan" {
        Button {
          configuration.mode = RichChatComposerControlCatalog.nonPlanMode(in: catalog.modeOptions(for: configuration.model))
        } label: {
          controlLabel(RichChatStrings.plan, systemImage: "list.bullet.clipboard", chevron: false)
        }
        .accessibilityLabel(RichChatStrings.plan)
        .accessibilityIdentifier("native-e2e.composer.plan")
        .disabled(RichChatComposerControlCatalog.nonPlanMode(in: catalog.modeOptions(for: configuration.model)) == nil)
      }
    }
    .fixedSize(horizontal: true, vertical: false)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("native-e2e.composer-selectors.separate")
    .disabled(!canConfigure)
  }

  private var combined: some View {
    // Keep both text rows in the normal hierarchy. A matched transition
    // source inside the adaptive candidates can hide the secondary row.
    Button(action: expandComposer ?? openAll) {
      combinedLabel
    }
    .accessibilityLabel(expandComposer == nil ? RichChatStrings.composerControls : expansionLabel)
    .accessibilityValue("\(primaryLabel), \(details)")
    .accessibilityIdentifier(expandComposer == nil ? "native-e2e.composer-selectors.combined" : "native-e2e.composer-collapsed")
  }

  private var combinedLabel: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 5) {
        if selectedCrew != nil { Image(systemName: "person.2").frame(width: 14, height: 14) }
        else { HomeProviderIcon(kind: agentKind, agentLabel: catalog.agentLabel).frame(width: 14, height: 14) }
        Text(primaryLabel).font(.caption.weight(.semibold)).foregroundStyle(.primary).lineLimit(1)
        if expandComposer == nil, canConfigure {
          Image(systemName: "chevron.down").font(.system(size: 8, weight: .semibold)).foregroundStyle(.secondary)
        }
      }
      Text(compactDetails).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        .truncationMode(.tail)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityIdentifier("native-e2e.composer-selectors.detail-line")
    }
    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
    .contentShape(Rectangle())
  }

  @ViewBuilder
  private var modelSelector: some View {
    if let openCrew, chooseModel == nil {
      Button(action: openCrew) { controlLabel(primaryLabel, systemImage: "person.2") }
        .accessibilityLabel(RichChatStrings.crew)
        .accessibilityIdentifier("native-e2e.composer.crew")
    } else if let chooseModel {
      Button(action: chooseModel) {
        if selectedCrew != nil { controlLabel(primaryLabel, systemImage: "person.2") }
        else { modelLabel }
      }
        .accessibilityLabel(HomeStrings.model)
        .accessibilityValue(catalog.modelLabel(configuration.model))
        .accessibilityIdentifier("native-e2e.composer.model")
    } else {
      modelMenu
    }
  }

  private var modelLabel: some View {
    HStack(spacing: 5) {
      HomeProviderIcon(kind: agentKind, agentLabel: catalog.agentLabel).frame(width: 14, height: 14)
      controlLabel(catalog.modelLabel(configuration.model))
    }
  }

  private var modelMenu: some View {
    Menu {
      let selected = selectedModelRow
      ForEach(catalog.modelSections()) { section in
        Section {
          ForEach(section.options) { option in
            Button {
              var next = configuration
              if catalog.isProjectedFamilyRow(option.id) { catalog.applyFamilyRowSelection(option.id, to: &next) }
              else { catalog.applyExactModelSelection(option.id, to: &next) }
              propose(next)
            } label: {
              if selected == option.id { Label(option.label, systemImage: "checkmark") }
              else { Text(option.label) }
            }
          }
        } header: { if let heading = section.heading { Text(heading) } }
      }
    } label: {
      modelLabel
    }
    .accessibilityLabel(HomeStrings.model)
    .accessibilityValue(catalog.modelLabel(configuration.model))
    .accessibilityIdentifier("native-e2e.composer.model")
  }

  private var selectedModelRow: String {
    guard let family = ModelFamilies.family(for: configuration.model, in: catalog.capabilities, accepted: catalog.familyAcceptedIDs) else { return configuration.model }
    return catalog.models.first { option in
      catalog.isProjectedFamilyRow(option.id) && family.members.contains { $0.model == option.id }
    }?.id ?? configuration.model
  }

  private var effortMenu: some View {
    Menu {
      if !catalog.effortOptions(for: configuration.model).isEmpty {
        Section(HomeStrings.effort) {
          ForEach(catalog.effortOptions(for: configuration.model)) { option in
            choice(option, selected: (catalog.displayedEffort(for: configuration) ?? catalog.effortDefault(for: configuration.model)) == option.id) {
              var next = configuration
              catalog.applyEffortEdit(option.id, to: &next)
              propose(next)
            }
          }
        }
      }
      if !catalog.contextOptions(for: configuration.model).isEmpty {
        Section(HomeStrings.context) {
          ForEach(catalog.contextOptions(for: configuration.model)) { option in
            choice(option, selected: configuration.contextSize == option.id) {
              var next = configuration
              catalog.applyContextSizeEdit(option.id, to: &next)
              propose(next)
            }
          }
        }
      }
      if catalog.supportsThinking(configuration.model) {
        Toggle(RichChatStrings.thinking, isOn: Binding(get: { configuration.thinking == true }, set: { catalog.applyThinkingEdit($0, to: &configuration) }))
          .poracodeSwitchStyle()
      }
      if catalog.supportsWorkflows(configuration.model) {
        Toggle(catalog.workflowsLabel, isOn: Binding(get: { configuration.workflows == true }, set: { configuration.workflows = $0 }))
          .poracodeSwitchStyle()
      }
    } label: {
      controlLabel([effort, context].compactMap { $0 }.joined(separator: " · ").nilIfEmpty ?? HomeStrings.effort, systemImage: "chart.bar.fill")
    }
    .accessibilityLabel(HomeStrings.effort)
    .accessibilityValue([effort, context].compactMap { $0 }.joined(separator: ", "))
    .accessibilityIdentifier("native-e2e.composer.effort")
  }

  private var fastButton: some View {
    Button {
      var next = configuration
      catalog.applyFastEdit(!fast, to: &next)
      propose(next)
    } label: {
      controlLabel(HomeStrings.fast, systemImage: fast ? "bolt.fill" : "bolt", chevron: false)
        .foregroundStyle(fast ? Color.yellow : .secondary)
    }
    .accessibilityLabel(HomeStrings.fast)
    .accessibilityValue(fast ? ProjectSettingsStrings.enabled : ProjectSettingsStrings.disabled)
    .accessibilityAddTraits(fast ? .isSelected : [])
    .accessibilityIdentifier("native-e2e.composer.fast")
  }

  private var permissionMenu: some View {
    Menu {
      ForEach(catalog.permissionOptions) { option in
        Button { catalog.applyPermissionPolicy(option.id, to: &configuration) } label: {
          let label = catalog.permissionOptionLabel(option)
          if catalog.isPermissionOptionSelected(option, configuration: configuration) { Label(label, systemImage: "checkmark") }
          else { Text(label) }
        }
      }
    } label: { controlLabel(permission, systemImage: "checkmark.shield") }
    .disabled(catalog.permissionOptions.isEmpty)
    .accessibilityLabel(HomeStrings.permissions)
    .accessibilityValue(permission)
    .accessibilityIdentifier("native-e2e.composer.permissions")
  }

  private func controlLabel(_ text: String, systemImage: String? = nil, chevron: Bool = true) -> some View {
    HStack(spacing: 5) {
      if let systemImage { Image(systemName: systemImage).foregroundStyle(.secondary) }
      Text(text).lineLimit(1)
      if chevron { Image(systemName: "chevron.down").font(.system(size: 8, weight: .semibold)).foregroundStyle(.secondary) }
    }
    .font(.caption.weight(.medium))
    .padding(.horizontal, 4)
    .frame(minHeight: 44)
    .contentShape(Rectangle())
  }

  private func choice(_ option: RichChatComposerOption, selected: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      if selected { Label(option.label, systemImage: "checkmark") }
      else { Text(option.label) }
    }
  }

  private func familyMenu(_ control: RichChatComposerFamilySelectorControl) -> some View {
    let selected = control.options.first { $0.id == control.currentOptionID }?.label ?? ""
    return Menu {
      ForEach(control.options) { option in
        choice(option, selected: control.currentOptionID == option.id) {
          var next = configuration
          catalog.applySelectorEdit(selectorID: control.id, value: option.id, to: &next)
          propose(next)
        }
        .accessibilityIdentifier("native-e2e.composer.family.\(control.id).\(option.id)")
      }
    } label: {
      controlLabel("\(control.label): \(selected)")
    }
    .accessibilityLabel(control.label)
    .accessibilityValue(selected)
    .accessibilityIdentifier("native-e2e.composer.family.\(control.id)")
  }

  private func propose(_ next: ThreadConfig) {
    if catalog.confirmsContextChange(from: configuration, to: next, hasStartedSession: hasStartedSession) { pendingConfiguration = next }
    else { configuration = next }
  }
}

private extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
