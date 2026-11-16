import Foundation
import Observation

/// One selected conversation's bounded advisory read cache. It never writes history.
@MainActor @Observable final class RichRuntimeItemHeadingController {
  private(set) var headings: [String: RichRuntimeItemHeadingRecord] = [:]
  @ObservationIgnored private let gateway: any RichChatHistoryGateway
  private var scope = RichChatControllerScope()
  var target: RichChatThreadTarget? { scope.target }
  @ObservationIgnored private var wanted: [RichRuntimeItemHeadingRequest] = []
  @ObservationIgnored private var attempted: Set<RichRuntimeItemHeadingRequest> = []
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private var revision = UUID()
  init(gateway: any RichChatHistoryGateway) { self.gateway = gateway }

  func activate(access: RichChatSessionAccess, threadID: String) {
    deactivate(); scope = .init(access: access, threadID: threadID)
  }
  func deactivate() {
    cancel(); scope = .init(); wanted = []; attempted = []; headings = [:]
  }
  func updateAccess(_ access: RichChatSessionAccess) {
    guard scope.access?.lease == access.lease else { deactivate(); return }
    scope.access = access
    if !canRead { cancel() }
  }
  func enterBackground() { scope.isBackgrounded = true; cancel() }
  func leaveBackground(access: RichChatSessionAccess) { updateAccess(access); scope.isBackgrounded = false }

  func heading(_ item: RichRuntimeItem, projection: RichRuntimeItemHeadingProjection?) -> RichRuntimeItemHeading? {
    headings[item.id]?.displayHeading(for: item, projection: projection)
  }

  func workflowMetadata(_ item: RichRuntimeItem, projection: RichRuntimeItemHeadingProjection?) -> RichJSON? {
    guard let record = headings[item.id], record.request == RichRuntimeItemHeadingRequest(item, projection: projection) else { return nil }
    return record.heading.workflowMetadata
  }

  func request(_ requests: [RichRuntimeItemHeadingRequest]) {
    var seen: Set<String> = []
    wanted = requests.suffix(256).filter { seen.insert($0.itemID).inserted }
    let current = Set(wanted)
    headings = headings.filter { current.contains($0.value.request) }
    attempted.formIntersection(current)
    guard task == nil, canRead, let target = scope.target else { return }
    let revision = revision
    task = Task { [weak self] in
      guard let self else { return }
      defer { if self.revision == revision { self.task = nil } }
      await Task.yield() // Collect the current visible rows into a single batch.
      while !Task.isCancelled, self.revision == revision, self.canRead {
        let remaining = self.wanted.filter { !self.attempted.contains($0) }
        guard let version = remaining.first?.version else { break }
        let batch = Array(remaining.filter { $0.version == version }.prefix(32))
        guard !batch.isEmpty else { break }
        self.attempted.formUnion(batch)
        do {
          let records = try await self.gateway.loadRichRuntimeItemHeadings(target: target, requests: batch)
          guard !Task.isCancelled, self.revision == revision, self.scope.target == target, self.canRead else { break }
          let requested = Set(batch), current = Set(self.wanted)
          for record in records where requested.contains(record.request) && current.contains(record.request) {
            let otherBytes = self.headings.values.filter { $0.request.itemID != record.request.itemID }
              .reduce(0) { $0 + $1.heading.storageBytes }
            guard otherBytes + record.heading.storageBytes <= 2 * 1024 * 1024 else { continue }
            self.headings[record.request.itemID] = record
          }
        } catch { break } // Optional read: keep the canonical fallback; never retry in a loop.
      }
    }
  }

  func enqueue(_ requests: [RichRuntimeItemHeadingRequest]) {
    guard !requests.isEmpty else { return }
    let ids = Set(requests.map(\.itemID))
    request(wanted.filter { !ids.contains($0.itemID) } + requests)
  }

  /// A viewer-scoped read does not evict the registration/heading cache. It is
  /// fenced to this conversation and lease, and is never retried implicitly.
  func readAdvisory(_ request: RichRuntimeItemHeadingRequest) async throws -> RichRuntimeItemHeading? {
    let records = try await readAdvisoryValue { gateway, target in
      try await gateway.loadRichRuntimeItemHeadings(target: target, requests: [request])
    }
    return records.first(where: { $0.request == request })?.heading
  }

  var canReadAdvisory: Bool { canRead }

  /// Result bodies share the conversation's read authority, without displacing
  /// the small heading cache or retaining another copy of canonical output.
  func readBodyAdvisory(_ request: RichRuntimeItemHeadingRequest) async throws -> RichResolvedToolBodyRecord? {
    guard request.version == 5 else { throw RichChatGatewayError.invalidRequest }
    let records = try await readAdvisoryValue { gateway, target in
      try await gateway.loadRichRuntimeToolBodies(target: target, requests: [request])
    }
    return records.first(where: { $0.request == request })
  }

  private func readAdvisoryValue<Value: Sendable>(
    _ operation: (any RichChatHistoryGateway, RichChatThreadTarget) async throws -> Value
  ) async throws -> Value {
    guard canRead, let target = scope.target else { throw RichChatGatewayError.unavailable }
    let revision = revision
    let value = try await operation(gateway, target)
    try Task.checkCancellation()
    guard self.revision == revision, scope.target == target, canRead else { throw CancellationError() }
    return value
  }

  private var canRead: Bool {
    !scope.isBackgrounded && scope.access?.isOnline == true && scope.access?.isReady == true
      && scope.access?.capabilities.contains(.sessionRead) == true
  }
  private func cancel() { revision = UUID(); task?.cancel(); task = nil }
}
