import Foundation
import XCTest

@testable import App

/// Shared URLProtocol host double for the B4 bounded-read suites.
///
/// It serves real wire JSON, so every test drives the production
/// `RemoteAPIClient` → generated codec → app-model path. Host state is mutated
/// by tests between (or during) requests to reproduce churn and restore races.
final class BoundedCatalogURLProtocol: URLProtocol {
  struct Request {
    var method: String
    var path: String
    var query: [String: String]
    var body: [String: Any]?
    var headers: [String: String]?
    /// Request URL host, used by the fresh-pair/host-switch fixtures to serve
    /// per-host identity on the same in-memory host.
    var host: String
  }

  private static let lock = NSLock()
  /// Epoch token sent as a header by every session `makeSession()` creates.
  /// Each test's install/reset opens and closes one epoch: a leaked in-flight
  /// client from a finished test carries its own (now-closed) token and is
  /// answered `no_host` — it can never be served by, or counted against, the
  /// fixture a later test installs. A mid-test `install` swaps the fixture
  /// under the live token, so host swaps stay visible to existing clients.
  static let epochHeader = "X-Poracode-Test-Epoch"
  nonisolated(unsafe) private static var fixturesByEpoch: [String: BoundedCatalogHostFixture] = [:]
  nonisolated(unsafe) private static var liveEpoch: String?
  nonisolated(unsafe) private static var epochCounter = 0

  private static func openEpochIfNeeded() -> String {
    if let epoch = liveEpoch { return epoch }
    epochCounter += 1
    let epoch = "bounded-\(epochCounter)"
    liveEpoch = epoch
    return epoch
  }

  static func install(_ fixture: BoundedCatalogHostFixture) {
    lock.lock()
    defer { lock.unlock() }
    fixturesByEpoch[openEpochIfNeeded()] = fixture
  }

  static func reset() {
    lock.lock()
    if let epoch = liveEpoch { fixturesByEpoch[epoch] = nil }
    liveEpoch = nil
    lock.unlock()
  }

  static func makeSession() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [BoundedCatalogURLProtocol.self]
    config.httpAdditionalHeaders = [epochHeader: openEpochIfNeededLocked()]
    // A concurrent delegate queue: a held page blocks only its own request, so
    // an unrelated read (history, membership) still reaches the fixture while
    // one walk page is suspended.
    let queue = OperationQueue()
    queue.maxConcurrentOperationCount = 8
    queue.name = "BoundedCatalogURLProtocol"
    return URLSession(configuration: config, delegate: nil, delegateQueue: queue)
  }

  private static func openEpochIfNeededLocked() -> String {
    lock.lock()
    defer { lock.unlock() }
    return openEpochIfNeeded()
  }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    Self.lock.lock()
    let epoch = request.value(forHTTPHeaderField: Self.epochHeader)
    let fixture = epoch.flatMap { Self.fixturesByEpoch[$0] }
    Self.lock.unlock()
    guard let fixture else {
      finish(status: 500, body: Data(#"{"error":{"code":"no_host","message":"no host"}}"#.utf8))
      return
    }
    let url = request.url ?? URL(string: "https://a.test/")!
    var query: [String: String] = [:]
    for item in URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? [] {
      query[item.name] = item.value
    }
    var body: [String: Any]?
    if let data = request.httpBody ?? request.httpBodyStream.flatMap(Self.readAll) {
      body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
    let captured = Request(
      method: request.httpMethod ?? "GET", path: url.path, query: query, body: body,
      headers: request.allHTTPHeaderFields, host: url.host ?? ""
    )
    fixture.note(captured)
    let response = fixture.respond(to: captured)
    // A held page suspends only this request; the response body was already
    // built from the host state at request time, so a later host mutation
    // leaves it stale — exactly a real in-flight read.
    let isWalk = captured.path == "/api/threads" || captured.path == "/api/projects"
    if (isWalk && fixture.holdWalks) || fixture.heldPaths.contains(captured.path) {
      fixture.hold { [weak self] in
        self?.finish(status: response.status, body: response.body)
      }
      return
    }
    finish(status: response.status, body: response.body)
  }

  private func finish(status: Int, body: Data) {
    let response = HTTPURLResponse(
      url: request.url ?? URL(string: "https://a.test/")!,
      statusCode: status,
      httpVersion: "HTTP/1.1",
      headerFields: ["Content-Type": "application/json"]
    )!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: body)
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}

  private static func readAll(_ stream: InputStream) -> Data? {
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 4096)
    while stream.hasBytesAvailable {
      let read = stream.read(&buffer, maxLength: buffer.count)
      if read <= 0 { break }
      data.append(buffer, count: read)
    }
    return data
  }
}

