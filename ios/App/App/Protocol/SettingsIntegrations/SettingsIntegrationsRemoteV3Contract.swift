import Foundation

enum SettingsIntegrationsOwner: String, Equatable, Sendable {
  case none
  case optionalProjectLocation
  case skillLocations
}

struct SettingsIntegrationsProcedureMetadata: Equatable, Sendable {
  let procedure: SettingsIntegrationsProcedure
  let scope: SettingsIntegrationsScope
  let owner: SettingsIntegrationsOwner
  let resultKind: String
  let isLongRunning: Bool
}

enum SettingsIntegrationsProcedure: String, CaseIterable, Sendable {
  case scanSkills
  case listSkillMarketplace
  case setSkillEnabled
  case deleteSkill
  case importSkills
  case installMarketplaceSkill
  case discoverExternalMcpServers
  case probeMcpServer
  case getMcpOauthStatus
  case beginMcpServerOauth
  case waitMcpServerOauth
  case clearMcpServerOauth
}

/// The only SettingsIntegrations file allowed to know generated codec symbols.
/// App-owned models always cross this adapter as canonical JSON.
enum SettingsIntegrationsRemoteV3Contract {
  static let protocolVersion = 8
  static let procedurePath = "/api/git/call"

  static let procedures: [SettingsIntegrationsProcedureMetadata] = [
    metadata(.scanSkills, .read, .optionalProjectLocation, "json"),
    metadata(.listSkillMarketplace, .read, .none, "json"),
    metadata(.setSkillEnabled, .operate, .optionalProjectLocation, "omitted"),
    metadata(.deleteSkill, .operate, .optionalProjectLocation, "omitted"),
    metadata(.importSkills, .operate, .skillLocations, "json"),
    metadata(.installMarketplaceSkill, .operate, .optionalProjectLocation, "json"),
    metadata(.discoverExternalMcpServers, .read, .optionalProjectLocation, "json"),
    metadata(.probeMcpServer, .operate, .optionalProjectLocation, "json"),
    metadata(.getMcpOauthStatus, .read, .optionalProjectLocation, "json"),
    metadata(.beginMcpServerOauth, .operate, .optionalProjectLocation, "json"),
    metadata(.waitMcpServerOauth, .operate, .optionalProjectLocation, "json", long: true),
    metadata(.clearMcpServerOauth, .operate, .optionalProjectLocation, "omitted"),
  ]

  static func metadata(for procedure: SettingsIntegrationsProcedure)
    -> SettingsIntegrationsProcedureMetadata
  {
    guard let value = procedures.first(where: { $0.procedure == procedure }) else {
      preconditionFailure("Missing SettingsIntegrations procedure metadata")
    }
    return value
  }

  static func request<Request: Encodable>(
    _ procedure: SettingsIntegrationsProcedure,
    payload: Request
  ) throws -> Data {
    let encoded = try JSONDecoding.encoder.encode(payload)
    let canonicalPayload = try canonicalRequest(encoded, procedure: procedure)
    let payloadObject = try JSONSerialization.jsonObject(with: canonicalPayload)
    let envelope = try JSONSerialization.data(
      withJSONObject: ["procedure": procedure.rawValue, "payload": payloadObject]
    )
    return try canonical(
      envelope,
      codec: RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest,
      boundary: "settings integrations procedure envelope"
    )
  }

  static func result<Result: Decodable>(
    _ type: Result.Type,
    procedure: SettingsIntegrationsProcedure,
    response: Data
  ) throws -> Result {
    let resultData = try resultData(procedure: procedure, response: response)
    return try JSONDecoding.decode(type, from: resultData)
  }

  static func omittedResult(
    _ procedure: SettingsIntegrationsProcedure,
    response: Data
  ) throws {
    guard metadata(for: procedure).resultKind == "omitted",
      let object = try JSONSerialization.jsonObject(with: response) as? [String: Any],
      object.isEmpty
    else {
      throw RemoteClientError.invalidResponse("Invalid settings integrations response.")
    }
  }

  static func projectedLocations(_ request: SettingsImportSkillsRequest) -> [ProjectLocation] {
    request.skills.flatMap { skill in
      [skill.sourceProjectLocation, skill.projectLocation].compactMap { $0 }
    }
  }

