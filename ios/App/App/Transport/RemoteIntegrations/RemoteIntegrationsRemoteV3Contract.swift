import Foundation

struct RemoteIntegrationsRouteMetadata: Equatable, Sendable {
  let id: String
  let method: String
  let path: String
  let scope: RemoteIntegrationsCapability
  let status: Int
  let bodyKind: String
}

/// Stable names for the generated remote-v3 codecs used by native remote integrations.
/// Hash-derived generated symbols remain confined to this boundary.
enum RemoteIntegrationsRemoteV3Contract {
  static let protocolVersion = 8

  static let routes: [RemoteIntegrationsRouteMetadata] = [
    route("host-update", "GET", "/api/host-update", .projectsManage, 200, "empty"),
    route("host-update-check", "POST", "/api/host-update/check", .projectsManage, 200, "empty"),
    route("host-update-install", "POST", "/api/host-update/install", .projectsManage, 202, "empty"),
    route("schedules-read", "GET", "/api/schedules", .sessionRead, 200, "empty"),
    route("schedules-command", "POST", "/api/schedules/command", .sessionOperate, 200, "json"),
    route("schedule-runs-read", "GET", "/api/schedules/runs", .sessionRead, 200, "empty"),
    route("pr-watch-read", "GET", "/api/pr-watches", .sessionRead, 200, "empty"),
    route("pr-watch-check", "POST", "/api/pr-watches/check", .sessionOperate, 200, "json"),
    route(
      "pr-watch-agent-sync", "POST", "/api/pr-watches/agent", .sessionOperate, 200, "json"),
    route("pr-watch-upsert", "POST", "/api/pr-watches", .sessionOperate, 200, "json"),
    route("pr-watch-delete", "DELETE", "/api/pr-watches", .sessionOperate, 200, "json"),
  ]

  static func metadata(id: String) -> RemoteIntegrationsRouteMetadata? {
    routes.first { $0.id == id }
  }

  static func hostUpdateResponse(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EHostU2DUpdateU2EResponse,
      boundary: "host update response"
    )
  }

  static func hostUpdateCheckResponse(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EHostU2DUpdateU2DCheckU2EResponse,
      boundary: "host update check response"
    )
  }

  static func hostUpdateInstallResponse(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EHostU2DUpdateU2DInstallU2EResponse,
      boundary: "host update install response"
    )
  }

  static func schedulesReadResponse(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2ESchedulesU2DReadU2EResponse,
      boundary: "schedules read response"
    )
  }

  static func schedulesCommandRequest(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2ESchedulesU2DCommandU2ERequest,
      boundary: "schedules command request"
    )
  }

  static func schedulesCommandResponse(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2ESchedulesU2DCommandU2EResponse,
      boundary: "schedules command response"
    )
  }

  static func scheduleRunsQuery(id: String) throws -> [URLQueryItem] {
    let canonical = try canonical(
      JSONDecoding.encoder.encode(["id": id]),
      codec: RemoteRootCodecs.routeU2EScheduleU2DRunsU2DReadU2EQuery,
      boundary: "schedule runs query"
    )
    let value = try JSONDecoding.decode([String: String].self, from: canonical)
    return [URLQueryItem(name: "id", value: value["id"])]
  }

  static func scheduleRunsResponse(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EScheduleU2DRunsU2DReadU2EResponse,
      boundary: "schedule runs response"
    )
  }

  static func prWatchReadQuery(_ key: RemoteIntegrationsPRWatchKey) throws -> [URLQueryItem] {
    let canonical = try canonical(
      JSONDecoding.encoder.encode(key),
      codec: RemoteRootCodecs.routeU2EPrU2DWatchU2DReadU2EQuery,
      boundary: "PR watch read query"
    )
    let value = try JSONDecoding.decode(RemoteIntegrationsPRWatchKey.self, from: canonical)
    return [
      URLQueryItem(name: "projectId", value: value.projectId),
      URLQueryItem(name: "prNumber", value: String(value.prNumber)),
    ]
  }

  static func prWatchReadResponse(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EPrU2DWatchU2DReadU2EResponse,
      boundary: "PR watch read response"
    )
  }

  static func prWatchCheckRequest(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EPrU2DWatchU2DCheckU2ERequest,
      boundary: "PR watch check request"
    )
  }

  static func prWatchCheckResponse(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EPrU2DWatchU2DCheckU2EResponse,
      boundary: "PR watch check response"
    )
  }

  static func prWatchAgentSyncRequest(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EPrU2DWatchU2DAgentU2DSyncU2ERequest,
      boundary: "PR watch agent sync request"
    )
  }

  static func prWatchAgentSyncResponse(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EPrU2DWatchU2DAgentU2DSyncU2EResponse,
      boundary: "PR watch agent sync response"
    )
  }

  static func prWatchUpsertRequest(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EPrU2DWatchU2DUpsertU2ERequest,
      boundary: "PR watch upsert request"
    )
  }

  static func prWatchUpsertResponse(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EPrU2DWatchU2DUpsertU2EResponse,
      boundary: "PR watch upsert response"
    )
  }

  static func prWatchDeleteRequest(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EPrU2DWatchU2DDeleteU2ERequest,
      boundary: "PR watch delete request"
    )
  }

  static func prWatchDeleteResponse(_ data: Data) throws -> Data {
    try canonical(
      data,
      codec: RemoteRootCodecs.routeU2EPrU2DWatchU2DDeleteU2EResponse,
      boundary: "PR watch delete response"
    )
  }

  private static func route(
    _ id: String,
    _ method: String,
    _ path: String,
    _ scope: RemoteIntegrationsCapability,
    _ status: Int,
    _ bodyKind: String
  ) -> RemoteIntegrationsRouteMetadata {
    guard let generated = RemoteContractMetadata.routes.first(where: { $0.id == id }),
      generated.auth == "bearer",
      generated.method == method,
      generated.path == path,
      generated.scopes == [scope.rawValue],
      generated.status == status,
      generated.bodyKind == bodyKind,
      generated.responseKind == "json"
    else {
      preconditionFailure("Generated remote-v3 route metadata is incompatible: \(id)")
    }
    return RemoteIntegrationsRouteMetadata(
      id: id,
      method: method,
      path: path,
      scope: scope,
      status: status,
      bodyKind: bodyKind
    )
  }

  private static func canonical<Value: Codable & Sendable>(
    _ data: Data,
    codec: RemoteRootCodec<Value>,
    boundary: String
  ) throws -> Data {
    guard RemoteContractMetadata.protocolVersion == protocolVersion else {
      throw RemoteClientError.protocolMismatch(found: RemoteContractMetadata.protocolVersion)
    }
    return try GeneratedRemoteV3Contract.canonicalData(data, codec: codec, boundary: boundary)
  }
}
