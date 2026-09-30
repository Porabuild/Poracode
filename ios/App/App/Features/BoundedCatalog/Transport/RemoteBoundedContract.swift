import Foundation

/// Handwritten bounded-read contract edge over the generated remote-v3 roots.
///
/// Every bounded request crosses its generated query codec and every bounded
/// response crosses its generated response codec here before the app-owned page
/// models decode canonical JSON. No protocol type is re-implemented and no
/// generated file is touched; the generated route metadata stays the only
/// source of paths, methods and scopes.
extension GeneratedRemoteV3Contract {
  // MARK: - Route metadata

  struct BoundedRoute: Sendable {
    var id: String
    var path: String
    var method: String
  }

  /// Validates that a route exists with the bearer + `session:read` shape the
  /// bounded read surface depends on, and returns its generated path.
  static func boundedRoute(_ id: String) throws -> BoundedRoute {
    guard let route = RemoteContractMetadata.routes.first(where: { $0.id == id }),
      route.auth == "bearer",
      route.scopes == ["session:read"],
      route.method == "GET" || route.method == "POST"
    else {
      throw RemoteBoundedReadProtocolError(
        violation: .routeUnavailable,
        detail: "The declared bounded route is missing: \(id)."
      )
    }
    return BoundedRoute(id: route.id, path: route.path, method: route.method)
  }

  // MARK: - Queries

  /// Shell page 1. `threadLimit` is deliberately omitted: a genuine older host
  /// honors the pre-existing shell `threadLimit` pagination without echoing
  /// `reads`, so sending it would make the legacy fallback a partial catalog.
  /// Declared hosts apply their 100-thread default.
  static func boundedShellSnapshotQuery(
    order: RemoteBoundedPaintOrder,
    projectLimit: Int,
    summaries: Bool,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) throws -> [URLQueryItem] {
    let object: [String: Any] = [
      "maxBytes": maxBytes,
      "maxDecodeBytes": maxDecodeBytes,
      "order": order.rawValue,
      "projectLimit": projectLimit,
      "reads": RemoteBoundedReads.capability,
      "summaries": summaries,
    ]
    return try queryItems(
      object, codec: RemoteRootCodecs.routeU2EShellU2DSnapshotU2EQuery,
      boundary: "bounded shell snapshot query",
      order: ["reads", "order", "projectLimit", "summaries", "maxBytes", "maxDecodeBytes"]
    )
  }

  static func boundedThreadListQuery(
    mode: RemoteBoundedReadMode,
    order: RemoteBoundedPaintOrder,
    limit: Int,
    summaries: Bool,
    cursor: String?,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) throws -> [URLQueryItem] {
    var object: [String: Any] = [
      "limit": limit,
      "maxBytes": maxBytes,
      "maxDecodeBytes": maxDecodeBytes,
      "mode": mode.rawValue,
      "reads": RemoteBoundedReads.capability,
    ]
    if mode == .page {
      object["order"] = order.rawValue
      object["summaries"] = summaries
    }
    if let cursor { object["cursor"] = cursor }
    return try queryItems(
      object, codec: RemoteRootCodecs.routeU2EThreadU2DListU2EQuery,
      boundary: "bounded thread list query",
      order: ["reads", "mode", "order", "summaries", "limit", "cursor", "maxBytes", "maxDecodeBytes"]
    )
  }

  static func boundedProjectListQuery(
    mode: RemoteBoundedReadMode,
    limit: Int,
    cursor: String?,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) throws -> [URLQueryItem] {
    var object: [String: Any] = [
      "maxBytes": maxBytes,
      "maxDecodeBytes": maxDecodeBytes,
      "mode": mode.rawValue,
      "projectLimit": limit,
      "reads": RemoteBoundedReads.capability,
    ]
    if mode == .page { object["order"] = "manual" }
    if let cursor { object["cursor"] = cursor }
    return try queryItems(
      object, codec: RemoteRootCodecs.routeU2EProjectU2DListU2EQuery,
      boundary: "bounded project list query",
      order: ["reads", "mode", "order", "projectLimit", "cursor", "maxBytes", "maxDecodeBytes"]
    )
  }

