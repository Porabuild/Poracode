import SwiftUI

struct SettingsIntegrationsScreen: View {
  enum Route: String, CaseIterable, Hashable, Identifiable {
    case skills
    case mcp
    var id: Self { self }
  }

  let controller: SettingsIntegrationsComposition
  let selection: SettingsIntegrationsSelection?
  let projects: [SettingsIntegrationsProjectOption]
  @Binding var selectedProjectIdentity: ProjectIdentity?
  @State private var route: Route? = .skills

  var body: some View {
    NavigationSplitView {
      List(selection: $route) {
        projectPicker
        Section {
          ForEach(Route.allCases) { item in
            NavigationLink(value: item) {
              Label(label(item), systemImage: symbol(item))
            }
          }
        }
      }
      .navigationTitle(SettingsIntegrationsStrings.title)
      .listStyle(.sidebar)
    } detail: {
      detail
    }
    .navigationSplitViewStyle(.balanced)
  }

  private var projectPicker: some View {
    Section(SettingsIntegrationsStrings.project) {
      Picker(SettingsIntegrationsStrings.project, selection: $selectedProjectIdentity) {
        Text(SettingsIntegrationsStrings.global).tag(ProjectIdentity?.none)
        ForEach(projects) { project in
          Text(project.name).tag(ProjectIdentity?.some(project.id))
        }
      }
    }
  }

  @ViewBuilder private var detail: some View {
    if let failure = controller.failure(for: .read) {
      SettingsIntegrationsAccessView(failure: failure)
    } else {
      VStack(spacing: 0) {
        if let failure = controller.failure(for: .operate) {
          Label(SettingsIntegrationsStrings.failure(failure), systemImage: "lock")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.horizontal)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.bar)
        }
        switch route ?? .skills {
        case .skills:
          SettingsSkillsView(
            controller: controller.skills,
            canOperate: controller.failure(for: .operate) == nil
          )
        case .mcp:
          SettingsMCPView(
            controller: controller.mcp,
            oauth: controller.oauth,
            canOperate: controller.failure(for: .operate) == nil
          )
        }
      }
    }
  }

  private func label(_ route: Route) -> String {
    switch route {
    case .skills: SettingsIntegrationsStrings.skills
    case .mcp: SettingsIntegrationsStrings.mcpServers
    }
  }

  private func symbol(_ route: Route) -> String {
    switch route {
    case .skills: "wand.and.stars"
    case .mcp: "server.rack"
    }
  }
}
