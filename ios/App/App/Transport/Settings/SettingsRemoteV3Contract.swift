import Foundation

struct SettingsRouteMetadata: Equatable, Sendable {
  let id: String
  let method: String
  let path: String
  let scope: SettingsCapability
  let status: Int
}

/// Stable, hash-free access to the generated remote-v3 Settings root codecs and route metadata.
/// Hash-derived generated model names do not escape this file.
enum SettingsRemoteV3Contract {
  static let protocolVersion = 3

  static let routes: [SettingsRouteMetadata] = [
    route("agent-statuses", scope: .sessionRead),
    route("provider-usage", scope: .sessionRead),
    route("profile-devices", scope: .sessionRead),
    route("profile-core-stats", scope: .sessionRead),
    route("profile-token-stats", scope: .sessionRead),
    route("profile-identity", scope: .sessionOperate),
    route("settings-read", scope: .sessionRead),
    route("settings-write", scope: .sessionOperate),
  ]

  static func metadata(id: String) -> SettingsRouteMetadata? {
    routes.first { $0.id == id }
  }

  static func agentStatusesResponse(_ data: Data) throws -> Data {
    try canonical(
      data, codec: RemoteRootCodecs.routeU2EAgentU2DStatusesU2EResponse,
      boundary: "agent statuses response"
    )
  }

  static func providerUsageResponse(_ data: Data) throws -> Data {
    try canonical(
      data, codec: RemoteRootCodecs.routeU2EProviderU2DUsageU2EResponse,
      boundary: "provider usage response"
    )
  }

  static func profileDevicesResponse(_ data: Data) throws -> Data {
    try canonical(
      data, codec: RemoteRootCodecs.routeU2EProfileU2DDevicesU2EResponse,
      boundary: "profile devices response"
    )
  }

  static func profileCoreStatsRequest(_ data: Data) throws -> Data {
    try canonical(
      data, codec: RemoteRootCodecs.routeU2EProfileU2DCoreU2DStatsU2ERequest,
      boundary: "profile core stats request"
    )
  }

  static func profileCoreStatsResponse(_ data: Data) throws -> Data {
    try canonical(
      data, codec: RemoteRootCodecs.routeU2EProfileU2DCoreU2DStatsU2EResponse,
      boundary: "profile core stats response"
    )
  }

  static func profileTokenStatsRequest(_ data: Data) throws -> Data {
    try canonical(
      data, codec: RemoteRootCodecs.routeU2EProfileU2DTokenU2DStatsU2ERequest,
      boundary: "profile token stats request"
    )
  }

  static func profileTokenStatsResponse(_ data: Data) throws -> Data {
    try canonical(
      data, codec: RemoteRootCodecs.routeU2EProfileU2DTokenU2DStatsU2EResponse,
      boundary: "profile token stats response"
    )
  }

  static func profileIdentityRequest(_ data: Data) throws -> Data {
    try canonical(
      data, codec: RemoteRootCodecs.routeU2EProfileU2DIdentityU2ERequest,
      boundary: "profile identity request"
    )
  }

  static func profileIdentityResponse(_ data: Data) throws -> Data {
    try canonical(
      data, codec: RemoteRootCodecs.routeU2EProfileU2DIdentityU2EResponse,
      boundary: "profile identity response"
    )
  }

  static func settingsReadResponse(_ data: Data) throws -> Data {
    let canonical = try canonical(
      data, codec: RemoteRootCodecs.routeU2ESettingsU2DReadU2EResponse,
      boundary: "settings read response"
    )
    try assertRedacted(canonical)
    return canonical
  }

  static func settingsWriteRequest(_ data: Data) throws -> Data {
    let canonical = try canonical(
      data, codec: RemoteRootCodecs.routeU2ESettingsU2DWriteU2ERequest,
      boundary: "settings write request"
    )
    try assertRedacted(canonical)
    return canonical
  }

  static func settingsWriteResponse(_ data: Data) throws -> Data {
    let canonical = try canonical(
      data, codec: RemoteRootCodecs.routeU2ESettingsU2DWriteU2EResponse,
      boundary: "settings write response"
    )
    try assertRedacted(canonical)
    return canonical
  }

  private static func route(
    _ id: String,
    scope: SettingsCapability
  ) -> SettingsRouteMetadata {
    guard let route = RemoteContractMetadata.routes.first(where: { $0.id == id }),
      route.auth == "bearer",
      route.scopes == [scope.rawValue]
    else {
      preconditionFailure("Generated remote-v3 route metadata is incompatible: \(id)")
    }
    return SettingsRouteMetadata(
      id: route.id,
      method: route.method,
      path: route.path,
      scope: scope,
      status: route.status
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

  /// Defense in depth over the producer's `agent-settings.strip-sensitive` transform.
  private static func assertRedacted(_ data: Data) throws {
    guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
    let settings = (root["settings"] as? [String: Any]) ?? root
    guard let agents = settings["agentSettings"] as? [String: Any] else { return }
    if let cursor = agents["cursor"] as? [String: Any], cursor["sdkApiKey"] != nil {
      throw RemoteClientError.invalidResponse("Invalid redacted settings payload.")
    }
  }
}
