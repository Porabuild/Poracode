import Foundation

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

/// Gateway stub that records every dispatch and can hold a call open so tests
/// can move the owner underneath an in-flight operation deterministically.
actor AdvancedGatewayStub: AdvancedOperationsGateway {
  enum Outcome: Sendable {
    case success(AdvancedOperationResult)
    case failure(AdvancedOperationFailure)
    case cancelled
  }

  private var outcomes: [Outcome]
  private var isGateOpen: Bool
  private var gate: CheckedContinuation<Void, Never>?
  private var entryWaiters: [CheckedContinuation<Void, Never>] = []
  private(set) var requests: [AdvancedOperationRequest] = []
  private(set) var leases: [AdvancedOperationLease] = []

  init(outcomes: [Outcome], gated: Bool = false) {
    self.outcomes = outcomes
    isGateOpen = !gated
  }

  func call(
    _ request: AdvancedOperationRequest,
    lease: AdvancedOperationLease
  ) async throws -> AdvancedOperationResult {
    requests.append(request)
    leases.append(lease)
    for waiter in entryWaiters { waiter.resume() }
    entryWaiters = []
    if !isGateOpen {
      await withCheckedContinuation { continuation in
        if isGateOpen {
          continuation.resume()
        } else {
          gate = continuation
        }
      }
    }
    let outcome = outcomes.isEmpty ? Outcome.failure(.transport) : outcomes.removeFirst()
    switch outcome {
    case .success(let result): return result
    case .failure(let failure): throw failure
    case .cancelled: throw CancellationError()
    }
  }

  func openGate() {
    isGateOpen = true
    gate?.resume()
    gate = nil
  }

  func waitUntilCalled() async {
    guard requests.isEmpty else { return }
    await withCheckedContinuation { entryWaiters.append($0) }
  }

  func callCount() -> Int { requests.count }
  func recordedRequests() -> [AdvancedOperationRequest] { requests }
  func recordedLeases() -> [AdvancedOperationLease] { leases }
}

/// Mutable stand-in for the session access the integration step will supply.
@MainActor
final class AdvancedOperationsHarness {
  var threadID = "thread-advanced"
  var threadLocation: ProjectLocation = .posix(path: "/srv/advanced")
  var location: ProjectLocation = .posix(path: "/srv/advanced")
  var desktopID = "desktop-advanced"
  var sessionGeneration: UInt64 = 7
  var ownerGeneration: UInt64 = 11
  var isOnline = true
  var isReady = true
  var isForeground = true
  var scopes: Set<AdvancedOperationScope> = Set(AdvancedOperationScope.allCases)
  var hasSession = true
  private(set) var refreshRequests: [(AdvancedOperationProcedure, AdvancedOperationLease)] = []
  let gateway: AdvancedGatewayStub

  init(gateway: AdvancedGatewayStub = AdvancedGatewayStub(outcomes: [])) {
    self.gateway = gateway
  }

  var composition: AdvancedOperationsComposition {
    AdvancedOperationsComposition(
      access: { [weak self] procedure in self?.access(for: procedure) },
      gateway: gateway,
      requestAuthoritativeRefresh: { [weak self] procedure, lease in
        self?.refreshRequests.append((procedure, lease))
      }
    )
  }

  var model: AdvancedOperationsScreenModel {
    AdvancedOperationsScreenModel(composition: composition)
  }

  func owner(for procedure: AdvancedOperationProcedure) -> AdvancedOperationOwner {
    switch procedure {
    case .createFileCheckpoint, .finalizeFileCheckpoint:
      .thread(threadID: threadID, projectLocation: threadLocation)
    case .subagentSubscribe, .subagentUnsubscribe, .stageThreadInput:
      .thread(threadID: threadID, projectLocation: nil)
    case .workflowGetRun:
      .location(location, threadID: nil)
    case .workflowAgentChat:
      .location(location, threadID: threadID)
    default:
      .projectLocation(location)
    }
  }

