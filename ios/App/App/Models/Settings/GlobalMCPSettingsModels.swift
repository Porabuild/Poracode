import Foundation

struct GlobalMCPSettingsResponse: Codable, Equatable, Sendable {
  let servers: [ProjectMCPServer]
}

enum GlobalMCPSettingsScope: Equatable, Hashable, Sendable, Codable {
  case global
  case project(String)

  private enum CodingKeys: String, CodingKey {
    case kind
    case projectId
  }

  private enum Kind: String, Codable {
    case global
    case project
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    switch try values.decode(Kind.self, forKey: .kind) {
    case .global:
      self = .global
    case .project:
      self = .project(try values.decode(String.self, forKey: .projectId))
    }
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .global:
      try values.encode(Kind.global, forKey: .kind)
    case .project(let projectID):
      try values.encode(Kind.project, forKey: .kind)
      try values.encode(projectID, forKey: .projectId)
    }
  }
}

enum GlobalMCPSettingsCommand: Encodable, Sendable, CustomStringConvertible {
  case upsert(scope: GlobalMCPSettingsScope, server: ProjectMCPServer)
  case remove(scope: GlobalMCPSettingsScope, serverID: String)
  case move(
    source: GlobalMCPSettingsScope,
    destination: GlobalMCPSettingsScope,
    serverID: String
  )

  var description: String {
    switch self {
    case .upsert(let scope, let server):
      "GlobalMCPSettingsCommand.upsert(scope: \(scope), id: \(server.id), secrets: <redacted>)"
    case .remove(let scope, let serverID):
      "GlobalMCPSettingsCommand.remove(scope: \(scope), id: \(serverID))"
    case .move(let source, let destination, let serverID):
      "GlobalMCPSettingsCommand.move(source: \(source), destination: \(destination), id: \(serverID))"
    }
  }

  private enum CodingKeys: String, CodingKey {
    case kind
    case scope
    case server
    case serverId
    case source
    case destination
  }

  private enum Kind: String, Encodable {
    case upsert
    case remove
    case move
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .upsert(let scope, let server):
      try values.encode(Kind.upsert, forKey: .kind)
      try values.encode(scope, forKey: .scope)
      try values.encode(server, forKey: .server)
    case .remove(let scope, let serverID):
      try values.encode(Kind.remove, forKey: .kind)
      try values.encode(scope, forKey: .scope)
      try values.encode(serverID, forKey: .serverId)
    case .move(let source, let destination, let serverID):
      try values.encode(Kind.move, forKey: .kind)
      try values.encode(source, forKey: .source)
      try values.encode(destination, forKey: .destination)
      try values.encode(serverID, forKey: .serverId)
    }
  }
}

enum GlobalMCPSettingsOperation: Encodable, Sendable, CustomStringConvertible {
  case probe(scope: GlobalMCPSettingsScope, serverID: String)
  case oauthStatus(scope: GlobalMCPSettingsScope)
  case oauthBegin(scope: GlobalMCPSettingsScope, serverID: String)
  case oauthWait(scope: GlobalMCPSettingsScope, flowID: String)
  case oauthClear(scope: GlobalMCPSettingsScope, serverID: String)

  var description: String {
    switch self {
    case .probe(let scope, let serverID):
      "GlobalMCPSettingsOperation.probe(scope: \(scope), id: \(serverID))"
    case .oauthStatus(let scope):
      "GlobalMCPSettingsOperation.oauthStatus(scope: \(scope))"
    case .oauthBegin(let scope, let serverID):
      "GlobalMCPSettingsOperation.oauthBegin(scope: \(scope), id: \(serverID))"
    case .oauthWait(let scope, _):
      "GlobalMCPSettingsOperation.oauthWait(scope: \(scope), flow: <redacted>)"
    case .oauthClear(let scope, let serverID):
      "GlobalMCPSettingsOperation.oauthClear(scope: \(scope), id: \(serverID))"
    }
  }

  private enum CodingKeys: String, CodingKey {
    case kind
    case scope
    case serverId
    case flowId
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .probe(let scope, let serverID):
      try values.encode("probe", forKey: .kind)
      try values.encode(scope, forKey: .scope)
      try values.encode(serverID, forKey: .serverId)
    case .oauthStatus(let scope):
      try values.encode("oauth-status", forKey: .kind)
      try values.encode(scope, forKey: .scope)
    case .oauthBegin(let scope, let serverID):
      try values.encode("oauth-begin", forKey: .kind)
      try values.encode(scope, forKey: .scope)
      try values.encode(serverID, forKey: .serverId)
    case .oauthWait(let scope, let flowID):
      try values.encode("oauth-wait", forKey: .kind)
      try values.encode(scope, forKey: .scope)
      try values.encode(flowID, forKey: .flowId)
    case .oauthClear(let scope, let serverID):
      try values.encode("oauth-clear", forKey: .kind)
      try values.encode(scope, forKey: .scope)
      try values.encode(serverID, forKey: .serverId)
    }
  }
}

enum GlobalMCPSettingsOperationResult: Decodable, Sendable {
  case probe(SettingsMCPProbeResult)
  case oauthStatus(authenticatedServerIDs: [String])
  case oauthBegin(SettingsMCPOAuthBeginResult)
  case oauthWait(SettingsMCPOAuthWaitResult)
  case oauthClear

  private enum CodingKeys: String, CodingKey {
    case kind
    case result
    case authenticatedServerIds
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    switch try values.decode(String.self, forKey: .kind) {
    case "probe":
      self = .probe(try values.decode(SettingsMCPProbeResult.self, forKey: .result))
    case "oauth-status":
      self = .oauthStatus(
        authenticatedServerIDs: try values.decode(
          [String].self, forKey: .authenticatedServerIds))
    case "oauth-begin":
      self = .oauthBegin(
        try values.decode(SettingsMCPOAuthBeginResult.self, forKey: .result))
    case "oauth-wait":
      self = .oauthWait(try values.decode(SettingsMCPOAuthWaitResult.self, forKey: .result))
    case "oauth-clear":
      self = .oauthClear
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .kind, in: values, debugDescription: "Invalid MCP settings operation result"
      )
    }
  }
}

extension ProjectMCPTransport {
  var endpointURL: String? {
    switch self {
    case .http(let url, _), .sse(let url, _): url
    case .stdio: nil
    }
  }

  var isRemoteRedacted: Bool {
    switch self {
    case .stdio(_, let arguments, let environment, _):
      return environment.keys.allSatisfy {
        environment.secretValue(forKey: $0) == GlobalMCPRedaction.marker
      } && arguments.allSatisfy(GlobalMCPRedaction.argumentIsSafe)
    case .http(let url, let headers), .sse(let url, let headers):
      return headers.keys.allSatisfy {
        headers.secretValue(forKey: $0) == GlobalMCPRedaction.marker
      } && GlobalMCPRedaction.urlIsSafe(url)
    }
  }
}

private enum GlobalMCPRedaction {
  static let marker = "«redacted»"
  private static let sensitiveArgumentPattern =
    #"^(--?[^=]*(?:key|token|secret|password|auth|credential)[^=]*)=(.*)$"#

  static func argumentIsSafe(_ argument: String) -> Bool {
    guard
      let match = argument.range(
        of: sensitiveArgumentPattern,
        options: [.regularExpression, .caseInsensitive]
      )
    else { return true }
    return argument[match].hasSuffix("=\(marker)")
  }

  static func urlIsSafe(_ value: String) -> Bool {
    guard let components = URLComponents(string: value) else { return false }
    return (components.queryItems ?? []).allSatisfy { item in
      item.value == nil || item.value == marker
    }
  }
}
