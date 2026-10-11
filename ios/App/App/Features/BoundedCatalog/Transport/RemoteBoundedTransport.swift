import Foundation

// MARK: - RemoteAPIClient

extension RemoteAPIClient: SessionBoundedReadAPI {
  func boundedShellSnapshot(
    order: RemoteBoundedPaintOrder,
    projectLimit: Int = RemoteBoundedReads.defaultProjectLimit,
    summaries: Bool = false,
    maxBytes: Int = RemoteBoundedReads.defaultMaxWireBytes,
    maxDecodeBytes: Int = RemoteBoundedReads.defaultMaxDecodeBytes
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedShellPage, RemoteShellSnapshot> {
    let query = try GeneratedRemoteV3Contract.boundedShellSnapshotQuery(
      order: order,
      projectLimit: projectLimit,
      summaries: summaries,
      maxBytes: maxBytes,
      maxDecodeBytes: maxDecodeBytes
    )
    let data = try await boundedRequestData(path: "/api/snapshot", queryItems: query)
    let echo = try Self.boundedEcho(data)
    if echo == nil {
      let canonical = try Self.canonicalBounded(data, using: {
        try GeneratedRemoteV3Contract.shellSnapshotResponse($0)
      })
      return .legacy(try JSONDecoding.decode(RemoteShellSnapshot.self, from: canonical))
    }
    let canonical = try Self.canonicalBounded(data, using: {
      try GeneratedRemoteV3Contract.boundedShellSnapshotResponse($0)
    })
    let object = try GeneratedRemoteV3Contract.canonicalObject(canonical)
    try Self.requirePresent(["threadsNextCursor", "projectsNextCursor"], in: object, route: "shell")
    if let cursor = try Self.optionalString(object["threadsNextCursor"]) {
      try Self.requirePrefix(
        cursor, RemoteBoundedCursorPrefix.threadPaintPrefix(for: order), kind: "thread"
      )
    }
    if let cursor = try Self.optionalString(object["projectsNextCursor"]) {
      try Self.requirePrefix(cursor, RemoteBoundedCursorPrefix.projectPaint, kind: "project")
    }
    return .bounded(try RemoteBoundedPageDecoder.shellPage(canonical))
  }

  func boundedThreadPage(
    mode: RemoteBoundedReadMode,
    order: RemoteBoundedPaintOrder = .updated,
    limit: Int = RemoteBoundedReads.defaultThreadLimit,
    summaries: Bool = false,
    cursor: String? = nil,
    maxBytes: Int = RemoteBoundedReads.defaultMaxWireBytes,
    maxDecodeBytes: Int = RemoteBoundedReads.defaultMaxDecodeBytes
  ) async throws -> RemoteBoundedThreadPage {
    if let cursor {
      switch mode {
      case .inventory:
        try Self.requirePrefix(cursor, RemoteBoundedCursorPrefix.threadInventory, kind: "thread")
      case .page:
        try Self.requirePrefix(
          cursor, RemoteBoundedCursorPrefix.threadPaintPrefix(for: order), kind: "thread"
        )
      }
    }
    let query = try GeneratedRemoteV3Contract.boundedThreadListQuery(
      mode: mode, order: order, limit: limit, summaries: summaries, cursor: cursor,
      maxBytes: maxBytes, maxDecodeBytes: maxDecodeBytes
    )
    let data = try await boundedRequestData(path: "/api/threads", queryItems: query)
    try Self.requireDeclaredEcho(data)
    let canonical = try Self.canonicalBounded(data, using: {
      try GeneratedRemoteV3Contract.boundedThreadListResponse($0)
    })
    let object = try GeneratedRemoteV3Contract.canonicalObject(canonical)
    try Self.requirePresent(["nextCursor"], in: object, route: "thread-list")
    let page = try RemoteBoundedPageDecoder.threadPage(canonical)
    if let next = page.nextCursor {
      switch mode {
      case .inventory:
        try Self.requirePrefix(next, RemoteBoundedCursorPrefix.threadInventory, kind: "thread")
      case .page:
        try Self.requirePrefix(
          next, RemoteBoundedCursorPrefix.threadPaintPrefix(for: order), kind: "thread"
        )
      }
    }
    if mode == .inventory, cursor == nil, !page.threads.isEmpty {
      guard let frontier = page.inventoryFrontier else {
        throw RemoteBoundedReadProtocolError(
          violation: .boundedResponseInvalid,
          detail: "The declared host omitted the inventory frontier on page 1."
        )
      }
      if let first = page.nextCursor,
        let decoded = RemoteBoundedCursorPayload.decodeInventory(
          first, prefix: RemoteBoundedCursorPrefix.threadInventory
        )
      {
        guard decoded.frontier == frontier else {
          throw RemoteBoundedReadProtocolError(
            violation: .boundedResponseInvalid,
            detail: "The inventory cursor frontier does not match the echoed frontier."
          )
        }
      }
    }
    return page
  }

  func boundedProjectListPage(
    mode: RemoteBoundedReadMode,
    limit: Int = RemoteBoundedReads.defaultProjectLimit,
    cursor: String? = nil,
    maxBytes: Int = RemoteBoundedReads.defaultMaxWireBytes,
    maxDecodeBytes: Int = RemoteBoundedReads.defaultMaxDecodeBytes
  ) async throws -> RemoteBoundedProjectPage {
    if let cursor {
      switch mode {
      case .inventory:
        try Self.requirePrefix(cursor, RemoteBoundedCursorPrefix.projectInventory, kind: "project")
      case .page:
        try Self.requirePrefix(cursor, RemoteBoundedCursorPrefix.projectPaint, kind: "project")
      }
    }
    let query = try GeneratedRemoteV3Contract.boundedProjectListQuery(
      mode: mode, limit: limit, cursor: cursor,
      maxBytes: maxBytes, maxDecodeBytes: maxDecodeBytes
    )
    let route = try GeneratedRemoteV3Contract.boundedRoute("project-list")
    let data = try await boundedRequestData(path: route.path, queryItems: query)
    try Self.requireDeclaredEcho(data)
    let canonical = try Self.canonicalBounded(data, using: {
      try GeneratedRemoteV3Contract.boundedProjectListResponse($0)
    })
    let object = try GeneratedRemoteV3Contract.canonicalObject(canonical)
    try Self.requirePresent(["projectsNextCursor"], in: object, route: "project-list")
    let page = try RemoteBoundedPageDecoder.projectPage(canonical)
    if let next = page.projectsNextCursor {
      switch mode {
      case .inventory:
        try Self.requirePrefix(next, RemoteBoundedCursorPrefix.projectInventory, kind: "project")
      case .page:
        try Self.requirePrefix(next, RemoteBoundedCursorPrefix.projectPaint, kind: "project")
      }
    }
    if mode == .inventory, cursor == nil, !page.projects.isEmpty {
      guard let frontier = page.inventoryFrontier else {
        throw RemoteBoundedReadProtocolError(
          violation: .boundedResponseInvalid,
          detail: "The declared host omitted the project inventory frontier on page 1."
        )
      }
      if let first = page.projectsNextCursor,
        let decoded = RemoteBoundedCursorPayload.decodeInventory(
          first, prefix: RemoteBoundedCursorPrefix.projectInventory
        )
      {
        guard decoded.frontier == frontier else {
          throw RemoteBoundedReadProtocolError(
            violation: .boundedResponseInvalid,
            detail: "The project inventory cursor frontier does not match the echoed frontier."
          )
        }
      }
    }
    return page
  }

  func boundedCatalogMembership(
    threadIds: [String],
    projectIds: [String]
  ) async throws -> RemoteBoundedCatalogMembership {
    guard threadIds.count <= RemoteBoundedReads.membershipBatchLimit,
      projectIds.count <= RemoteBoundedReads.membershipBatchLimit,
      Set(threadIds).count == threadIds.count,
      Set(projectIds).count == projectIds.count
    else {
      throw RemoteBoundedReadProtocolError(
        violation: .membershipResponseInvalid,
        detail: "A membership batch must contain at most 200 unique ids per list."
      )
    }
    let body = try GeneratedRemoteV3Contract.catalogMembershipRequest(
      threadIds: threadIds, projectIds: projectIds
    )
    let route = try GeneratedRemoteV3Contract.boundedRoute("catalog-membership")
    let data = try await boundedRequestData(
      path: route.path, method: route.method, jsonBody: body
    )
    let canonical = try Self.canonicalBounded(data, using: {
      try GeneratedRemoteV3Contract.catalogMembershipResponse($0)
    })
    let membership = try RemoteBoundedPageDecoder.membership(canonical)
    let requestedThreads = Set(threadIds)
    let requestedProjects = Set(projectIds)
    guard membership.existingThreadIds.isSubset(of: requestedThreads),
      membership.existingProjectIds.isSubset(of: requestedProjects)
    else {
      throw RemoteBoundedReadProtocolError(
        violation: .membershipResponseInvalid,
        detail: "The membership answer referenced an id that was not requested."
      )
    }
    return membership
  }

  func boundedThreadHistory(
    threadId: String,
    completedTurnsLimit: Int = RemoteBoundedReads.defaultCompletedTurnsLimit,
    targetTimelineEntryCount: Int? = RemoteBoundedReads.defaultTargetTimelineEntryCount,
    maxBytes: Int = RemoteBoundedReads.defaultMaxWireBytes,
    maxDecodeBytes: Int = RemoteBoundedReads.defaultMaxDecodeBytes
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedHistoryPage, RemoteThreadSnapshot> {
    let validatedThreadId = try GeneratedRemoteV3Contract.threadHistoryPath(threadId: threadId)
    let query = try GeneratedRemoteV3Contract.boundedThreadHistoryQuery(
      completedTurnsLimit: completedTurnsLimit,
      targetTimelineEntryCount: targetTimelineEntryCount,
      maxBytes: maxBytes,
      maxDecodeBytes: maxDecodeBytes,
      notices: effectiveNoticesDeclaration
    )
    let path = "/api/threads/\(Self.encodePathSegment(validatedThreadId))/history"
    let data = try await boundedRequestData(path: path, queryItems: query)
    let echo = try Self.boundedEcho(data)
    if echo == nil {
      let canonical = try Self.canonicalBounded(data, using: {
        try GeneratedRemoteV3Contract.threadHistoryResponse($0)
      })
      return .legacy(try JSONDecoding.decode(RemoteThreadSnapshot.self, from: canonical))
    }
    let canonical = try Self.canonicalBounded(data, using: {
      try GeneratedRemoteV3Contract.boundedThreadHistoryResponse($0)
    })
    let object = try GeneratedRemoteV3Contract.canonicalObject(canonical)
    try Self.requirePresent(["completedTurnsNextCursor"], in: object, route: "thread-history")
    if let cursor = try Self.optionalString(object["completedTurnsNextCursor"]),
      RemoteBoundedCursorPayload.decodeCompletedTurnIndex(cursor) == nil
    {
      throw RemoteBoundedReadProtocolError(
        violation: .boundedResponseInvalid,
        detail: "The declared host returned a malformed completed-turn cursor."
      )
    }
    return .bounded(try RemoteBoundedPageDecoder.historyPage(canonical))
  }

  func boundedHistoryItems(
    threadId: String,
    beforePosition: Int? = nil,
    limit: Int = RemoteBoundedReads.defaultHistoryItemsLimit,
    targetTimelineEntryCount: Int? = RemoteBoundedReads.defaultTargetTimelineEntryCount,
    maxBytes: Int = RemoteBoundedReads.defaultMaxWireBytes,
    maxDecodeBytes: Int = RemoteBoundedReads.defaultMaxDecodeBytes
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedHistoryItemsPage, RemoteRuntimeItemsPage> {
    let validatedThreadId = try GeneratedRemoteV3Contract.historyItemsPath(threadId: threadId)
    let query = try GeneratedRemoteV3Contract.boundedHistoryItemsQuery(
      beforePosition: beforePosition,
      limit: limit,
      targetTimelineEntryCount: targetTimelineEntryCount,
      maxBytes: maxBytes,
      maxDecodeBytes: maxDecodeBytes,
      notices: effectiveNoticesDeclaration
    )
    let path = "/api/threads/\(Self.encodePathSegment(validatedThreadId))/history/items"
    let data = try await boundedRequestData(path: path, queryItems: query)
    let echo = try Self.boundedEcho(data)
    if echo == nil {
      let canonical = try Self.canonicalBounded(data, using: {
        try GeneratedRemoteV3Contract.historyItemsResponse($0)
      })
      return .legacy(try JSONDecoding.decode(RemoteRuntimeItemsPage.self, from: canonical))
    }
    let canonical = try Self.canonicalBounded(data, using: {
      try GeneratedRemoteV3Contract.boundedHistoryItemsResponse($0)
    })
    let object = try GeneratedRemoteV3Contract.canonicalObject(canonical)
    try Self.requirePresent(["nextCursor"], in: object, route: "thread-history-items")
    return .bounded(try RemoteBoundedPageDecoder.historyItemsPage(canonical))
  }

  func boundedThreadTurns(
    threadId: String,
    cursor: String? = nil,
    limit: Int = RemoteBoundedReads.defaultCompletedTurnsLimit,
    maxBytes: Int = RemoteBoundedReads.defaultMaxWireBytes,
    maxDecodeBytes: Int = RemoteBoundedReads.defaultMaxDecodeBytes
  ) async throws -> RemoteBoundedTurnsPage {
    if let cursor, RemoteBoundedCursorPayload.decodeCompletedTurnIndex(cursor) == nil {
      throw RemoteBoundedReadProtocolError(
        violation: .cursorMismatch,
        detail: "A thread-turns continuation must carry a ct1. cursor."
      )
    }
    let validatedThreadId = try GeneratedRemoteV3Contract.boundedThreadTurnsPath(threadId: threadId)
    let query = try GeneratedRemoteV3Contract.boundedThreadTurnsQuery(
      cursor: cursor, limit: limit, maxBytes: maxBytes, maxDecodeBytes: maxDecodeBytes,
      notices: effectiveNoticesDeclaration
    )
    let path = "/api/threads/\(Self.encodePathSegment(validatedThreadId))/turns"
    let data = try await boundedRequestData(path: path, queryItems: query)
    try Self.requireDeclaredEcho(data)
    let canonical = try Self.canonicalBounded(data, using: {
      try GeneratedRemoteV3Contract.boundedThreadTurnsResponse($0)
    })
    let object = try GeneratedRemoteV3Contract.canonicalObject(canonical)
    try Self.requirePresent(["completedTurnsNextCursor"], in: object, route: "thread-turns")
    if let next = try Self.optionalString(object["completedTurnsNextCursor"]),
      RemoteBoundedCursorPayload.decodeCompletedTurnIndex(next) == nil
    {
      throw RemoteBoundedReadProtocolError(
        violation: .boundedResponseInvalid,
        detail: "The declared host returned a malformed completed-turn cursor."
      )
    }
    return try RemoteBoundedPageDecoder.turns(canonical)
  }

  // MARK: Dispatch

  /// Dispatches one bounded read and maps the host's typed refusals onto the
  /// shared violation vocabulary. `read_item_too_large` (422) and similar
  /// declared behavior stay ordinary visible `RemoteClientError`s.
  private func boundedRequestData(
    path: String,
    method: String = "GET",
    queryItems: [URLQueryItem] = [],
    jsonBody: Data? = nil
  ) async throws -> Data {
    do {
      return try await requestData(
        path: path, method: method, queryItems: queryItems, jsonBody: jsonBody
      )
    } catch let error as RemoteClientError {
      if error.isNotFound || error.code == RemoteBoundedReads.invalidReadsCapabilityCode {
        throw RemoteBoundedReadProtocolError(
          violation: .routeUnavailable,
          detail: "The host does not serve the declared bounded route."
        )
      }
      if error.code == RemoteBoundedReads.invalidThreadCursorCode
        || error.code == RemoteBoundedReads.invalidProjectCursorCode
      {
        throw RemoteBoundedReadProtocolError(
          violation: .cursorMismatch,
          detail: "The declared host rejected a bounded cursor."
        )
      }
      throw error
    }
  }

  // MARK: Validation helpers

  /// Raw `reads` probe. `nil` means the key was absent (legacy); a non-nil
  /// value that is not the capability literal is a typed mismatch before any
  /// schema validation can blur the cause.
  private static func boundedEcho(_ data: Data) throws -> String? {
    let raw = try? JSONSerialization.jsonObject(with: data)
    guard let object = raw as? [String: Any], let value = object["reads"] else { return nil }
    guard let text = value as? String, text == RemoteBoundedReads.capability else {
      throw RemoteBoundedReadProtocolError(
        violation: .readsEchoMismatch,
        detail: "The declared host echoed an unknown reads capability."
      )
    }
    return text
  }

  /// A declared-only route: an absent echo means the host never declared the
  /// bundle on this route.
  private static func requireDeclaredEcho(_ data: Data) throws {
    guard try boundedEcho(data) != nil else {
      throw RemoteBoundedReadProtocolError(
        violation: .routeUnavailable,
        detail: "The host does not serve the declared route."
      )
    }
  }

  /// Canonicalizes a bounded/legacy response; any schema or shape failure is a
  /// typed protocol error, never a silent downgrade or a transport failure.
  private static func canonicalBounded(
    _ data: Data,
    using transform: (Data) throws -> Data
  ) throws -> Data {
    do {
      return try transform(data)
    } catch let error as RemoteBoundedReadProtocolError {
      throw error
    } catch {
      throw RemoteBoundedReadProtocolError(
        violation: .boundedResponseInvalid,
        detail: "The declared host returned an invalid bounded response."
      )
    }
  }

  private static func requirePresent(
    _ keys: [String],
    in object: [String: RemoteJSONValue],
    route: String
  ) throws {
    for key in keys where object[key] == nil {
      throw RemoteBoundedReadProtocolError(
        violation: .boundedResponseInvalid,
        detail: "The declared host omitted \(key) on \(route)."
      )
    }
  }

  private static func requirePrefix(
    _ cursor: String,
    _ prefix: String,
    kind: String
  ) throws {
    guard cursor.hasPrefix(prefix) else {
      throw RemoteBoundedReadProtocolError(
        violation: .cursorMismatch,
        detail: "A \(kind) continuation cursor does not match its requested mode."
      )
    }
  }

  private static func optionalString(_ value: RemoteJSONValue?) throws -> String? {
    switch value {
    case nil, .some(.null):
      return nil
    case .some(.string(let text)):
      return text
    default:
      throw RemoteBoundedReadProtocolError(
        violation: .boundedResponseInvalid,
        detail: "The declared host returned a non-string cursor."
      )
    }
  }
}