/// Deterministic in-memory host for the bounded-read suites.
///
/// Rows are produced by encoding the app's own wire models, so every served
/// page must pass the generated response codecs — a malformed fixture is a
/// visible test failure, not a silently accepted shortcut.
class BoundedCatalogHostFixture: @unchecked Sendable {
  struct Response {
    var status: Int
    var body: Data
  }

  struct ThreadSeed {
    var id: String
    var projectId: String
    var updatedAt: String
    var title: String
    var status: String = "idle"
    var attention: String = "none"
    var archived = false
  }

  struct ProjectSeed {
    var id: String
    var name: String
    var createdAt: String
  }

  struct TurnSeed {
    var startedAt: String
    var endedAt: String
    var anchorItemId: String?
  }

  let lock = NSLock()
  private(set) var requests: [BoundedCatalogURLProtocol.Request] = []
  private(set) var membershipBatches: [[String: [String]]] = []

  var declared = true
  /// Per-request-URL desktop identity for the fresh-pair/host-switch proof
  /// gaps. The default keeps the single "desk-a" identity every other suite
  /// already expects.
  var desktopIdForHost: (String) -> String = { _ in "desk-a" }
  var snapshotSeq = 42
  var threadPageLimit = 100
  var projectPageLimit = 50
  var historyTurnsLimit = 200
  var inventoryLimit = 200
  /// Optional per-path hook, invoked before the response is produced. Tests
  /// block on a semaphore here to hold a page in flight.
  var beforeRespond: (@Sendable (String, [String: String]) -> Void)?
  /// Invoked inside a membership request, before the live-id sets are read.
  /// Lets a restore race be replayed deterministically.
  var beforeMembershipRespond: (() -> Void)?
  /// When true, walk page responses are withheld until `releaseWalks()`.
  var holdWalks = false
  /// Additional exact paths whose responses are withheld until `releaseWalks()`.
  var heldPaths: Set<String> = []
  private var heldResumers: [() -> Void] = []

  func hold(_ resume: @escaping () -> Void) {
    lock.lock()
    heldResumers.append(resume)
    lock.unlock()
  }

  func releaseWalks() {
    holdWalks = false
    lock.lock()
    let resumers = heldResumers
    heldResumers.removeAll()
    lock.unlock()
    for resume in resumers { resume() }
  }
  /// Simulates a host that omitted the capability echo on a route after
  /// negotiation (declared capability violation).
  var suppressEchoPaths: Set<String> = []
  /// Serves a different capability literal (schema-invalid on purpose).
  var echoOverride: String?
  /// Drops page-1 `inventoryFrontier` (declared capability violation).
  var omitInventoryFrontier = false
  /// Refuses thread cursors with `400 invalid_thread_cursor`.
  var rejectThreadCursor = false

  /// B1: capability advertisement on the environment descriptor. `nil` keeps
  /// the historic descriptor (no notices/catalog-signal capabilities).
  var runtimeHistoryNoticesVersions: [Int]? = nil
  var boundedCatalogChangesVersions: [Int]? = nil
  /// When true a gap thread refuses transcript reads with the host's
  /// persistence fence (503) regardless of declaration.
  var gapFenceEnabled = true
  /// Number of leading environment handshakes answered with 503 before the
  /// descriptor is served (preflight-failure reconciliation tests).
  var environmentFailures = 0
  /// Served `runtimeNextCursor` on the history snapshot (older item pages).
  var historyRuntimeNextCursor: Int? = nil

  private var threads: [ThreadSeed] = []
  private var projects: [ProjectSeed] = []
  private var turns: [String: [TurnSeed]] = [:]
  private var historyItems: [String: [PersistedRuntimeItem]] = [:]
  private var notices: [String: RemoteHistoryNotice] = [:]
  private var gaps: [String: RemoteHistoryGapDescriptor] = [:]
  private var acknowledgedTokens: Set<String> = []
  private(set) var acknowledgeRequests: [BoundedCatalogURLProtocol.Request] = []

  // MARK: - Mutation

  func setThreads(_ seeds: [ThreadSeed]) { threads = seeds }
  func setProjects(_ seeds: [ProjectSeed]) { projects = seeds }
  func setTurns(_ seeds: [TurnSeed], forThread id: String) { turns[id] = seeds }

  /// B1: the durable notice served on transcript reads, or nil to serve none.
  func setNotice(_ notice: RemoteHistoryNotice?, forThread id: String) {
    notices[id] = notice
  }

