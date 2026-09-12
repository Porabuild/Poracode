import SwiftUI

struct SettingsSkillsView: View {
  enum Mode: String, CaseIterable, Identifiable {
    case installed
    case marketplace
    var id: Self { self }
  }

  let controller: SettingsIntegrationsSkillsController
  let canOperate: Bool
  @State private var mode = Mode.installed
  @State private var deleteCandidate: SettingsSkillEntry?
  @State private var query = ""
  @State private var marketplace = SettingsSkillMarketplaceID.skillsSH
  @State private var sort = SettingsSkillMarketplaceSort.rank

  var body: some View {
    VStack(spacing: 0) {
      Picker(SettingsIntegrationsStrings.skills, selection: $mode) {
        Text(SettingsIntegrationsStrings.installed).tag(Mode.installed)
        Text(SettingsIntegrationsStrings.marketplace).tag(Mode.marketplace)
      }
      .pickerStyle(.segmented)
      .padding()

      if mode == .installed { installedList } else { marketplaceList }
    }
    .navigationTitle(SettingsIntegrationsStrings.skills)
    .toolbar { refreshButton }
    .confirmationDialog(
      SettingsIntegrationsStrings.deleteSkillTitle,
      isPresented: Binding(
        get: { deleteCandidate != nil },
        set: { if !$0 { deleteCandidate = nil } }
      ),
      titleVisibility: .visible
    ) {
      Button(SettingsIntegrationsStrings.delete, role: .destructive) {
        guard let skill = deleteCandidate else { return }
        Task { await controller.delete(skill) }
      }
      Button(SettingsIntegrationsStrings.cancel, role: .cancel) {}
    } message: {
      Text(SettingsIntegrationsStrings.deleteSkillMessage)
    }
    .task(id: marketplaceTaskID) {
      guard mode == .marketplace else { return }
      try? await Task.sleep(for: .milliseconds(250))
      guard !Task.isCancelled else { return }
      await controller.searchMarketplace(marketplace: marketplace, query: query, sort: sort)
    }
  }

  private var installedList: some View {
    List {
      feedback
      skillSection(.global, title: SettingsIntegrationsStrings.global)
      skillSection(.project, title: SettingsIntegrationsStrings.project)
      SettingsIntegrationsLoadView(
        state: controller.scanState,
        empty: controller.skills.isEmpty,
        emptyMessage: SettingsIntegrationsStrings.noSkills
      )
      .listRowBackground(Color.clear)
    }
  }

  private var marketplaceList: some View {
    List {
      Section {
        Picker(SettingsIntegrationsStrings.source, selection: $marketplace) {
          Text(SettingsIntegrationsStrings.skillsSH).tag(SettingsSkillMarketplaceID.skillsSH)
          Text(SettingsIntegrationsStrings.skillsDirectory).tag(
            SettingsSkillMarketplaceID.skillsDirectory)
        }
        Picker(SettingsIntegrationsStrings.sort, selection: $sort) {
          ForEach(SettingsSkillMarketplaceSort.allCases, id: \.self) { value in
            Text(SettingsIntegrationsStrings.sort(value)).tag(value)
          }
        }
      }
      if let result = controller.marketplace {
        Section(SettingsIntegrationsStrings.marketplace) {
          ForEach(result.skills) { skill in
            marketplaceRow(skill)
          }
        }
      }
      SettingsIntegrationsLoadView(
        state: controller.marketplaceState,
        empty: controller.marketplace?.skills.isEmpty ?? true,
        emptyMessage: SettingsIntegrationsStrings.noMarketplaceResults
      )
      .listRowBackground(Color.clear)
    }
    .searchable(text: $query, prompt: SettingsIntegrationsStrings.searchMarketplace)
  }

  @ViewBuilder
  private func skillSection(_ scope: SettingsSkillScope, title: String) -> some View {
    let values = controller.skills.filter { $0.scope == scope }
    if !values.isEmpty {
      Section(title) {
        ForEach(values) { skill in skillRow(skill) }
      }
    }
  }

