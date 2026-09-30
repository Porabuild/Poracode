import Foundation

enum AdvancedOperationCategory: String, CaseIterable, Identifiable, Sendable {
  case threads
  case workflows
  case files
  case projectEntries
  case generation

  var id: String { rawValue }
}

enum AdvancedOperationRole: Sendable {
  case standard
  case destructive
}

/// One visible entry point per procedure.
struct AdvancedOperationDescriptor: Identifiable, Sendable {
  let procedure: AdvancedOperationProcedure
  let category: AdvancedOperationCategory
  let role: AdvancedOperationRole
  /// Overwrite-capable or destructive procedures always confirm first.
  let requiresConfirmation: Bool

  var id: AdvancedOperationProcedure { procedure }
  var scope: AdvancedOperationScope { procedure.metadata.scope }
  var ownerKind: AdvancedOperationOwnerKind { procedure.metadata.owner }
  var isRead: Bool { procedure.metadata.delivery == .readOnly }
  var title: String { AdvancedOperationsStrings.action(procedure) }
  var accessibilityLabel: String { AdvancedOperationsStrings.actionAccessibility(procedure) }
  var accessibilityIdentifier: String { "advancedOperations.action.\(procedure.rawValue)" }
  var symbol: String { AdvancedOperationsPresentation.symbol(procedure) }
}

enum AdvancedOperationsPresentation {
  /// Exactly one descriptor per procedure, in stable presentation order.
  static let descriptors: [AdvancedOperationDescriptor] =
    AdvancedOperationProcedure.allCases.map { procedure in
      AdvancedOperationDescriptor(
        procedure: procedure,
        category: category(procedure),
        role: role(procedure),
        requiresConfirmation: confirmingProcedures.contains(procedure)
      )
    }

  /// Write, move, rename, and delete can overwrite or destroy host state.
  static let confirmingProcedures: Set<AdvancedOperationProcedure> = [
    .writeExternalFile, .renameProjectEntry, .moveProjectEntry, .deleteProjectEntry,
  ]

  static func descriptors(in category: AdvancedOperationCategory) -> [AdvancedOperationDescriptor] {
    descriptors.filter { $0.category == category }
  }

  static func descriptor(
    for procedure: AdvancedOperationProcedure
  ) -> AdvancedOperationDescriptor {
    descriptors.first { $0.procedure == procedure } ?? descriptors[0]
  }

  static func category(_ procedure: AdvancedOperationProcedure) -> AdvancedOperationCategory {
    switch procedure {
    case .createFileCheckpoint, .finalizeFileCheckpoint, .subagentSubscribe,
      .subagentUnsubscribe, .stageThreadInput:
      .threads
    case .workflowGetRun, .workflowAgentChat:
      .workflows
    case .readAbsoluteFile, .readExternalFile, .writeExternalFile:
      .files
    case .createProjectEntry, .renameProjectEntry, .moveProjectEntry, .deleteProjectEntry:
      .projectEntries
    case .generateCommitMessage, .generateTitle, .generatePrSummary:
      .generation
    }
  }

  static func role(_ procedure: AdvancedOperationProcedure) -> AdvancedOperationRole {
    procedure == .deleteProjectEntry ? .destructive : .standard
  }

  static func symbol(_ procedure: AdvancedOperationProcedure) -> String {
    switch procedure {
    case .createFileCheckpoint: "checkmark.seal"
    case .finalizeFileCheckpoint: "seal"
    case .subagentSubscribe: "bell"
    case .subagentUnsubscribe: "bell.slash"
    case .stageThreadInput: "text.cursor"
    case .workflowGetRun: "square.stack.3d.up"
    case .workflowAgentChat: "bubble.left.and.bubble.right"
    case .readAbsoluteFile: "doc.text"
    case .readExternalFile: "doc.badge.arrow.up"
    case .writeExternalFile: "square.and.pencil"
    case .createProjectEntry: "plus.rectangle.on.folder"
    case .renameProjectEntry: "character.cursor.ibeam"
    case .moveProjectEntry: "arrow.right.doc.on.clipboard"
    case .deleteProjectEntry: "trash"
    case .generateCommitMessage: "text.badge.checkmark"
    case .generateTitle: "textformat"
    case .generatePrSummary: "list.bullet.rectangle"
    }
  }
}

/// Width-driven adaptation so iPhone and iPad share one screen implementation
/// without platform-only size-class APIs.
enum AdvancedOperationsLayout: Sendable {
  case compact
  case regular

  static let regularThreshold: Double = 700

  init(width: Double) {
    self = width >= Self.regularThreshold ? .regular : .compact
  }

  var columnMinimum: Double {
    switch self {
    case .compact: 150
    case .regular: 220
    }
  }

  var showsSideBySideOutcome: Bool { self == .regular }
}

/// Gating of one descriptor against the exact access minted for its procedure.
enum AdvancedOperationGating {
  static func permits(
    _ descriptor: AdvancedOperationDescriptor,
    access: AdvancedOperationSessionAccess?
  ) -> Bool {
    guard let access, access.isUsable else { return false }
    return access.permits(descriptor.scope)
      && access.lease.owner.kind == descriptor.ownerKind
  }
}
