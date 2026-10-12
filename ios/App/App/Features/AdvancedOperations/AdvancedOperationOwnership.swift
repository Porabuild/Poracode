import Foundation

enum AdvancedOperationOwner: Equatable, Hashable, Sendable {
  case thread(threadID: String, projectLocation: ProjectLocation?)
  case location(ProjectLocation, threadID: String?)
  case projectLocation(ProjectLocation)

  var kind: AdvancedOperationOwnerKind {
    switch self {
    case .thread: .thread
    case .location: .location
    case .projectLocation: .projectLocation
    }
  }
}

struct AdvancedOperationHostIdentity: Equatable, Hashable, Sendable {
  let connectionID: ClientConnectionID
  let desktopID: String
}

/// Exact ownership captured before work crosses an await boundary.
struct AdvancedOperationLease: Equatable, Hashable, Sendable {
  let host: AdvancedOperationHostIdentity
  let sessionID: UUID
  let sessionGeneration: UInt64
  let ownerGeneration: UInt64
  let owner: AdvancedOperationOwner

  var isValid: Bool {
    !desktopIDIsEmpty && ownerIsValid
  }

  private var desktopIDIsEmpty: Bool { host.desktopID.isEmpty }

  private var ownerIsValid: Bool {
    switch owner {
    case .thread(let threadID, _):
      !threadID.isEmpty
    case .location(_, let threadID):
      threadID?.isEmpty != true
    case .projectLocation:
      true
    }
  }
}

struct AdvancedOperationSessionAccess: Equatable, Sendable {
  let lease: AdvancedOperationLease
  let isOnline: Bool
  let isReady: Bool
  let isForeground: Bool
  let scopes: Set<AdvancedOperationScope>
}