  private func skillRow(_ skill: SettingsSkillEntry) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text(skill.name).font(.headline)
          Text(skill.descriptionText).font(.subheadline).foregroundStyle(.secondary)
        }
        Spacer()
        Toggle(
          skill.enabled ? SettingsIntegrationsStrings.disable : SettingsIntegrationsStrings.enable,
          isOn: Binding(
            get: { skill.enabled },
            set: { enabled in Task { await controller.setEnabled(enabled, for: skill) } }
          )
        )
        .labelsHidden()
        .disabled(!canOperate || !skill.mutable || controller.isMutating)
      }
      HStack {
        if !skill.valid {
          Label(SettingsIntegrationsStrings.invalidSkill, systemImage: "exclamationmark.triangle")
        }
        if skill.linked { Label(SettingsIntegrationsStrings.linked, systemImage: "link") }
        if skill.origin == .builtIn {
          Label(SettingsIntegrationsStrings.builtIn, systemImage: "shippingbox")
        }
        Spacer()
        if skill.importState == .available {
          importMenu(skill)
        }
        if skill.mutable {
          Button(SettingsIntegrationsStrings.delete, role: .destructive) { deleteCandidate = skill }
            .disabled(!canOperate || controller.isMutating)
        }
      }
      .font(.caption)
    }
    .padding(.vertical, 4)
  }

  private func marketplaceRow(_ skill: SettingsMarketplaceSkill) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(skill.name).font(.headline)
      if let description = skill.description { Text(description).foregroundStyle(.secondary) }
      HStack {
        Text(skill.source).font(.caption).foregroundStyle(.secondary)
        Spacer()
        Menu(SettingsIntegrationsStrings.install) {
          Button(SettingsIntegrationsStrings.global) {
            Task { await controller.install(skill, destination: .global) }
          }
          Button(SettingsIntegrationsStrings.project) {
            Task { await controller.install(skill, destination: .project) }
          }
          .disabled(controller.access?.context.projectLocation == nil)
        }
        .disabled(!canOperate || controller.isMutating)
      }
    }
  }

  private func importMenu(_ skill: SettingsSkillEntry) -> some View {
    Menu(SettingsIntegrationsStrings.importSkill) {
      Button(SettingsIntegrationsStrings.copy) {
        Task { await controller.importSkill(skill, destination: .global, mode: .copy) }
      }
      Button(SettingsIntegrationsStrings.link) {
        Task { await controller.importSkill(skill, destination: .global, mode: .link) }
      }
      Button(SettingsIntegrationsStrings.project) {
        Task { await controller.importSkill(skill, destination: .project, mode: .copy) }
      }
      .disabled(controller.access?.context.projectLocation == nil)
    }
    .disabled(!canOperate || controller.isMutating)
  }

  @ViewBuilder private var feedback: some View {
    SettingsIntegrationsFeedbackView(
      notice: controller.notice,
      failure: controller.mutationFailure
    )
  }

  @ToolbarContentBuilder private var refreshButton: some ToolbarContent {
    ToolbarItem(placement: .primaryAction) {
      SettingsIntegrationsActionButton {
        Task { await controller.loadSkills() }
      } label: {
        Label(SettingsIntegrationsStrings.refresh, systemImage: "arrow.clockwise")
      }
    }
  }

  private var marketplaceTaskID: MarketplaceTaskIdentity {
    MarketplaceTaskIdentity(
      mode: mode,
      marketplace: marketplace,
      sort: sort,
      query: query,
      context: controller.access?.context
    )
  }
}

private struct MarketplaceTaskIdentity: Hashable {
  let mode: SettingsSkillsView.Mode
  let marketplace: SettingsSkillMarketplaceID
  let sort: SettingsSkillMarketplaceSort
  let query: String
  let context: SettingsIntegrationsContext?
}
