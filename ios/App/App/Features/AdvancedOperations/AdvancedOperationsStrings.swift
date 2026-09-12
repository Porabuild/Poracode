import Foundation

/// Every user-visible string in this feature resolves through the
/// feature-local `AdvancedOperations` catalog.
enum AdvancedOperationsStrings {
  static var title: String { localized("advancedOperations.title") }
  static var subtitle: String { localized("advancedOperations.subtitle") }
  static var inputs: String { localized("advancedOperations.section.inputs") }
  static var options: String { localized("advancedOperations.section.options") }
  static var segmentsSection: String { localized("advancedOperations.section.segments") }
  static var ownerSection: String { localized("advancedOperations.section.owner") }
  static var outcomeSection: String { localized("advancedOperations.section.outcome") }
  static var run: String { localized("advancedOperations.run") }
  static var cancel: String { localized("advancedOperations.cancel") }
  static var confirm: String { localized("advancedOperations.confirm") }
  static var close: String { localized("advancedOperations.close") }
  static var dismiss: String { localized("advancedOperations.dismiss") }
  static var addSegment: String { localized("advancedOperations.addSegment") }
  static var removeSegment: String { localized("advancedOperations.removeSegment") }
  static var includeSegments: String { localized("advancedOperations.includeSegments") }
  static var optionalValue: String { localized("advancedOperations.optionalValue") }
  static var notReady: String { localized("advancedOperations.notReady") }
  static var noOutcome: String { localized("advancedOperations.noOutcome") }
  static var acknowledged: String { localized("advancedOperations.acknowledged") }
  static var working: String { localized("advancedOperations.working") }
  static var refreshRequired: String { localized("advancedOperations.refreshRequired") }
  static var refreshAcknowledge: String { localized("advancedOperations.refreshAcknowledge") }
  static var unknown: String { localized("advancedOperations.unknown") }
  static var elision: String { localized("advancedOperations.elision") }
  static var binaryContent: String { localized("advancedOperations.binaryContent") }
  static var noRun: String { localized("advancedOperations.noRun") }
  static var ownerThread: String { localized("advancedOperations.owner.thread") }
  static var ownerLocation: String { localized("advancedOperations.owner.location") }
  static var entryType: String { localized("advancedOperations.entryType") }
  static var entryTypeFile: String { localized("advancedOperations.entryType.file") }
  static var entryTypeDirectory: String { localized("advancedOperations.entryType.directory") }
  static var actionHint: String { localized("advancedOperations.actionHint") }
  static var readAgain: String { localized("advancedOperations.readAgain") }
  static var unavailableNoHost: String {
    localized("advancedOperations.unavailable.noHost")
  }
  static var unavailableNoProject: String {
    localized("advancedOperations.unavailable.noProject")
  }
  static var unavailableNoThread: String {
    localized("advancedOperations.unavailable.noThread")
  }
  static var unavailableNoLocation: String {
    localized("advancedOperations.unavailable.noLocation")
  }
  static var openFromProject: String { localized("advancedOperations.open.project") }
  static var openFromThread: String { localized("advancedOperations.open.thread") }

  static func action(_ procedure: AdvancedOperationProcedure) -> String {
    localized("advancedOperations.action.\(procedure.rawValue)")
  }

  static func actionAccessibility(_ procedure: AdvancedOperationProcedure) -> String {
    format("advancedOperations.accessibility.action", action(procedure))
  }

  static func outcomeAccessibility(_ title: String, _ rows: Int) -> String {
    String.localizedStringWithFormat(
      localized("advancedOperations.accessibility.outcome"),
      title,
      rows
    )
  }

  static func category(_ value: AdvancedOperationCategory) -> String {
    localized("advancedOperations.category.\(value.rawValue)")
  }

  static func field(_ key: AdvancedFormFieldKey) -> String {
    localized("advancedOperations.field.\(key.rawValue)")
  }

  static func flag(_ key: AdvancedFormFlagKey) -> String {
    localized("advancedOperations.flag.\(key.rawValue)")
  }

  static func optionalFlag(_ value: AdvancedOptionalFlag) -> String {
    localized("advancedOperations.optionalFlag.\(value.rawValue)")
  }

  static func segmentKind(_ value: AdvancedSegmentKind) -> String {
    localized("advancedOperations.segmentKind.\(value.rawValue)")
  }

  static func segmentField(_ key: AdvancedSegmentFieldKey) -> String {
    localized("advancedOperations.segmentField.\(key.rawValue)")
  }

  static func diffSide(_ value: AdvancedDiffSide) -> String {
    localized("advancedOperations.diffSide.\(value.rawValue)")
  }

  static func skillScope(_ value: AdvancedSkillScope) -> String {
    localized("advancedOperations.skillScope.\(value.rawValue)")
  }

  static func outcomeLabel(_ value: AdvancedOutcomeLabel) -> String {
    localized("advancedOperations.outcome.\(value.rawValue)")
  }

  static func readStatus(_ value: AdvancedFileReadStatus) -> String {
    localized("advancedOperations.readStatus.\(value.rawValue)")
  }

  static func runStatus(_ value: AdvancedWorkflowRunStatus) -> String {
    localized("advancedOperations.runStatus.\(value.rawValue)")
  }

  static func lineEnding(_ value: AdvancedLineEnding) -> String {
    localized("advancedOperations.lineEnding.\(value.rawValue)")
  }

  static func boolean(_ value: Bool) -> String {
    localized(value ? "advancedOperations.yes" : "advancedOperations.no")
  }

  /// Host-provided change statuses are mapped to known labels; anything else
  /// is reported generically instead of echoed.
  static func changeStatus(_ value: String) -> String {
    switch value {
    case "added": localized("advancedOperations.change.added")
    case "modified": localized("advancedOperations.change.modified")
    case "deleted": localized("advancedOperations.change.deleted")
    case "renamed": localized("advancedOperations.change.renamed")
    default: localized("advancedOperations.change.other")
    }
  }

  static func locationPosix(_ path: String) -> String {
    format("advancedOperations.location.posix", path)
  }

  static func locationWindows(_ path: String) -> String {
    format("advancedOperations.location.windows", path)
  }

  static func locationWSL(_ distro: String, _ path: String) -> String {
    String.localizedStringWithFormat(
      localized("advancedOperations.location.wsl"),
      distro,
      path
    )
  }

  static func scope(_ value: AdvancedOperationScope) -> String {
    switch value {
    case .sessionRead: localized("advancedOperations.scope.sessionRead")
    case .sessionOperate: localized("advancedOperations.scope.sessionOperate")
    case .projectsManage: localized("advancedOperations.scope.projectsManage")
    }
  }

  static func format(_ key: String, _ value: String) -> String {
    String.localizedStringWithFormat(localized(key), value)
  }

  static func localized(_ key: String) -> String {
    String(
      localized: String.LocalizationValue(key),
      table: "AdvancedOperations",
      bundle: .main
    )
  }
}