  /// `runtimePage=1` is intentional: a declared host ignores it and serves the
  /// bounded tail; a genuine older host stays on its existing paged tail path
  /// instead of materializing a full legacy history during negotiation.
  static func boundedThreadHistoryQuery(
    completedTurnsLimit: Int,
    targetTimelineEntryCount: Int?,
    maxBytes: Int,
    maxDecodeBytes: Int,
    notices: Bool
  ) throws -> [URLQueryItem] {
    var object: [String: Any] = [
      "completedTurnsLimit": completedTurnsLimit,
      "maxBytes": maxBytes,
      "maxDecodeBytes": maxDecodeBytes,
      "reads": RemoteBoundedReads.capability,
      "runtimePage": "1",
    ]
    if let targetTimelineEntryCount {
      object["targetTimelineEntryCount"] = targetTimelineEntryCount
    }
    if notices { object["notices"] = "v1" }
    return try queryItems(
      object, codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2EQuery,
      boundary: "bounded thread history query",
      order: [
        "notices", "reads", "runtimePage", "completedTurnsLimit", "targetTimelineEntryCount",
        "maxBytes", "maxDecodeBytes",
      ]
    )
  }

  static func boundedHistoryItemsQuery(
    beforePosition: Int?,
    limit: Int,
    targetTimelineEntryCount: Int?,
    maxBytes: Int,
    maxDecodeBytes: Int,
    notices: Bool
  ) throws -> [URLQueryItem] {
    var object: [String: Any] = [
      "limit": limit,
      "maxBytes": maxBytes,
      "maxDecodeBytes": maxDecodeBytes,
      "reads": RemoteBoundedReads.capability,
    ]
    if let beforePosition { object["beforePosition"] = beforePosition }
    if let targetTimelineEntryCount {
      object["targetTimelineEntryCount"] = targetTimelineEntryCount
    }
    if notices { object["notices"] = "v1" }
    return try queryItems(
      object, codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EQuery,
      boundary: "bounded history items query",
      order: [
        "notices", "reads", "limit", "beforePosition", "targetTimelineEntryCount",
        "maxBytes", "maxDecodeBytes",
      ]
    )
  }

  static func boundedThreadTurnsQuery(
    cursor: String?,
    limit: Int,
    maxBytes: Int,
    maxDecodeBytes: Int,
    notices: Bool
  ) throws -> [URLQueryItem] {
    var object: [String: Any] = [
      "limit": limit,
      "maxBytes": maxBytes,
      "maxDecodeBytes": maxDecodeBytes,
      "reads": RemoteBoundedReads.capability,
    ]
    if let cursor { object["cursor"] = cursor }
    if notices { object["notices"] = "v1" }
    return try queryItems(
      object, codec: RemoteRootCodecs.routeU2EThreadU2DTurnsU2EQuery,
      boundary: "bounded thread turns query",
      order: ["notices", "reads", "limit", "cursor", "maxBytes", "maxDecodeBytes"]
    )
  }

  static func catalogMembershipRequest(
    threadIds: [String],
    projectIds: [String]
  ) throws -> Data {
    var object: [String: Any] = [:]
    if !threadIds.isEmpty { object["threadIds"] = threadIds }
    if !projectIds.isEmpty { object["projectIds"] = projectIds }
    return try canonicalData(
      try jsonObjectData(object), codec: RemoteRootCodecs.routeU2ECatalogU2DMembershipU2ERequest,
      boundary: "catalog membership request"
    )
  }

