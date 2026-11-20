import Foundation
import Observation

/// Window-owned, read-only viewer. The session activity store remains the
/// independent owner of detached run liveness when this surface disappears.
@MainActor @Observable final class WorkflowViewerController {
  typealias ReadPlan = @MainActor () async throws -> RichWorkflowViewPlan?
  typealias ReadRun = @MainActor (WorkflowRunReference) async throws -> AdvancedWorkflowGetRunResult
  private(set) var plan = RichWorkflowViewPlan.empty
  private(set) var reference: WorkflowRunReference?
  private(set) var run: AdvancedWorkflowRun?
  private(set) var isLoading = false
  private(set) var failed = false
  let agentTranscript = WorkflowAgentTranscriptController()
  let disclosures = TranscriptDisclosureStore()
  private(set) var phaseTitle: String?
  var agentID: String?
  private var revision = UUID()

  var projection: RichWorkflowViewerProjection { .init(run: run, plan: plan) }
  var selectedPhase: RichWorkflowPhaseSection? { projection.phases.first { $0.title == phaseTitle } ?? projection.phases.first }
  var selectedAgent: RichWorkflowAgentRow? { projection.agent(agentID) }

  func selectPhase(_ id: Int) { phaseTitle = projection.phases.first { $0.id == id }?.title; agentID = nil }
  func invalidate() { revision = UUID(); isLoading = false }

  func load(canonicalReference: WorkflowRunReference?, readPlan: ReadPlan, readRun: ReadRun,
    polls: Bool = true) async {
    let token = UUID(); revision = token
    isLoading = run == nil; failed = false
    do {
      let nextPlan: RichWorkflowViewPlan?
      do { nextPlan = try await readPlan() }
      catch is CancellationError { throw CancellationError() }
      catch {
        guard canonicalReference != nil else { throw error }
        nextPlan = nil // Older/unavailable advisory reads never block a valid canonical run.
      }
      try Task.checkCancellation()
      guard revision == token else { return }
      if let nextPlan { plan = nextPlan }
      let nextReference = canonicalReference ?? nextPlan?.reference
      if reference != nextReference {
        run = nil; agentID = nil
        if reference != nil { phaseTitle = nil }
      }
      reference = nextReference
      guard let reference else { isLoading = false; return }
      repeat {
        let result = try await readRun(reference)
        try Task.checkCancellation()
        guard revision == token else { return }
        if let run = result.run {
          guard run.runId == reference.runID else { throw WorkflowActivityReadFailure.invalidResponse }
          self.run = run
        }
        isLoading = false
        if !polls || [.completed, .failed, .cancelled].contains(run?.status) { return }
        try await Task.sleep(for: .milliseconds(1500))
      } while !Task.isCancelled && revision == token
    } catch is CancellationError { }
    catch {
      guard revision == token, !Task.isCancelled else { return }
      failed = true; isLoading = false
    }
  }
}

@MainActor @Observable final class WorkflowAgentTranscriptController {
  typealias Read = @MainActor (String) async throws -> AdvancedWorkflowAgentChatResult
  private(set) var projection: RichTimelineProjection?
  private(set) var failed = false
  private(set) var settled = false
  private(set) var agentID: String?
  private(set) var headings: [String: RichRuntimeItemHeadingRecord] = [:]
  private(set) var bodies: [String: RichResolvedToolBodyRecord] = [:]
  private var lastPresentation: AdvancedJSONValue?
  private var revision = UUID()

  func invalidate() { revision = UUID() }

  func load(agentID: String, threadID: String, finished: Bool, read: Read,
    catalog: RichToolPresentationCatalog? = nil, polls: Bool = true) async {
    let token = UUID(); revision = token
    if self.agentID != agentID { projection = nil; settled = false; headings = [:]; bodies = [:]; lastPresentation = nil }
    self.agentID = agentID; failed = false
    do {
      repeat {
        let result = try await read(threadID)
        try Task.checkCancellation()
        guard revision == token else { return }
        let next = try Self.project(result.events, threadID: threadID)
        if lastPresentation != result.itemPresentations {
          let decoded = RichRuntimeItemHeadingSnapshot.decode(result.itemPresentations, projection: next, catalog: catalog)
          headings = decoded.headings; bodies = decoded.bodies
          lastPresentation = result.itemPresentations
        }
        if projection != next { projection = next }
        settled = true; failed = false
        if finished || !polls { return }
        try await Task.sleep(for: .milliseconds(1500))
      } while !Task.isCancelled && revision == token
    } catch is CancellationError { }
    catch {
      guard revision == token, !Task.isCancelled else { return }
      failed = true; settled = true
    }
  }

  static func project(_ events: [AdvancedRuntimeEvent], threadID: String) throws -> RichTimelineProjection {
    var state = RichTranscriptState(threadID: threadID)
    for raw in events {
      let value = try RichJSON.decode(JSONEncoder().encode(raw))
      let event = try RichRuntimeEventDecoder.decode(value)
      guard event.threadID == threadID else { throw WorkflowActivityReadFailure.invalidResponse }
      state.apply(event)
    }
    return RichTimeline.project(state.itemsInOrder)
  }
}
