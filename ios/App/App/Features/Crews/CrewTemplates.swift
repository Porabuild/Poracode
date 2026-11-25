import Foundation

enum CrewStrings {
  static func value(_ english: String) -> String {
    Bundle.main.localizedString(forKey: english, value: english, table: "Crews")
  }
}

struct CrewRoleTemplate: Identifiable {
  let id: String
  let englishLabel: String
  let englishBrief: String
  let noEdits: Bool
  let builder: Bool
  var label: String { CrewStrings.value(englishLabel) }
  var brief: String { CrewStrings.value(englishBrief) }
  func role(selection: CrewMemberSelection, parallel: Int = 1) -> CrewRole {
    .init(id: id, label: label, brief: brief, noEdits: noEdits, selection: selection, parallel: parallel > 1 ? parallel : nil)
  }
}

struct CrewTemplate: Identifiable {
  let id: String
  let englishName: String
  let englishDescription: String
  let policy: CrewPolicy
  let roles: [(id: String, parallel: Int)]
  var name: String { CrewStrings.value(englishName) }
  var description: String { CrewStrings.value(englishDescription) }
  func binding(selection: (CrewRoleTemplate) -> CrewMemberSelection) -> ThreadCrewBinding {
    .init(policy: policy, roles: roles.compactMap { entry in
      guard let template = CrewTemplates.roles.first(where: { $0.id == entry.id }) else { return nil }
      return template.role(selection: selection(template), parallel: entry.parallel)
    })
  }
}

/// Shared/PWA templates, localized in the same languages and bounded by crew v1.
enum CrewTemplates {
  static func addingRole(to original: ThreadCrewBinding, selection: CrewMemberSelection) -> (ThreadCrewBinding, String?) {
    guard original.roles.count < 6 else { return (original, nil) }
    let ids = Set(original.roles.map(\.id))
    let labels = Set(original.roles.map { $0.label.trimmingCharacters(in: CrewWire.whitespace).lowercased() })
    let hasBuilder = roles.contains { $0.builder && ids.contains($0.id) }
    var selected = roles.filter { $0.id != "helper" && !(hasBuilder && $0.builder) }
      .first { !ids.contains($0.id) && !labels.contains($0.label.lowercased()) }
    if selected == nil { selected = roles.first { $0.id == "helper" } }
    guard let selected else { return (original, nil) }
    var role = selected.role(selection: selection)
    if ids.contains(role.id) || labels.contains(role.label.lowercased()) {
      var suffix = 1
      while labels.contains(role.label.lowercased()) {
        suffix += 1
        role.label = selected.label + " " + suffix.formatted()
      }
      if ids.contains(role.id) { role.id = nextRoleID(existing: ids, label: role.label) }
    }
    var next = original
    next.roles.append(role)
    return (next, role.id)
  }

  private static func nextRoleID(existing: Set<String>, label: String) -> String {
    var base = label.lowercased().replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
      .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    base = String(base.prefix(32)).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    if base.isEmpty { base = "role" }
    if !existing.contains(base) { return base }
    var suffix = 2
    while true {
      let tail = "-\(suffix)"
      let value = String(base.prefix(32 - tail.count)).trimmingCharacters(in: CharacterSet(charactersIn: "-")) + tail
      if !existing.contains(value) { return value }
      suffix += 1
    }
  }

  static let roles: [CrewRoleTemplate] = [
    .init(id: "builder", englishLabel: "Builder",
      englishBrief: "Implements the lead's task end to end and verifies it with the narrowest build and tests; reports changed files, check results and deviations.",
      noEdits: false, builder: true),
    .init(id: "designer", englishLabel: "Designer",
      englishBrief: "Designs and builds UI from the design system and platform guidelines, verifies it in the running app with screenshots, and reports the changes with evidence.",
      noEdits: false, builder: true),
    .init(id: "reviewer", englishLabel: "Reviewer",
      englishBrief: "Reads the full diff and the code it touches, runs targeted checks, and reports bugs, regressions and missing tests by file and line.",
      noEdits: true, builder: false),
    .init(id: "scout", englishLabel: "Scout",
      englishBrief: "Does the broad searching: finds the files, callers, tests and conventions a task touches, and reports paths and facts, not a review.",
      noEdits: true, builder: false),
    .init(id: "tester", englishLabel: "Tester",
      englishBrief: "Writes and runs the tests for the change, reproduces reported bugs, and reports each failure with the exact command and failing assertion.",
      noEdits: false, builder: false),
    .init(id: "investigator", englishLabel: "Investigator",
      englishBrief: "Reproduces the bug and traces it to the root cause, then reports the evidence, the failing code path and a suggested fix.",
      noEdits: true, builder: false),
    .init(id: "fixer", englishLabel: "Fixer",
      englishBrief: "Implements the fix the lead settles, adds a regression test, and confirms the reproduction now passes with the narrowest check.",
      noEdits: false, builder: true),
    .init(id: "sidekick", englishLabel: "Sidekick",
      englishBrief: "Explores the codebase, implements the lead's task end to end, runs the narrowest checks, and reports what changed with evidence.",
      noEdits: false, builder: true),
    .init(id: "helper", englishLabel: "Helper",
      englishBrief: "Takes any hands-on task the lead hands off: exploring, editing and running checks, then reports back with evidence.",
      noEdits: false, builder: false),
  ]

  static let all: [CrewTemplate] = [
    .init(id: "pair", englishName: "Lead + Sidekick",
      englishDescription: "The lead plans and reviews; a cheaper sidekick explores, builds and verifies.",
      policy: .crewOnly, roles: [(id: "sidekick", parallel: 1)]),
    .init(id: "ship", englishName: "Ship crew",
      englishDescription: "A scout maps the code, a builder implements and verifies, and a reviewer checks the diff; the lead plans and decides.",
      policy: .crewOnly, roles: [(id: "scout", parallel: 1), (id: "builder", parallel: 1), (id: "reviewer", parallel: 1)]),
    .init(id: "test-fix", englishName: "Test and fix",
      englishDescription: "A tester writes and runs failing tests, and a builder makes them pass; the lead sets the cases.",
      policy: .crewOnly, roles: [(id: "tester", parallel: 1), (id: "builder", parallel: 1)]),
    .init(id: "debug", englishName: "Debug crew",
      englishDescription: "An investigator finds the root cause, and a fixer lands the fix with a regression test.",
      policy: .crewOnly, roles: [(id: "investigator", parallel: 1), (id: "fixer", parallel: 1)]),
    .init(id: "parallel", englishName: "Parallel builders",
      englishDescription: "The lead splits the work; up to three builders implement and verify independent tasks at once.",
      policy: .crewOnly, roles: [(id: "builder", parallel: 3)]),
    .init(id: "review", englishName: "Review board",
      englishDescription: "Two independent read-only reviews of a change, and a sidekick applies the fixes.",
      policy: .crewOnly, roles: [(id: "reviewer", parallel: 2), (id: "sidekick", parallel: 1)]),
    .init(id: "explore", englishName: "Explore and plan",
      englishDescription: "Scouts map an unfamiliar codebase so the lead can plan without reading it all.",
      policy: .crewOnly, roles: [(id: "scout", parallel: 2)]),
    .init(id: "blank", englishName: "Blank crew",
      englishDescription: "One helper to build your own crew from.",
      policy: .crewFirst, roles: [(id: "helper", parallel: 1)]),
  ]
}
