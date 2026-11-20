import SwiftUI

struct CrewRosterNavigation: ViewModifier {
  let state: CrewRosterDraft
  let catalog: CrewModelCatalog

  func body(content: Content) -> some View {
    content.navigationDestination(for: CrewRosterDestination.self) { destination in
      switch destination {
      case .role(let id):
        if let role = state.role(id) {
          CrewRoleEditor(role: role, catalog: catalog, showsFallbacks: false, usesTypedNavigation: true)
        }
      case .model(let path):
        if let member = state.member(path, catalog: catalog) {
          CrewModelPicker(selection: member, catalog: catalog, isLead: path == .lead) { choice in
            let next = catalog.replacing(member.wrappedValue, with: choice)
            if path == .lead { state.updateLead(next, catalog: catalog, exact: true) }
            else { member.wrappedValue = next }
          }
        }
      case .fallback(let id, let index):
        if let member = state.member(.fallback(role: id, index: index), catalog: catalog) {
          Form {
            CrewMemberEditor(title: CrewStrings.fallbacks, selection: member, catalog: catalog,
              route: .fallback(role: id, index: index))
          }
          .navigationTitle(CrewStrings.fallbacks)
          .navigationBarTitleDisplayMode(.inline)
        }
      }
    }
  }
}