  /// B1: an unacknowledged episode descriptor served by the gap route. While
  /// present (and `gapFenceEnabled`) transcript reads are refused 503.
  func setGap(_ gap: RemoteHistoryGapDescriptor?, forThread id: String) {
    gaps[id] = gap
  }

  /// Runtime items for one thread, oldest first. The bounded items route pages
  /// by `beforePosition` (exclusive, newest-first response).
  func setHistoryItems(_ items: [PersistedRuntimeItem], forThread id: String) {
    historyItems[id] = items
  }

  /// Applies a supervisor `thread-state` mutation to the fixture row, like the
  /// host's durable write would.
  func mutateThread(
    id: String,
    status: String? = nil,
    attention: String? = nil
  ) {
    guard let index = threads.firstIndex(where: { $0.id == id }) else { return }
    if let status { threads[index].status = status }
    if let attention { threads[index].attention = attention }
  }

  func insertThread(_ seed: ThreadSeed) { threads.append(seed) }

  func deleteThread(_ id: String) { threads.removeAll { $0.id == id } }

  func restoreThread(_ seed: ThreadSeed) {
    deleteThread(seed.id)
    threads.append(seed)
  }

  func deleteProject(_ id: String) {
    projects.removeAll { $0.id == id }
    threads.removeAll { $0.projectId == id }
  }

  func restoreProject(_ seed: ProjectSeed) {
    deleteProject(seed.id)
    projects.append(seed)
  }

  func threadIds() -> [String] { threads.map(\.id).sorted() }
  func projectIds() -> [String] { projects.map(\.id).sorted() }
  func turns(forThread id: String) -> [TurnSeed] { turns[id] ?? [] }

  func requests(matching path: String) -> [BoundedCatalogURLProtocol.Request] {
    lock.lock()
    defer { lock.unlock() }
    return requests.filter { $0.path == path }
  }

  func requestCount(_ path: String) -> Int { requests(matching: path).count }

  // MARK: - Request handling

  func note(_ request: BoundedCatalogURLProtocol.Request) {
    lock.lock()
    requests.append(request)
    lock.unlock()
  }

  func respond(to request: BoundedCatalogURLProtocol.Request) -> Response {
    beforeRespond?(request.path, request.query)
    return buildResponse(to: request)
  }

