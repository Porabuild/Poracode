import Foundation

struct RemoteConversationSearchEntry: Equatable, Sendable {
  let threadID: String
  let projectID: String
  let projectName: String
  let title: String
  let itemID: String
  let role: String
  let excerpt: String
  let archived: Bool
}

struct RemoteConversationSearchPage: Equatable, Sendable {
  let entries: [RemoteConversationSearchEntry]
  let indexing: Bool
  let nextCursor: String?
}

struct RemoteThreadPromptAnchor: Equatable, Sendable, Identifiable {
  let itemID: String
  let position: Int64
  let text: String

  var id: String { itemID }
}

struct RemoteThreadPromptsPage: Equatable, Sendable {
  let prompts: [RemoteThreadPromptAnchor]
  let truncated: Bool
}

extension RemoteAPIClient {
  /// Capability-gated full-text conversation search (`GET /api/search/conversations`).
  func searchConversations(
    query: String,
    projectID: String? = nil,
    includeArchived: Bool = false,
    cursor: String? = nil,
    limit: Int = 25
  ) async throws -> RemoteConversationSearchPage {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return RemoteConversationSearchPage(entries: [], indexing: false, nextCursor: nil)
    }
    let descriptor = RemoteContractMetadata.routes.first { $0.id == "conversation-search" }
    precondition(descriptor != nil, "Missing conversation-search route metadata")
    let requestQuery = RouteconversationU2DSearchQuery_07b9b9802d(
      cursor: cursor.map { RemoteField<String>.value($0) } ?? RemoteField<String>.missing,
      includeArchived: includeArchived
        ? RemoteField<RouteconversationU2DSearchQueryU2DIncludeArchived_003a95dd16>.value(.`true`)
        : RemoteField<RouteconversationU2DSearchQueryU2DIncludeArchived_003a95dd16>.missing,
      limit: RemoteField<Int64>.value(Int64(min(max(1, limit), 50))),
      projectId: projectID.map { RemoteField<String>.value($0) } ?? RemoteField<String>.missing,
      query: trimmed,
      version: .n1
    )
    let encodedQuery = try JSONDecoding.encoder.encode(requestQuery)
    let validatedQuery = try RemoteRootCodecs.routeU2EConversationU2DSearchU2EQuery.decode(encodedQuery).value
    var items = [
      URLQueryItem(name: "version", value: validatedQuery.version.rawValue),
      URLQueryItem(name: "query", value: validatedQuery.query),
    ]
    if case .value(let projectId) = validatedQuery.projectId {
      items.append(URLQueryItem(name: "projectId", value: projectId))
    }
    if case .value(let archived) = validatedQuery.includeArchived {
      items.append(URLQueryItem(name: "includeArchived", value: archived.rawValue))
    }
    if case .value(let cur) = validatedQuery.cursor {
      items.append(URLQueryItem(name: "cursor", value: cur))
    }
    if case .value(let lim) = validatedQuery.limit {
      items.append(URLQueryItem(name: "limit", value: String(lim)))
    }
    let data = try await requestData(
      path: "/api/search/conversations",
      method: "GET",
      queryItems: items
    )
    let decoded = try RemoteRootCodecs.routeU2EConversationU2DSearchU2EResponse.decode(data).value
    let nextCursor: String? = switch decoded.nextCursor {
    case .value(let value): value
    case .null, .missing: nil
    }
    return RemoteConversationSearchPage(
      entries: decoded.entries.map {
        RemoteConversationSearchEntry(
          threadID: $0.threadId,
          projectID: $0.projectId,
          projectName: $0.projectName,
          title: $0.title,
          itemID: $0.itemId,
          role: $0.role.rawValue,
          excerpt: $0.excerpt,
          archived: $0.archived
        )
      },
      indexing: decoded.indexing,
      nextCursor: nextCursor
    )
  }

  /// Prompt-rail jump index (`GET /api/threads/:threadId/history/prompts`).
  func threadHistoryPrompts(threadID: String) async throws -> RemoteThreadPromptsPage {
    let descriptor = RemoteContractMetadata.routes.first { $0.id == "thread-history-prompts" }
    precondition(descriptor != nil, "Missing thread-history-prompts route metadata")
    let pathInput = try JSONSerialization.data(withJSONObject: ["threadId": threadID])
    let validatedPath = try RemoteRootCodecs.routeU2EThreadU2DHistoryU2DPromptsU2EPath.decode(pathInput).value
    let encodedID = validatedPath.threadId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
      ?? validatedPath.threadId
    let data = try await requestData(
      path: "/api/threads/\(encodedID)/history/prompts",
      method: "GET",
      queryItems: []
    )
    let decoded = try RemoteRootCodecs.routeU2EThreadU2DHistoryU2DPromptsU2EResponse.decode(data).value
    return RemoteThreadPromptsPage(
      prompts: decoded.prompts.map {
        RemoteThreadPromptAnchor(itemID: $0.itemId, position: $0.position, text: $0.text)
      },
      truncated: decoded.truncated
    )
  }
}