  func lease(for procedure: AdvancedOperationProcedure) -> AdvancedOperationLease {
    AdvancedOperationLease(
      host: AdvancedOperationHostIdentity(
        connectionID: ClientConnectionID(
          UUID(uuidString: "11111111-2222-4333-8444-555555555555")!
        ),
        desktopID: desktopID
      ),
      sessionID: UUID(uuidString: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")!,
      sessionGeneration: sessionGeneration,
      ownerGeneration: ownerGeneration,
      owner: owner(for: procedure)
    )
  }

  func access(for procedure: AdvancedOperationProcedure) -> AdvancedOperationSessionAccess? {
    guard hasSession else { return nil }
    return AdvancedOperationSessionAccess(
      lease: lease(for: procedure),
      isOnline: isOnline,
      isReady: isReady,
      isForeground: isForeground,
      scopes: scopes
    )
  }

  func refreshCount() -> Int { refreshRequests.count }

  func lastRefresh() -> (AdvancedOperationProcedure, AdvancedOperationLease)? {
    refreshRequests.last
  }
}

/// Builds the draft a user would have filled in to produce a fixture request.
enum AdvancedDraftFactory {
  static func draft(for request: AdvancedOperationRequest) -> AdvancedOperationDraft {
    var draft = AdvancedOperationDraft(procedure: request.procedure)
    switch request {
    case .createFileCheckpoint(let value):
      draft.setValue(value.checkpointItemId, for: .checkpointItemId)
    case .finalizeFileCheckpoint(let value):
      draft.setValue(value.checkpointItemId, for: .checkpointItemId)
      draft.setValue(value.baseCheckpointItemId, for: .baseCheckpointItemId)
    case .subagentSubscribe(let value), .subagentUnsubscribe(let value):
      draft.setValue(value.parentItemId, for: .parentItemId)
    case .stageThreadInput(let value):
      draft.setValue(value.prompt, for: .prompt)
      if let segments = value.segments {
        draft.includesSegments = true
        draft.segments = segments.map(segmentDraft)
      }
    case .workflowGetRun(let value):
      draft.setValue(value.manifestPath, for: .manifestPath)
      draft.setValue(value.transcriptDir ?? "", for: .transcriptDir)
      draft.setFlag(AdvancedOptionalFlag(value.includeAgentChats), for: .includeAgentChats)
    case .workflowAgentChat(let value):
      draft.setValue(value.transcriptDir, for: .transcriptDir)
      draft.setValue(value.agentId, for: .agentId)
      draft.setFlag(AdvancedOptionalFlag(value.agentFinished), for: .agentFinished)
    case .readAbsoluteFile(let value), .readExternalFile(let value):
      draft.setValue(value.absolutePath, for: .absolutePath)
    case .writeExternalFile(let value):
      draft.setValue(value.absolutePath, for: .absolutePath)
      draft.setValue(value.content, for: .content)
      draft.setValue(String(Int64(value.baseModifiedAtMs)), for: .baseModifiedAtMs)
    case .createProjectEntry(let value):
      draft.setValue(value.path, for: .path)
      draft.entryType = value.entryType
    case .renameProjectEntry(let value):
      draft.setValue(value.path, for: .path)
      draft.setValue(value.nextName, for: .nextName)
    case .moveProjectEntry(let value):
      draft.setValue(value.path, for: .path)
      draft.setValue(value.nextParentPath ?? "", for: .nextParentPath)
    case .deleteProjectEntry(let value):
      draft.setValue(value.path, for: .path)
    case .generateCommitMessage(let value):
      draft.setValue(value.agentKind, for: .agentKind)
      apply(&draft, effort: value.effort, language: value.language, model: value.model)
      draft.setFlag(AdvancedOptionalFlag(value.fast), for: .fast)
    case .generateTitle(let value):
      draft.setValue(value.agentKind, for: .agentKind)
      draft.setValue(value.prompt, for: .prompt)
      apply(&draft, effort: value.effort, language: value.language, model: value.model)
      draft.setFlag(AdvancedOptionalFlag(value.fast), for: .fast)
    case .generatePrSummary(let value):
      draft.setValue(value.agentKind, for: .agentKind)
      draft.setValue(value.branch, for: .branch)
      draft.setValue(value.baseBranch, for: .baseBranch)
      apply(&draft, effort: value.effort, language: value.language, model: value.model)
    }
    return draft
  }

  private static func apply(
    _ draft: inout AdvancedOperationDraft,
    effort: String?,
    language: String?,
    model: String?
  ) {
    draft.setValue(effort ?? "", for: .effort)
    draft.setValue(language ?? "", for: .language)
    draft.setValue(model ?? "", for: .model)
  }

  private static func segmentDraft(_ segment: AdvancedThreadInputSegment) -> AdvancedSegmentDraft {
    var draft = AdvancedSegmentDraft(kind: segment.kind)
    switch segment {
    case .text(let content):
      draft.content = content
    case .file(let path):
      draft.path = path
    case .attachment(let path, let mimeType):
      draft.path = path
      draft.mimeType = mimeType ?? ""
    case .diffComment(let path, let lineNumber, let side, let staged, let body):
      draft.path = path
      draft.lineNumber = String(lineNumber)
      draft.side = side
      draft.staged = staged
      draft.body = body
    case .skill(let name, let path, let invocation, let provider, let scope, let id, let plugin):
      draft.name = name
      draft.path = path
      draft.invocation = invocation
      draft.provider = provider
      draft.scope = scope
      draft.pluginId = id ?? ""
      draft.pluginName = plugin ?? ""
    case .mcp(let id, let name):
      draft.identifier = id
      draft.name = name
    }
    return draft
  }
}