  static func catalogMembershipResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2ECatalogU2DMembershipU2EResponse,
      boundary: "catalog membership response"
    )
  }

  // MARK: - Responses

  static func boundedShellSnapshotResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EShellU2DSnapshotU2EResponse,
      boundary: "bounded shell snapshot response"
    )
  }

  static func boundedThreadListResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EThreadU2DListU2EResponse,
      boundary: "bounded thread list response"
    )
  }

  static func boundedProjectListResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EProjectU2DListU2EResponse,
      boundary: "bounded project list response"
    )
  }

  static func boundedThreadHistoryResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2EResponse,
      boundary: "bounded thread history response"
    )
  }

  static func boundedHistoryItemsResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2DItemsU2EResponse,
      boundary: "bounded history items response"
    )
  }

  static func boundedThreadTurnsResponse(_ data: Data) throws -> Data {
    try canonicalData(
      data, codec: RemoteRootCodecs.routeU2EThreadU2DTurnsU2EResponse,
      boundary: "bounded thread turns response"
    )
  }

  static func boundedThreadTurnsPath(threadId: String) throws -> String {
    let canonical = try canonicalData(
      try JSONSerialization.data(withJSONObject: ["threadId": threadId]),
      codec: RemoteRootCodecs.routeU2EThreadU2DTurnsU2EPath,
      boundary: "bounded thread turns path"
    )
    let value = try JSONDecoding.decode(JSONValue.self, from: canonical)
    guard case .object(let object) = value,
      case .string(let validated)? = object["threadId"]
    else {
      throw RemoteClientError.invalidResponse("The generated codec returned an invalid path.")
    }
    return validated
  }

  // MARK: - Canonical JSON probes

  /// Canonical response object, used for presence checks the strict bounded
  /// rule needs (`reads` echo, required nullable cursors). Absent keys stay
  /// absent; explicit JSON null stays a `.null` value.
  static func canonicalObject(_ data: Data) throws -> [String: RemoteJSONValue] {
    let value = try JSONDecoding.decoder.decode(RemoteJSONValue.self, from: data)
    guard case .object(let object) = value else {
      throw RemoteClientError.invalidResponse("Expected a JSON object.")
    }
    return object
  }

  private static func queryItems<Value: Codable & Sendable>(
    _ object: [String: Any],
    codec: RemoteRootCodec<Value>,
    boundary: String,
    order: [String]
  ) throws -> [URLQueryItem] {
    let snapshot = try canonicalSnapshot(
      try jsonObjectData(object), codec: codec, boundary: boundary
    )
    guard case .object(let validated) = snapshot else {
      throw RemoteClientError.invalidResponse("The generated codec returned an invalid query.")
    }
    return try order.compactMap { name in
      guard let value = validated[name] else { return nil }
      switch value {
      case .string(let text): return URLQueryItem(name: name, value: text)
      case .int(let number):
        return URLQueryItem(name: name, value: try RemoteQueryCodec.encodeInt(number))
      case .bool(let flag):
        return URLQueryItem(name: name, value: RemoteQueryCodec.encodeFlag(flag))
      default:
        throw RemoteClientError.invalidResponse("The generated codec returned an invalid query.")
      }
    }
  }

  private static func canonicalSnapshot<Value: Codable & Sendable>(
    _ data: Data, codec: RemoteRootCodec<Value>, boundary: String
  ) throws -> RemoteJSONValue {
    do {
      return try codec.decode(data, decoder: JSONDecoding.decoder).validatedSnapshot
    } catch {
      throw RemoteClientError.invalidResponse("Invalid \(boundary).")
    }
  }

  private static func jsonObjectData(_ object: [String: Any]) throws -> Data {
    try JSONSerialization.data(withJSONObject: object)
  }
}

// MARK: - App-model decoding from canonical JSON

enum RemoteBoundedPageDecoder {
  private struct ShellPageWire: Decodable {
    var snapshotSeq: Int
    var projects: [RemoteProject]
    var threads: [RemoteThread]
    var runtimeSummariesByThread: [String: RemoteRuntimeSummary]
    var threadsNextCursor: String?
    var projectsNextCursor: String?
    var gitSummariesByThread: JSONValue?
    var gitState: JSONValue?
    var updatedAt: String
  }

  private struct ThreadPageWire: Decodable {
    var threads: [RemoteThread]
    var nextCursor: String?
    var inventoryFrontier: String?
    var gitSummariesByThread: JSONValue?
  }

  private struct ProjectPageWire: Decodable {
    var projects: [RemoteProject]
    var projectsNextCursor: String?
    var inventoryFrontier: String?
  }

  private struct MembershipWire: Decodable {
    var existingProjectIds: [String]
    var existingThreadIds: [String]
  }

  struct TurnWire: Decodable, Sendable, Equatable {
    var startedAt: String
    var endedAt: String
    var anchorItemId: String?
  }