  private static func canonicalRequest(
    _ data: Data,
    procedure: SettingsIntegrationsProcedure
  ) throws -> Data {
    switch procedure {
    case .scanSkills:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EScanSkillsU2ERequest,
        boundary: "scanSkills request")
    case .listSkillMarketplace:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EListSkillMarketplaceU2ERequest,
        boundary: "listSkillMarketplace request")
    case .setSkillEnabled:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2ESetSkillEnabledU2ERequest,
        boundary: "setSkillEnabled request")
    case .deleteSkill:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EDeleteSkillU2ERequest,
        boundary: "deleteSkill request")
    case .importSkills:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EImportSkillsU2ERequest,
        boundary: "importSkills request")
    case .installMarketplaceSkill:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EInstallMarketplaceSkillU2ERequest,
        boundary: "installMarketplaceSkill request")
    case .discoverExternalMcpServers:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EDiscoverExternalMcpServersU2ERequest,
        boundary: "discoverExternalMcpServers request")
    case .probeMcpServer:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EProbeMcpServerU2ERequest,
        boundary: "probeMcpServer request")
    case .getMcpOauthStatus:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EGetMcpOauthStatusU2ERequest,
        boundary: "getMcpOauthStatus request")
    case .beginMcpServerOauth:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EBeginMcpServerOauthU2ERequest,
        boundary: "beginMcpServerOauth request")
    case .waitMcpServerOauth:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EWaitMcpServerOauthU2ERequest,
        boundary: "waitMcpServerOauth request")
    case .clearMcpServerOauth:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EClearMcpServerOauthU2ERequest,
        boundary: "clearMcpServerOauth request")
    }
  }

  private static func resultData(
    procedure: SettingsIntegrationsProcedure,
    response: Data
  ) throws -> Data {
    guard metadata(for: procedure).resultKind == "json",
      let object = try JSONSerialization.jsonObject(with: response) as? [String: Any],
      let result = object["result"]
    else {
      throw RemoteClientError.invalidResponse("Invalid settings integrations response.")
    }
    let data = try JSONSerialization.data(withJSONObject: result)
    switch procedure {
    case .scanSkills:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EScanSkillsU2EResult, boundary: "scanSkills result"
      )
    case .listSkillMarketplace:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EListSkillMarketplaceU2EResult,
        boundary: "listSkillMarketplace result")
    case .importSkills:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EImportSkillsU2EResult,
        boundary: "importSkills result")
    case .installMarketplaceSkill:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EInstallMarketplaceSkillU2EResult,
        boundary: "installMarketplaceSkill result")
    case .discoverExternalMcpServers:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EDiscoverExternalMcpServersU2EResult,
        boundary: "discoverExternalMcpServers result")
    case .probeMcpServer:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EProbeMcpServerU2EResult,
        boundary: "probeMcpServer result")
    case .getMcpOauthStatus:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EGetMcpOauthStatusU2EResult,
        boundary: "getMcpOauthStatus result")
    case .beginMcpServerOauth:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EBeginMcpServerOauthU2EResult,
        boundary: "beginMcpServerOauth result")
    case .waitMcpServerOauth:
      return try canonical(
        data, codec: RemoteRootCodecs.procedureU2EWaitMcpServerOauthU2EResult,
        boundary: "waitMcpServerOauth result")
    case .setSkillEnabled, .deleteSkill, .clearMcpServerOauth:
      throw RemoteClientError.invalidResponse("Unexpected settings integrations result.")
    }
  }

  private static func metadata(
    _ procedure: SettingsIntegrationsProcedure,
    _ scope: SettingsIntegrationsScope,
    _ owner: SettingsIntegrationsOwner,
    _ resultKind: String,
    long: Bool = false
  ) -> SettingsIntegrationsProcedureMetadata {
    guard RemoteContractMetadata.protocolVersion == protocolVersion,
      let generated = RemoteContractMetadata.procedures.first(where: {
        $0.name == procedure.rawValue
      }),
      generated.scope == scope.rawValue,
      generated.owner == owner.rawValue,
      generated.resultKind == resultKind
    else {
      preconditionFailure("Generated SettingsIntegrations metadata is incompatible")
    }
    return .init(
      procedure: procedure,
      scope: scope,
      owner: owner,
      resultKind: resultKind,
      isLongRunning: long
    )
  }

  private static func canonical<Value: Codable & Sendable>(
    _ data: Data,
    codec: RemoteRootCodec<Value>,
    boundary: String
  ) throws -> Data {
    try GeneratedRemoteV3Contract.canonicalData(data, codec: codec, boundary: boundary)
  }
}
