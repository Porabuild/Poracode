import Foundation

enum SettingsMCPTransport: Codable, Equatable, Sendable, CustomStringConvertible {
  case stdio(command: String, args: [String], environment: [String: String], cwd: String?)
  case http(url: String, headers: [String: String])
  case sse(url: String, headers: [String: String])

  var endpointURL: String? {
    switch self {
    case .http(let url, _), .sse(let url, _): return url
    case .stdio: return nil
    }
  }

  var description: String {
    switch self {
    case .stdio: return "SettingsMCPTransport.stdio(redacted)"
    case .http: return "SettingsMCPTransport.http(redacted)"
    case .sse: return "SettingsMCPTransport.sse(redacted)"
    }
  }

  private enum CodingKeys: String, CodingKey { case type, command, args, env, cwd, url, headers }
  private enum Kind: String, Codable { case stdio, http, sse }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    switch try values.decode(Kind.self, forKey: .type) {
    case .stdio:
      self = .stdio(
        command: try values.decode(String.self, forKey: .command),
        args: try values.decodeIfPresent([String].self, forKey: .args) ?? [],
        environment: try values.decodeIfPresent([String: String].self, forKey: .env) ?? [:],
        cwd: try values.decodeIfPresent(String.self, forKey: .cwd)
      )
    case .http:
      self = .http(
        url: try values.decode(String.self, forKey: .url),
        headers: try values.decodeIfPresent([String: String].self, forKey: .headers) ?? [:]
      )
    case .sse:
      self = .sse(
        url: try values.decode(String.self, forKey: .url),
        headers: try values.decodeIfPresent([String: String].self, forKey: .headers) ?? [:]
      )
    }
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .stdio(let command, let args, let environment, let cwd):
      try values.encode(Kind.stdio, forKey: .type)
      try values.encode(command, forKey: .command)
      try values.encode(args, forKey: .args)
      try values.encode(environment, forKey: .env)
      try values.encodeIfPresent(cwd, forKey: .cwd)
    case .http(let url, let headers):
      try values.encode(Kind.http, forKey: .type)
      try values.encode(url, forKey: .url)
      try values.encode(headers, forKey: .headers)
    case .sse(let url, let headers):
      try values.encode(Kind.sse, forKey: .type)
      try values.encode(url, forKey: .url)
      try values.encode(headers, forKey: .headers)
    }
  }
}

struct SettingsMCPServer: Codable, Equatable, Identifiable, Sendable, CustomStringConvertible {
  let id: String
  let name: String
  let descriptionText: String
  let enabled: Bool
  let timeoutMs: Int
  let disabledTools: [String]?
  let transport: SettingsMCPTransport

  var description: String { "SettingsMCPServer(id: \(id), transport: \(transport))" }

  enum CodingKeys: String, CodingKey {
    case id, name, enabled, timeoutMs, disabledTools, transport
    case descriptionText = "description"
  }
}

enum SettingsMCPExternalSource: Equatable, Sendable {
  case user
  case wslUser(distro: String)
  case workspace(ProjectLocation)
}

struct SettingsDiscoverMCPRequest: Codable, Equatable, Sendable {
  let sourceScope: String
  let distro: String?
  let projectLocation: ProjectLocation?

  init(source: SettingsMCPExternalSource) {
    switch source {
    case .user:
      sourceScope = "user"
      distro = nil
      projectLocation = nil
    case .wslUser(let value):
      sourceScope = "wsl-user"
      distro = value
      projectLocation = nil
    case .workspace(let value):
      sourceScope = "workspace"
      distro = nil
      projectLocation = value
    }
  }
}

struct SettingsExternalMCPServer: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let name: String
  let enabled: Bool
  let timeoutMs: Int
  let transport: SettingsMCPTransport
  let unsupportedReason: String?
}

struct SettingsExternalMCPGroup: Codable, Equatable, Identifiable, Sendable {
  let providerID: String
  let providerLabel: String
  let sourcePath: String
  let servers: [SettingsExternalMCPServer]

  var id: String { providerID + ":" + sourcePath }

  enum CodingKeys: String, CodingKey {
    case providerLabel, sourcePath, servers
    case providerID = "providerId"
  }
}

struct SettingsDiscoverMCPResult: Codable, Equatable, Sendable {
  let groups: [SettingsExternalMCPGroup]
}