  private struct TurnsWire: Decodable {
    var turns: [TurnWire]
    var completedTurnsNextCursor: String?
  }

  private struct HistoryItemsWire: Decodable {
    var items: [PersistedRuntimeItem]
    var nextCursor: Int?
    /// B1 additive notice carry; absent on hosts without the feature.
    var runtimeNotice: RemoteHistoryNotice?
  }

  static func shellPage(_ canonical: Data) throws -> RemoteBoundedShellPage {
    let wire = try decode(ShellPageWire.self, from: canonical, boundary: "bounded shell page")
    return RemoteBoundedShellPage(
      snapshotSeq: wire.snapshotSeq,
      projects: wire.projects,
      threads: wire.threads,
      runtimeSummariesByThread: wire.runtimeSummariesByThread,
      threadsNextCursor: wire.threadsNextCursor,
      projectsNextCursor: wire.projectsNextCursor,
      gitSummariesByThread: wire.gitSummariesByThread,
      gitState: wire.gitState,
      updatedAt: wire.updatedAt
    )
  }

  static func threadPage(_ canonical: Data) throws -> RemoteBoundedThreadPage {
    let wire = try decode(ThreadPageWire.self, from: canonical, boundary: "bounded thread page")
    return RemoteBoundedThreadPage(
      threads: wire.threads,
      nextCursor: wire.nextCursor,
      inventoryFrontier: wire.inventoryFrontier,
      gitSummariesByThread: wire.gitSummariesByThread
    )
  }

  static func projectPage(_ canonical: Data) throws -> RemoteBoundedProjectPage {
    let wire = try decode(ProjectPageWire.self, from: canonical, boundary: "bounded project page")
    return RemoteBoundedProjectPage(
      projects: wire.projects,
      projectsNextCursor: wire.projectsNextCursor,
      inventoryFrontier: wire.inventoryFrontier
    )
  }

  static func membership(_ canonical: Data) throws -> RemoteBoundedCatalogMembership {
    let wire = try decode(MembershipWire.self, from: canonical, boundary: "catalog membership")
    return RemoteBoundedCatalogMembership(
      existingThreadIds: Set(wire.existingThreadIds),
      existingProjectIds: Set(wire.existingProjectIds)
    )
  }

  static func turns(_ canonical: Data) throws -> RemoteBoundedTurnsPage {
    let wire = try decode(TurnsWire.self, from: canonical, boundary: "bounded turns page")
    return RemoteBoundedTurnsPage(
      turns: wire.turns.map {
        RemoteBoundedCompletedTurn(
          startedAt: $0.startedAt, endedAt: $0.endedAt, anchorItemId: $0.anchorItemId
        )
      },
      completedTurnsNextCursor: wire.completedTurnsNextCursor
    )
  }

  /// History tail reuses the existing app model; `completedTurnsNextCursor` is
  /// the additive continuation carry.
  static func historyPage(_ canonical: Data) throws -> RemoteBoundedHistoryPage {
    let snapshot = try decode(
      RemoteThreadSnapshot.self, from: canonical, boundary: "bounded history page"
    )
    return RemoteBoundedHistoryPage(
      snapshot: snapshot,
      completedTurnsNextCursor: snapshot.completedTurnsNextCursor
    )
  }

  static func historyItemsPage(_ canonical: Data) throws -> RemoteBoundedHistoryItemsPage {
    let wire = try decode(
      HistoryItemsWire.self, from: canonical, boundary: "bounded history items page"
    )
    return RemoteBoundedHistoryItemsPage(
      page: RemoteRuntimeItemsPage(
        items: wire.items,
        nextCursor: wire.nextCursor,
        runtimeNotice: wire.runtimeNotice
      )
    )
  }

  private static func decode<T: Decodable>(
    _ type: T.Type, from data: Data, boundary: String
  ) throws -> T {
    do {
      return try JSONDecoding.decode(type, from: data)
    } catch {
      throw RemoteBoundedReadProtocolError(
        violation: .boundedResponseInvalid,
        detail: "The declared host returned an invalid \(boundary)."
      )
    }
  }
}
