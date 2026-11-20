import SwiftUI

struct CrewMemberEditor: View {
  let title: String
  @Binding var selection: CrewMemberSelection
  let catalog: CrewModelCatalog
  var isLead = false
  var route: CrewMemberPath?
  var fastOverride: Bool?
  var fastEdit: ((Bool) -> Void)?

  var body: some View {
    Section(title) {
      modelLink
      .accessibilityIdentifier("native-e2e.crew.member-model")
      if let choice = catalog.choice(for: selection, lead: isLead) {
        let efforts = choice.controls.effortOptions(for: selection.model)
        if efforts.count > 1 {
          Picker(HomeStrings.effort, selection: Binding(
            get: { selection.effort ?? choice.controls.effortDefault(for: selection.model) ?? efforts[0].id },
            set: { selection.effort = $0 }
          )) {
            if let current = selection.effort, !efforts.contains(where: { $0.id == current }) { Text(current).tag(current) }
            ForEach(efforts) { Text($0.label).tag($0.id) }
          }
          .accessibilityIdentifier("native-e2e.crew.member-effort")
        }
        let contexts = choice.controls.contextOptions(for: selection.model)
        let allowed = choice.controls.capabilities["modelContextSizes"]?.objectValue?[selection.model]?.arrayValue?.compactMap(\.stringValue) ?? []
        if allowed.count > 1 {
          Picker(HomeStrings.context, selection: Binding(
            get: {
              if let current = selection.contextSize, allowed.contains(current) { return current }
              let declared = choice.controls.capabilities["defaultContextSize"]?.stringValue
              return declared.flatMap { allowed.contains($0) ? $0 : nil } ?? allowed[0]
            }, set: { selection.contextSize = $0 }
          )) {
            ForEach(contexts.filter { allowed.contains($0.id) }) { Text($0.label).tag($0.id) }
          }
          .accessibilityIdentifier("native-e2e.crew.member-context")
        }
        if choice.controls.supportsFast(selection.model) {
          Toggle(HomeStrings.fast, isOn: Binding(get: { fastOverride ?? (selection.fast == true) }, set: {
            if let fastEdit { fastEdit($0) } else { selection.fast = $0 }
          }))
            .poracodeSwitchStyle()
            .accessibilityIdentifier("native-e2e.crew.member-fast")
        }
      }
    }
  }

  @ViewBuilder private var modelLink: some View {
    if let route {
      NavigationLink(value: CrewRosterDestination.model(route)) { modelLabel }
    } else {
      NavigationLink { CrewModelPicker(selection: $selection, catalog: catalog, isLead: isLead) } label: { modelLabel }
    }
  }

  private var modelLabel: some View {
    HStack(spacing: 10) {
      HomeProviderIcon(kind: selection.agentKind).frame(width: 22, height: 22)
      VStack(alignment: .leading, spacing: 3) {
        Text(catalog.label(for: selection)).foregroundStyle(.primary)
        Text(selection.agentKind).font(.caption).foregroundStyle(.secondary)
      }
    }
  }
}

struct CrewModelPicker: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var selection: CrewMemberSelection
  let catalog: CrewModelCatalog
  let isLead: Bool
  var title = HomeStrings.model
  var showsSelected = true
  var onPick: ((CrewModelChoice) -> Void)?
  @State private var query = ""

  private var choices: [CrewModelChoice] {
    (isLead ? catalog.leads : catalog.helpers).filter {
      query.isEmpty || $0.label.localizedCaseInsensitiveContains(query) || $0.agent.label.localizedCaseInsensitiveContains(query)
        || $0.model.localizedCaseInsensitiveContains(query)
    }
  }

  var body: some View {
    List {
      let kinds = choices.map { $0.agent.kind }.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
      ForEach(kinds, id: \.self) { kind in
        Section(choices.first { $0.agent.kind == kind }?.agent.label ?? kind) {
          ForEach(choices.filter { $0.agent.kind == kind }) { choice in
            Button {
              if let onPick { onPick(choice) } else { selection = catalog.replacing(selection, with: choice) }
              dismiss()
            } label: {
              HStack {
                Text(choice.label).foregroundStyle(.primary)
                Spacer(minLength: 8)
                if showsSelected && selection.agentKind == kind && selection.model == choice.model { Image(systemName: "checkmark") }
              }
              .frame(minHeight: 32)
              .contentShape(Rectangle())
            }
            .accessibilityIdentifier("native-e2e.crew.model.\(kind).\(choice.model)")
          }
        }
      }
    }
    .poracodeDrawerListStyle()
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .searchable(text: $query, prompt: HomeStrings.searchModels)
  }
}
