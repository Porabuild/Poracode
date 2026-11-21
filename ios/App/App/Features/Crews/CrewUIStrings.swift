import Foundation

extension CrewStrings {
  static var favoriteAdd: String { value("Add to favorites") }
  static var favoriteRemove: String { value("Remove from favorites") }
  static var template: String { value("Template") }
  static var title: String { value("Crews") }
  static var description: String { value("Saved crews: a lead and the helpers it hands work to. Pick one under Poracode in any model picker.") }
  static var newCrew: String { value("New crew") }
  static var empty: String { value("No crews yet") }
  static var emptyBody: String { value("Create one from a template, then pick it under Poracode in the model picker.") }
  static var edit: String { value("Edit crew") }
  static var name: String { value("Crew name") }
  static var policy: String { value("Crew policy") }
  static var only: String { value("Crew only") }
  static var first: String { value("Crew first") }
  static var lead: String { value("Lead") }
  static var roleName: String { value("Name") }
  static var brief: String { value("Brief") }
  static var parallel: String { value("Parallel") }
  static var fallbacks: String { value("Fallbacks") }
  static var addRole: String { value("Add role") }
  static var removeRole: String { value("Remove role") }
  static var addFallback: String { value("Add fallback") }
  static var removeFallback: String { value("Remove fallback") }
  static var readOnly: String { value("Read-only") }
  static var duplicate: String { value("Duplicate") }
  static var deleteTitle: String { value("Delete crew?") }
  static var deleteBody: String { value("This cannot be undone.") }
  static var reset: String { value("Reset") }
  static var saveAsNew: String { value("Save as new crew:") }
  static var myCrew: String { value("My crew") }
  static var editSettings: String { value("Edit crews in settings") }
  static var changed: String { value("Changed for this thread") }
  static var instructionNote: String { value("The pencil-off icon marks a role told not to edit files: an instruction in its brief, not a permission.") }
  static var fallbackNote: String { value("If a role's agent is unavailable, its fallbacks run. Crew first may also use the next ranked agent.") }
  static var noEdits: String { value("Told not to edit files. Not enforced.") }
  static var invalid: String { value("Enter a valid name, lead and at least one role.") }
  static var limit: String { value("You can save up to 24 Crews.") }
  static var conflict: String { value("This Crew changed elsewhere. Reload before saving.") }
  static var notApplied: String { value("The host did not apply this change. Reconnect or update it, then try again.") }
  static var sourceHost: String { value("Switch back to the source host to edit this Crew.") }
  static var noHelpers: String { value("No helper models are available.") }
  static func saveTo(_ first: String, _ second: String = "") -> String { String.localizedStringWithFormat(value("Save to %1$@"), first, second) }
  static func copyName(_ first: String, _ second: String = "") -> String { String.localizedStringWithFormat(value("%1$@ copy"), first, second) }
  static func cannotLead(_ first: String, _ second: String = "") -> String { String.localizedStringWithFormat(value("%1$@ can't lead a crew. Pick another model first."), first, second) }
  static func unavailableLead(_ first: String, _ second: String = "") -> String { String.localizedStringWithFormat(value("%1$@ isn't available, so %2$@ stays the lead."), first, second) }

  static func failure(_ problem: SavedCrewsFailure) -> String {
    switch problem {
    case .settings(let problem): SettingsUIStrings.failure(problem)
    case .mutation(let problem):
      switch problem {
      case .invalidCrew: invalid
      case .limitReached: limit
      case .conflict: conflict
      case .notApplied: notApplied
      }
    }
  }
}
