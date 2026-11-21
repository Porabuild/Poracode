import SwiftUI

/// Transient routes belong to the window draft, alongside its selection, so a
/// replacement compact/split presenter restores the current native sublevel.
enum HomeComposerDestination: String, Hashable {
  case photos, models, plugins, mcp, skills, branches
}

extension HomeQuickComposeView {
  @ViewBuilder
  func selectorDestination(_ destination: HomeComposerDestination) -> some View {
    switch destination {
    case .photos:
      List { photoRows }
        .poracodeDrawerListStyle()
        .navigationTitle(HomeStrings.photos)
        .navigationBarTitleDisplayMode(.inline)
    case .models:
      List { modelRows }
        .poracodeDrawerListStyle()
        .searchable(text: $draft.modelSearch, prompt: Text(HomeStrings.searchModels))
        .navigationTitle(HomeStrings.model)
        .navigationBarTitleDisplayMode(.inline)
    case .plugins, .mcp:
      if let project = selectedProject, let agent = selectedAgent {
        ComposerToolsView(session: session, controller: draft.tools,
          section: destination == .plugins ? .plugins : .servers, project: project, agentKind: agent.kind,
          capabilities: HomeComposerCatalog.capabilities(for: agent, presentationMode: draft.presentationMode),
          presentation: draft.presentationMode, close: { draft.selector = nil })
      }
    case .branches:
      branchPicker
    case .skills:
      if let context = skillPickerContext {
        RichChatComposerSkillPicker(context: context, selection: $draft.skills,
          embeddedInNavigationStack: true)
      }
    }
  }
}