  private func buildResponse(to request: BoundedCatalogURLProtocol.Request) -> Response {
    let declaredHere = declared && !suppressEchoPaths.contains(request.path)
    // Request-faithful negotiation: the bounded shape is served only to a
    // request that actually asked for it (`reads=bounded-v1`). A declared host
    // still answers an undeclared legacy request with the complete legacy
    // shape and no echo — exactly the pre-B4 production behavior — so a
    // controller wired to the legacy route cannot pass by fixture accident.
    let readsRequested = request.query["reads"] == RemoteBoundedReads.capability
    if rejectThreadCursor, request.path == "/api/threads", request.query["cursor"] != nil {
      return Response(
        status: 400,
        body: Data(#"{"error":{"code":"invalid_thread_cursor","message":"bad cursor"}}"#.utf8)
      )
    }
    // B1 routes are matched before the transcript routes: a `/runtime/gap`
    // path also ends in `/gap`, not `/history`, but the ack body route must be
    // distinguished from the descriptor read.
    if request.path.hasSuffix("/runtime/gap/acknowledge") {
      return gapAcknowledgeResponse(request)
    }
    if request.path.hasSuffix("/runtime/gap") {
      return gapResponse(request)
    }
    if let threadId = threadId(fromHistoryPath: request.path),
      gaps[threadId] != nil, gapFenceEnabled,
      request.path.hasSuffix("/history") || request.path.hasSuffix("/history/items")
        || request.path.hasSuffix("/turns")
    {
      // The host's persistence fence refuses a cursor-consistent read while an
      // episode is unacknowledged, whether or not the reader declares notices.
      return Response(
        status: 503,
        body: Data(
          #"{"error":{"code":"persistence_degraded","message":"accepted events could not be committed"}}"#
            .utf8
        )
      )
    }
    switch request.path {
    case ProtocolConstants.environmentPath, ProtocolConstants.legacyEnvironmentPath,
      "/api/environment":
      if environmentFailures > 0 {
        environmentFailures -= 1
        return Response(
          status: 503,
          body: Data(#"{"error":{"code":"unavailable","message":"try later"}}"#.utf8)
        )
      }
      return json(environmentBody(host: request.host))
    case ProtocolConstants.oauthTokenPath:
      let credential = request.body?["credential"] as? String ?? "unknown"
      return json([
        "accessToken": "token-\(credential)",
        "tokenType": ProtocolConstants.bearerTokenType,
        "expiresAt": iso(milliseconds: 4_100_000_000_000),
        "scopes": ProtocolConstants.standardScopes,
      ])
    case "/api/auth/websocket-ticket":
      return json(["ticket": "ws-ticket-1", "expiresAt": iso(milliseconds: 1_700_000_000_000)])
    case "/api/agent-statuses":
      return Response(status: 503, body: Data(#"{"error":{"code":"unavailable","message":"no"}}"#.utf8))
    case "/api/snapshot":
      return snapshotResponse(request, declared: declaredHere && readsRequested)
    case "/api/threads":
      return threadListResponse(request, declared: declaredHere)
    case "/api/projects":
      return projectListResponse(request, declared: declaredHere)
    case "/api/catalog/membership":
      return membershipResponse(request, declared: declaredHere)
    default:
      if request.path.hasSuffix("/turns") {
        return turnsResponse(request, declared: declaredHere)
      }
      if request.path.hasSuffix("/history/items") {
        return historyItemsResponse(request, declared: declaredHere && readsRequested)
      }
      if request.path.hasSuffix("/history") {
        return historyResponse(request, declared: declaredHere && readsRequested)
      }
      return Response(
        status: 404,
        body: Data(#"{"error":{"code":"not_found","message":"not found"}}"#.utf8)
      )
    }
  }

  private func environmentBody(host: String) -> [String: Any] {
    var capabilities: [String: Any] = [:]
    if let runtimeHistoryNoticesVersions {
      capabilities["runtimeHistoryNotices"] = ["versions": runtimeHistoryNoticesVersions]
    }
    if let boundedCatalogChangesVersions {
      capabilities["boundedCatalogChanges"] = ["versions": boundedCatalogChangesVersions]
    }
    let resolvedHost = host.isEmpty ? "a.test" : host
    var body: [String: Any] = [
      "protocolVersion": ProtocolConstants.remoteProtocolVersion,
      "desktopId": desktopIdForHost(resolvedHost),
      "label": "Desktop \(desktopIdForHost(resolvedHost))",
      "appVersion": "1.0.0",
      "platform": "darwin",
      "auth": [
        "policy": ProtocolConstants.authPolicy,
        "bootstrapMethods": [ProtocolConstants.bootstrapMethod],
        "sessionMethods": [ProtocolConstants.sessionMethod],
        "scopes": ProtocolConstants.standardScopes,
      ],
      "endpoints": [
        "httpBaseUrl": "https://\(resolvedHost)",
        "wsBaseUrl": "wss://\(resolvedHost)",
      ],
    ]
    if !capabilities.isEmpty { body["capabilities"] = capabilities }
    return body
  }

  // MARK: - B1 runtime gap

  private func gapResponse(_ request: BoundedCatalogURLProtocol.Request) -> Response {
    guard request.query["notices"] == RemoteBoundedReads.noticesDeclaration else {
      return Response(
        status: 400,
        body: Data(
          #"{"error":{"code":"invalid_notices_capability","message":"notices=v1 required"}}"#.utf8
        )
      )
    }
    guard let threadId = threadId(fromHistoryPath: request.path),
      threads.contains(where: { $0.id == threadId })
    else {
      return Response(status: 404, body: Data(#"{"error":{"code":"not_found","message":"no"}}"#.utf8))
    }
    var body: [String: Any] = [
      "gap": gaps[threadId].map(gapJSON) ?? NSNull(),
      "notice": notices[threadId].map(noticeJSON) ?? NSNull(),
    ]
    body["reads"] = echoOverride ?? RemoteBoundedReads.capability
    return json(body)
  }

  private func gapAcknowledgeResponse(_ request: BoundedCatalogURLProtocol.Request) -> Response {
    guard request.query["notices"] == RemoteBoundedReads.noticesDeclaration else {
      return Response(
        status: 400,
        body: Data(
          #"{"error":{"code":"invalid_notices_capability","message":"notices=v1 required"}}"#.utf8
        )
      )
    }
    lock.lock()
    acknowledgeRequests.append(request)
    lock.unlock()
    guard let threadId = threadId(fromHistoryPath: request.path), gaps[threadId] != nil
      || notices[threadId] != nil
    else {
      return Response(status: 404, body: Data(#"{"error":{"code":"not_found","message":"no"}}"#.utf8))
    }
    let token = request.body?["episodeToken"] as? String ?? ""
    if let gap = gaps[threadId], gap.token == token {
      let previous = notices[threadId]
      let notice = RemoteHistoryNotice(
        kind: "history-incomplete",
        source: gap.source,
        reason: gap.reason,
        refusedEvents: gap.refusedEvents,
        refusedBytes: gap.refusedBytes,
        acknowledgedCount: (previous?.acknowledgedCount ?? 0) + 1,
        firstAcknowledgedAt: previous?.firstAcknowledgedAt ?? gap.createdAt,
        lastAcknowledgedAt: gap.createdAt + 1
      )
      notices[threadId] = notice
      gaps[threadId] = nil
      acknowledgedTokens.insert(token)
      return json([
        "outcome": "applied",
        "notice": noticeJSON(notice),
        "descriptor": gapJSON(gap),
        "supersededAcceptedEvents": 0,
      ])
    }
    if let notice = notices[threadId], acknowledgedTokens.contains(token) {
      return json(["outcome": "already", "notice": noticeJSON(notice)])
    }
    return json([
      "outcome": "stale",
      "current": gaps[threadId].map(gapJSON) ?? NSNull(),
    ])
  }

  private func noticeJSON(_ notice: RemoteHistoryNotice) -> [String: Any] {
    jsonObject(notice)
  }

  private func gapJSON(_ gap: RemoteHistoryGapDescriptor) -> [String: Any] {
    jsonObject(gap)
  }

  // MARK: - Catalog

  private func snapshotResponse(
    _ request: BoundedCatalogURLProtocol.Request,
    declared: Bool
  ) -> Response {
    // An undeclared host ignores the new params and serves its complete
    // catalog, exactly like the pre-B4 route.
    let limit = declared
      ? (Int(request.query["threadLimit"] ?? "") ?? threadPageLimit)
      : Int.max
    let projectLimit = declared
      ? (Int(request.query["projectLimit"] ?? "") ?? projectPageLimit)
      : Int.max
    let sorted = sortedThreads(for: request.query["order"] ?? "manual")
    let page = Array(sorted.prefix(limit))
    let projectPage = Array(projects.sorted { $0.id < $1.id }.prefix(projectLimit))
    var body: [String: Any] = [
      "snapshotSeq": snapshotSeq,
      "projects": projectPage.map(projectJSON),
      "threads": page.map(threadJSON),
      "runtimeSummariesByThread": [:],
      "updatedAt": iso(milliseconds: 1_700_000_000_000),
    ]
    if declared {
      body["reads"] = echoOverride ?? RemoteBoundedReads.capability
      body["threadsNextCursor"] =
        sorted.count > page.count
        ? paintCursor(
          prefix: RemoteBoundedCursorPrefix.threadPaintUpdated,
          keys: ["u": page.last?.updatedAt ?? "", "i": page.last?.id ?? ""]
        )
        : NSNull()
      body["projectsNextCursor"] =
        projects.count > projectPage.count
        ? paintCursor(
          prefix: RemoteBoundedCursorPrefix.projectPaint,
          keys: ["s": projectPage.count, "i": projectPage.last?.id ?? ""]
        )
        : NSNull()
    }
    return json(body)
  }

  private func threadListResponse(
    _ request: BoundedCatalogURLProtocol.Request,
    declared: Bool
  ) -> Response {
    if !declared {
      return Response(
        status: 400,
        body: Data(#"{"error":{"code":"invalid_reads_capability","message":"legacy"}}"#.utf8)
      )
    }
    let mode = request.query["mode"] ?? "page"
    let limit = Int(request.query["limit"] ?? "") ?? threadPageLimit
    if mode == "inventory" {
      let all = threads.map(\.id).sorted()
      let frontier = all.last ?? ""
      let cursor = decodeCursor(request.query["cursor"] ?? "")
      let lastId = cursor?["i"] as? String
      let upper = cursor?["f"] as? String ?? frontier
      let remaining = all.filter { id in
        (lastId == nil || id > lastId!) && (upper.isEmpty || id <= upper)
      }
      let page = Array(remaining.prefix(limit))
      let next = remaining.count > page.count
        ? inventoryCursor(
          prefix: RemoteBoundedCursorPrefix.threadInventory,
          id: page.last ?? "", frontier: upper
        )
        : nil
      var body: [String: Any] = [
        "reads": echoOverride ?? RemoteBoundedReads.capability,
        "threads": page.compactMap(threadJSON(forId:)),
        "nextCursor": next ?? NSNull(),
        "runtimeSummariesByThread": [:],
      ]
      if lastId == nil, !page.isEmpty, !omitInventoryFrontier {
        body["inventoryFrontier"] = upper
      }
      return json(body)
    }
    let sorted = sortedThreads(for: request.query["order"] ?? "updated")
    let cursor = decodeCursor(request.query["cursor"] ?? "")
    let afterUpdated = cursor?["u"] as? String
    let afterId = cursor?["i"] as? String
    var remaining = sorted
    if let afterUpdated, let afterId {
      remaining = sorted.filter { row in
        row.updatedAt < afterUpdated || (row.updatedAt == afterUpdated && row.id > afterId)
      }
    }
    let page = Array(remaining.prefix(limit))
    let body: [String: Any] = [
      "reads": echoOverride ?? RemoteBoundedReads.capability,
      "threads": page.map(threadJSON),
      "runtimeSummariesByThread": [:],
      "nextCursor": remaining.count > page.count
        ? paintCursor(
          prefix: RemoteBoundedCursorPrefix.threadPaintUpdated,
          keys: ["u": page.last?.updatedAt ?? "", "i": page.last?.id ?? ""]
        )
        : NSNull(),
    ]
    return json(body)
  }

  private func projectListResponse(
    _ request: BoundedCatalogURLProtocol.Request,
    declared: Bool
  ) -> Response {
    guard declared else {
      return Response(
        status: 400,
        body: Data(#"{"error":{"code":"invalid_reads_capability","message":"legacy"}}"#.utf8)
      )
    }
    let mode = request.query["mode"] ?? "page"
    let limit = Int(request.query["projectLimit"] ?? "") ?? projectPageLimit
    let all = projects.sorted { $0.id < $1.id }
    if mode == "inventory" {
      let ids = all.map(\.id)
      let frontier = ids.last ?? ""
      let cursor = decodeCursor(request.query["cursor"] ?? "")
      let lastId = cursor?["i"] as? String
      let upper = cursor?["f"] as? String ?? frontier
      let remaining = ids.filter { id in
        (lastId == nil || id > lastId!) && (upper.isEmpty || id <= upper)
      }
      let page = Array(remaining.prefix(limit))
      let next = remaining.count > page.count
        ? inventoryCursor(
          prefix: RemoteBoundedCursorPrefix.projectInventory,
          id: page.last ?? "", frontier: upper
        )
        : nil
      var body: [String: Any] = [
        "reads": echoOverride ?? RemoteBoundedReads.capability,
        "projects": page.compactMap(projectJSON(forId:)),
        "projectsNextCursor": next ?? NSNull(),
      ]
      if lastId == nil, !page.isEmpty, !omitInventoryFrontier {
        body["inventoryFrontier"] = upper
      }
      return json(body)
    }
    let cursor = decodeCursor(request.query["cursor"] ?? "")
    let afterId = cursor?["i"] as? String
    let remaining = all.filter { afterId == nil || $0.id > afterId! }
    let page = Array(remaining.prefix(limit))
    let body: [String: Any] = [
      "reads": echoOverride ?? RemoteBoundedReads.capability,
      "projects": page.map(projectJSON),
      "projectsNextCursor": remaining.count > page.count
        ? paintCursor(
          prefix: RemoteBoundedCursorPrefix.projectPaint,
          keys: ["s": page.count, "i": page.last?.id ?? ""]
        )
        : NSNull(),
    ]
    return json(body)
  }

  private func membershipResponse(
    _ request: BoundedCatalogURLProtocol.Request,
    declared: Bool
  ) -> Response {
    guard declared else {
      return Response(
        status: 400,
        body: Data(#"{"error":{"code":"invalid_reads_capability","message":"legacy"}}"#.utf8)
      )
    }
    beforeMembershipRespond?()
    let threadIds = request.body?["threadIds"] as? [String] ?? []
    let projectIds = request.body?["projectIds"] as? [String] ?? []
    lock.lock()
    membershipBatches.append(["threadIds": threadIds, "projectIds": projectIds])
    lock.unlock()
    let liveThreads = Set(threads.map(\.id))
    let liveProjects = Set(projects.map(\.id))
    return json([
      "existingThreadIds": threadIds.filter { liveThreads.contains($0) },
      "existingProjectIds": projectIds.filter { liveProjects.contains($0) },
    ])
  }

  // MARK: - History

  private func historyResponse(
    _ request: BoundedCatalogURLProtocol.Request,
    declared: Bool
  ) -> Response {
    let threadId = threadId(fromHistoryPath: request.path)
    guard let threadId else {
      return Response(status: 404, body: Data(#"{"error":{"code":"not_found","message":"no"}}"#.utf8))
    }
    guard let seed = threads.first(where: { $0.id == threadId }) else {
      return Response(status: 404, body: Data(#"{"error":{"code":"not_found","message":"no"}}"#.utf8))
    }
    if let notice = notices[threadId], request.query["notices"] != RemoteBoundedReads.noticesDeclaration {
      return Response(
        status: 409,
        body: Data(
          #"{"error":{"code":"runtime_history_notice_unsupported","message":"declare notices=v1"}}"#.utf8
        )
      )
    }
    let all = turns[threadId] ?? []
    var snapshot = RemoteThreadSnapshot(
      snapshotSeq: snapshotSeq,
      thread: remoteThread(from: seed),
      runtimeItems: [],
      completedTurns: [],
      updatedAt: iso(milliseconds: 1_700_000_000_000)
    )
    snapshot.runtimeNextCursor = historyRuntimeNextCursor
    snapshot.completedTurnsNextCursor = nil
    var body = (try? JSONSerialization.jsonObject(
      with: JSONDecoding.encoder.encode(snapshot)
    )) as? [String: Any] ?? [:]
    body["contextUsage"] = NSNull()
    if declared {
      let limit = Int(request.query["completedTurnsLimit"] ?? "") ?? historyTurnsLimit
      let tail = Array(all.suffix(limit))
      body["reads"] = echoOverride ?? RemoteBoundedReads.capability
      body["completedTurns"] = tail.map(turnJSON)
      body["completedTurnsNextCursor"] = all.count > tail.count
        ? completedTurnCursor(index: all.count - tail.count)
        : NSNull()
    } else {
      body["completedTurns"] = all.map(turnJSON)
    }
    if request.query["notices"] == RemoteBoundedReads.noticesDeclaration,
      let notice = notices[threadId]
    {
      body["runtimeNotice"] = noticeJSON(notice)
    }
    return json(body)
  }

  private func historyItemsResponse(
    _ request: BoundedCatalogURLProtocol.Request,
    declared: Bool
  ) -> Response {
    let threadId = threadId(fromHistoryPath: request.path)
    if let threadId, let notice = notices[threadId],
      request.query["notices"] != RemoteBoundedReads.noticesDeclaration
    {
      return Response(
        status: 409,
        body: Data(
          #"{"error":{"code":"runtime_history_notice_unsupported","message":"declare notices=v1"}}"#.utf8
        )
      )
    }
    let all = threadId.flatMap { historyItems[$0] } ?? []
    let limit = Int(request.query["limit"] ?? "") ?? 100
    let before = Int(request.query["beforePosition"] ?? "") ?? all.count
    let older = all.enumerated().filter { $0.offset < before }
    let take = Array(older.suffix(limit).reversed())
    let next = older.count > take.count ? (take.last?.offset ?? 0) : nil
    var body: [String: Any] = [
      "items": take.map { jsonObject($0.element) },
      "nextCursor": next ?? NSNull(),
    ]
    if declared { body["reads"] = echoOverride ?? RemoteBoundedReads.capability }
    if request.query["notices"] == RemoteBoundedReads.noticesDeclaration,
      let notice = threadId.flatMap({ notices[$0] })
    {
      body["runtimeNotice"] = noticeJSON(notice)
    }
    return json(body)
  }

  private func turnsResponse(
    _ request: BoundedCatalogURLProtocol.Request,
    declared: Bool
  ) -> Response {
    guard declared else {
      return Response(
        status: 404,
        body: Data(#"{"error":{"code":"invalid_reads_capability","message":"legacy"}}"#.utf8)
      )
    }
    let threadId = threadId(fromTurnsPath: request.path)
    if let threadId, notices[threadId] != nil,
      request.query["notices"] != RemoteBoundedReads.noticesDeclaration
    {
      return Response(
        status: 409,
        body: Data(
          #"{"error":{"code":"runtime_history_notice_unsupported","message":"declare notices=v1"}}"#.utf8
        )
      )
    }
    let all = threadId.flatMap { turns[$0] } ?? []
    let limit = Int(request.query["limit"] ?? "") ?? historyTurnsLimit
    let cursor = decodeCursor(request.query["cursor"] ?? "")
    let bound = cursor?["i"] as? Int ?? all.count
    let older = all.enumerated().filter { $0.offset < bound }
    let take = Array(older.suffix(limit))
    let next = older.count > take.count ? completedTurnCursor(index: take.first?.offset ?? 0) : nil
    return json([
      "reads": echoOverride ?? RemoteBoundedReads.capability,
      "turns": take.map { turnJSON($0.element) },
      "completedTurnsNextCursor": next ?? NSNull(),
    ])
  }

  // MARK: - JSON builders

  private func sortedThreads(for order: String) -> [ThreadSeed] {
    let rows = threads.sorted { $0.id < $1.id }
    guard order == "updated" else { return rows }
    return rows.sorted { lhs, rhs in
      if lhs.updatedAt != rhs.updatedAt { return lhs.updatedAt > rhs.updatedAt }
      return lhs.id < rhs.id
    }
  }

  private func remoteThread(from seed: ThreadSeed) -> RemoteThread {
    RemoteThread(
      id: seed.id,
      remoteServerId: nil,
      remoteId: nil,
      projectId: seed.projectId,
      title: seed.title,
      agentKind: "claude",
      agentInstanceId: nil,
      config: .empty,
      status: seed.status,
      threadStatusSource: nil,
      attention: seed.attention,
      canResumeWithConfig: true,
      worktreePath: nil,
      worktreeBranch: nil,
      archived: seed.archived,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: iso(milliseconds: 1_690_000_000_000),
      updatedAt: seed.updatedAt,
      activeTurnStartedAt: nil,
      lastTurnStartedAt: nil,
      lastTurnEndedAt: nil,
      errorMessage: nil,
      slashCommands: nil,
      parentThreadId: nil,
      groupId: nil,
      groupName: nil
    )
  }

  private func threadJSON(_ seed: ThreadSeed) -> [String: Any] {
    jsonObject(remoteThread(from: seed))
  }

  private func threadJSON(forId id: String) -> [String: Any]? {
    threads.first(where: { $0.id == id }).map(threadJSON)
  }

  private func remoteProject(from seed: ProjectSeed) -> RemoteProject {
    RemoteProject(
      id: seed.id,
      remoteServerId: nil,
      remoteId: nil,
      name: seed.name,
      location: .posix(path: "/tmp/\(seed.id)"),
      createdAt: seed.createdAt
    )
  }

  private func projectJSON(_ seed: ProjectSeed) -> [String: Any] {
    jsonObject(remoteProject(from: seed))
  }

  private func projectJSON(forId id: String) -> [String: Any]? {
    projects.first(where: { $0.id == id }).map(projectJSON)
  }

  private func turnJSON(_ seed: TurnSeed) -> [String: Any] {
    var body: [String: Any] = [
      "startedAt": seed.startedAt,
      "endedAt": seed.endedAt,
    ]
    body["anchorItemId"] = seed.anchorItemId ?? NSNull()
    return body
  }

  private func jsonObject<T: Encodable>(_ value: T) -> [String: Any] {
    (try? JSONSerialization.jsonObject(with: JSONDecoding.encoder.encode(value)))
      as? [String: Any] ?? [:]
  }

  private func json(_ object: [String: Any]) -> Response {
    let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
    return Response(status: 200, body: data)
  }

  // MARK: - Cursors

  private func paintCursor(prefix: String, keys: [String: Any]) -> String {
    "\(prefix)\(base64URL(keys))"
  }

  private func inventoryCursor(prefix: String, id: String, frontier: String) -> String {
    "\(prefix)\(base64URL(["i": id, "f": frontier]))"
  }

  private func completedTurnCursor(index: Int) -> String {
    "\(RemoteBoundedCursorPrefix.completedTurn)\(base64URL(["i": index]))"
  }

  private func decodeCursor(_ raw: String) -> [String: Any]? {
    guard !raw.isEmpty else { return nil }
    guard let separator = raw.firstIndex(of: ".") else { return nil }
    let encoded = String(raw[raw.index(after: separator)...])
    var base64 = encoded.replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while base64.count % 4 != 0 { base64.append("=") }
    guard let data = Data(base64Encoded: base64) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  private func base64URL(_ object: [String: Any]) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: object) else { return "" }
    return data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  private func threadId(fromHistoryPath path: String) -> String? {
    let prefix = "/api/threads/"
    guard path.hasPrefix(prefix) else { return nil }
    let remainder = path.dropFirst(prefix.count)
    guard let slash = remainder.firstIndex(of: "/") else { return nil }
    let id = String(remainder[..<slash])
    return id.isEmpty ? nil : id
  }

  private func threadId(fromTurnsPath path: String) -> String? {
    threadId(fromHistoryPath: path)
  }

  private func iso(milliseconds: Int64) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date(timeIntervalSince1970: Double(milliseconds) / 1000))
  }
}

// MARK: - Fixture seeds

extension BoundedCatalogHostFixture.ThreadSeed {
  static func make(
    id: String,
    projectId: String = "p1",
    updatedAt: String = "2026-01-01T00:00:00.000Z",
    title: String = "Thread",
    status: String = "idle",
    attention: String = "none"
  ) -> Self {
    Self(
      id: id, projectId: projectId, updatedAt: updatedAt, title: title,
      status: status, attention: attention
    )
  }
}

extension BoundedCatalogHostFixture.ProjectSeed {
  static func make(id: String, name: String? = nil) -> Self {
    Self(
      id: id, name: name ?? id,
      createdAt: "2026-01-01T00:00:00.000Z"
    )
  }
}