struct SettingsMCPServerRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation?
  let server: SettingsMCPServer
}

struct SettingsMCPProbeEnvironment: Codable, Equatable, Sendable {
  let runtime: String
  let projectScoped: Bool
}

struct SettingsMCPProbeError: Codable, Equatable, Sendable, CustomStringConvertible {
  let code: String
  let message: String
  let authScheme: String?

  var description: String { "SettingsMCPProbeError(code: \(code), message: redacted)" }
}

struct SettingsMCPServerInfo: Codable, Equatable, Sendable {
  let name: String?
  let version: String?
}

struct SettingsMCPProbeResult: Codable, Equatable, Sendable, CustomStringConvertible {
  let status: String
  let latencyMs: Int
  let environment: SettingsMCPProbeEnvironment
  let toolCount: Int
  let tools: [String]?
  let serverInfo: SettingsMCPServerInfo?
  let error: SettingsMCPProbeError?

  var description: String {
    "SettingsMCPProbeResult(status: \(status), latencyMs: \(latencyMs), toolCount: \(toolCount))"
  }
}

struct SettingsMCPOAuthOwnerRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation?
}

struct SettingsMCPOAuthWaitRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation?
  let flowID: String

  enum CodingKeys: String, CodingKey {
    case projectLocation
    case flowID = "flowId"
  }
}

struct SettingsMCPOAuthClearRequest: Codable, Equatable, Sendable, CustomStringConvertible {
  let projectLocation: ProjectLocation?
  let url: String
  var description: String { "SettingsMCPOAuthClearRequest(url: redacted)" }
}

struct SettingsMCPOAuthStatusResult: Codable, Equatable, Sendable, CustomStringConvertible {
  let authenticatedURLs: [String]
  var description: String { "SettingsMCPOAuthStatusResult(count: \(authenticatedURLs.count))" }

  enum CodingKeys: String, CodingKey { case authenticatedURLs = "authenticatedUrls" }
}

enum SettingsMCPOAuthBeginResult: Codable, Equatable, Sendable, CustomStringConvertible {
  case authorized
  case redirect(flowID: String, authorizationURL: String)
  case error

  var description: String {
    switch self {
    case .authorized: return "SettingsMCPOAuthBeginResult.authorized"
    case .redirect: return "SettingsMCPOAuthBeginResult.redirect(redacted)"
    case .error: return "SettingsMCPOAuthBeginResult.error(redacted)"
    }
  }

  private enum CodingKeys: String, CodingKey {
    case status
    case flowID = "flowId"
    case authorizationURL
    case message
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    switch try values.decode(String.self, forKey: .status) {
    case "authorized": self = .authorized
    case "redirect":
      self = .redirect(
        flowID: try values.decode(String.self, forKey: .flowID),
        authorizationURL: try values.decode(String.self, forKey: .authorizationURL)
      )
    case "error":
      _ = try values.decode(String.self, forKey: .message)
      self = .error
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .status, in: values, debugDescription: "Invalid OAuth status"
      )
    }
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .authorized:
      try values.encode("authorized", forKey: .status)
    case .redirect(let flowID, let authorizationURL):
      try values.encode("redirect", forKey: .status)
      try values.encode(flowID, forKey: .flowID)
      try values.encode(authorizationURL, forKey: .authorizationURL)
    case .error:
      try values.encode("error", forKey: .status)
      try values.encode("redacted", forKey: .message)
    }
  }
}

enum SettingsMCPOAuthWaitResult: Codable, Equatable, Sendable, CustomStringConvertible {
  case authorized
  case error

  var description: String {
    switch self {
    case .authorized: return "SettingsMCPOAuthWaitResult.authorized"
    case .error: return "SettingsMCPOAuthWaitResult.error(redacted)"
    }
  }

  private enum CodingKeys: String, CodingKey { case status, message }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    switch try values.decode(String.self, forKey: .status) {
    case "authorized": self = .authorized
    case "error":
      _ = try values.decode(String.self, forKey: .message)
      self = .error
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .status, in: values, debugDescription: "Invalid OAuth status"
      )
    }
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .authorized: try values.encode("authorized", forKey: .status)
    case .error:
      try values.encode("error", forKey: .status)
      try values.encode("redacted", forKey: .message)
    }
  }
}
