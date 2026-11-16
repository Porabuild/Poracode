import SwiftUI

/// Shared native form sections: settings edit a saved record; the composer
/// edits a staged binding without rebuilding its other configuration fields.
struct CrewEditorSections: View {
  @Binding var binding: ThreadCrewBinding
  @Binding var lead: CrewMemberSelection
  let catalog: CrewModelCatalog
  var showsFallbacks = false
  var usesTypedNavigation = false
  var leadFastOverride: Bool?
  var leadFastEdit: ((Bool) -> Void)?

  var body: some View {
    Section {
      Picker(CrewStrings.policy, selection: $binding.policy) {
        Text(CrewStrings.only).tag(CrewPolicy.crewOnly)
        Text(CrewStrings.first).tag(CrewPolicy.crewFirst)
      }
      .pickerStyle(.segmented)
      .accessibilityIdentifier("native-e2e.crew.policy")
    }
    CrewMemberEditor(title: CrewStrings.lead, selection: $lead, catalog: catalog, isLead: true,
      route: usesTypedNavigation ? .lead : nil, fastOverride: leadFastOverride, fastEdit: leadFastEdit)
    Section {
      ForEach($binding.roles) { $role in
        Group {
          if usesTypedNavigation {
            NavigationLink(value: CrewRosterDestination.role(role.id)) { roleLabel(role) }
          } else {
            NavigationLink {
              CrewRoleEditor(role: $role, catalog: catalog, showsFallbacks: showsFallbacks)
            } label: { roleLabel(role) }
          }
        }
        .accessibilityIdentifier("native-e2e.crew.role.\(role.id)")
        .swipeActions {
          if binding.roles.count > 1 {
            Button(CrewStrings.removeRole, role: .destructive) { binding.roles.removeAll { $0.id == role.id } }
          }
        }
      }
      Button {
        guard let helper = catalog.defaultHelper(for: lead) else { return }
        binding = CrewTemplates.addingRole(to: binding, selection: helper).0
      } label: { Label(CrewStrings.addRole, systemImage: "plus") }
      .disabled(binding.roles.count >= 6 || catalog.defaultHelper(for: lead) == nil)
      .accessibilityIdentifier("native-e2e.crew.add-role")
    } footer: { Text(CrewStrings.instructionNote) }
  }

  private func roleLabel(_ role: CrewRole) -> some View {
    HStack(spacing: 10) {
      HomeProviderIcon(kind: role.selection.agentKind).frame(width: 22, height: 22)
      VStack(alignment: .leading, spacing: 3) {
        Text(role.label).foregroundStyle(.primary)
        Text(catalog.label(for: role.selection)).font(.caption).foregroundStyle(.secondary)
      }
      Spacer(minLength: 4)
      if role.noEdits { Image(systemName: "pencil.slash").foregroundStyle(.secondary).accessibilityLabel(CrewStrings.noEdits) }
      if role.parallelCount > 1 { Text("×\(role.parallelCount)").font(.caption).foregroundStyle(.secondary) }
    }
  }
}

struct CrewRoleEditor: View {
  @Binding var role: CrewRole
  let catalog: CrewModelCatalog
  let showsFallbacks: Bool
  var usesTypedNavigation = false

  var body: some View {
    Form {
      Section {
        HStack {
          TextField(CrewStrings.roleName, text: $role.label)
            .accessibilityIdentifier("native-e2e.crew.role-name")
          Text(role.label.utf16.count.formatted() + "/" + 24.formatted())
            .font(.caption).foregroundStyle(role.label.utf16.count > 24 ? Color.red : Color.secondary)
        }
        TextField(CrewStrings.brief, text: Binding(get: { role.brief ?? "" }, set: { role.brief = $0.isEmpty ? nil : $0 }), axis: .vertical)
          .lineLimit(2...5)
          .accessibilityIdentifier("native-e2e.crew.role-brief")
        HStack {
          Spacer()
          Text((role.brief?.utf16.count ?? 0).formatted() + "/" + 160.formatted())
            .font(.caption).foregroundStyle((role.brief?.utf16.count ?? 0) > 160 ? Color.red : Color.secondary)
        }
        Toggle(CrewStrings.noEdits, isOn: $role.noEdits).poracodeSwitchStyle()
          .accessibilityIdentifier("native-e2e.crew.role-no-edits")
        Stepper(value: Binding(get: { role.parallelCount }, set: { role.parallel = $0 == 1 ? nil : $0 }), in: 1...4) {
          HStack { Text(CrewStrings.parallel); Spacer(); Text(role.parallelCount.formatted()).foregroundStyle(.secondary) }
        }
        .accessibilityIdentifier("native-e2e.crew.role-parallel")
      }
      CrewMemberEditor(title: HomeStrings.model, selection: $role.selection, catalog: catalog,
        route: usesTypedNavigation ? .role(role.id) : nil)
      if showsFallbacks { fallbackSections }
    }
    .poracodeDrawerListStyle()
    .navigationTitle(role.label)
    .navigationBarTitleDisplayMode(.inline)
  }

  @ViewBuilder private var fallbackSections: some View {
    Section {
      ForEach(Array((role.fallbacks ?? []).indices), id: \.self) { index in
        let member = Binding<CrewMemberSelection>(get: {
          guard let values = role.fallbacks, values.indices.contains(index) else { return role.selection }
          return values[index]
        }, set: {
          guard role.fallbacks?.indices.contains(index) == true else { return }
          role.fallbacks?[index] = $0
        })
        NavigationLink {
          Form { CrewMemberEditor(title: CrewStrings.fallbacks, selection: member, catalog: catalog) }
            .navigationTitle(CrewStrings.fallbacks)
            .navigationBarTitleDisplayMode(.inline)
        } label: {
          HStack {
            Text(catalog.label(for: member.wrappedValue))
            Spacer(minLength: 4)
            Text((index + 1).formatted()).foregroundStyle(.secondary)
          }
        }
        .swipeActions {
          Button(CrewStrings.removeFallback, role: .destructive) {
            if role.fallbacks?.indices.contains(index) == true { role.fallbacks?.remove(at: index) }
          }
        }
      }
      NavigationLink {
        CrewModelPicker(selection: .constant(role.selection), catalog: catalog, isLead: false,
          title: CrewStrings.addFallback, showsSelected: false) { choice in
          guard (role.fallbacks?.count ?? 0) < 3 else { return }
          role.fallbacks = (role.fallbacks ?? []) + [catalog.defaultSelection(choice)]
        }
      } label: { Label(CrewStrings.addFallback, systemImage: "plus") }
      .disabled((role.fallbacks?.count ?? 0) >= 3 || catalog.helpers.isEmpty)
      .accessibilityIdentifier("native-e2e.crew.add-fallback")
    } header: { Text(CrewStrings.fallbacks) } footer: { Text(CrewStrings.fallbackNote) }
  }
}
