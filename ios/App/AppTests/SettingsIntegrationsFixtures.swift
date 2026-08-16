import Foundation
import XCTest

@testable import App

enum SettingsIntegrationsFixtures {
  static let secret = "Bearer host-token client_secret=plaintext authorization-code"
  static let posix = ProjectLocation.posix(path: "/workspace", remoteServerId: "remote")
  static let wsl = ProjectLocation.wsl(
    distro: "Ubuntu",
    linuxPath: "/home/dev/project",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\dev\\project",
    remoteServerId: "wsl-remote"
  )

  static let server = SettingsMCPServer(
    id: "server-1",
    name: "example-server",
    descriptionText: "Example",
    enabled: true,
    timeoutMs: 30_000,
    disabledTools: nil,
    transport: .http(
      url: "https://mcp.example.test/rpc",
      headers: ["Authorization": secret]
    )
  )

  static var results: [SettingsIntegrationsProcedure: Any] {
    [
      .scanSkills: [
        "skills": [], "effectiveSkillIds": [], "invocation": NSNull(), "issues": [],
        "canLinkToGlobal": false,
      ],
      .listSkillMarketplace: ["marketplace": "skills-sh", "skills": [], "total": 0],
      .importSkills: ["imported": []],
      .installMarketplaceSkill: ["installed": "/skills/demo"],
      .discoverExternalMcpServers: ["groups": []],
      .probeMcpServer: [
        "status": "available", "latencyMs": 12,
        "environment": ["runtime": "host", "projectScoped": false], "toolCount": 2,
      ],
      .getMcpOauthStatus: ["authenticatedUrls": []],
      .beginMcpServerOauth: ["status": "authorized"],
      .waitMcpServerOauth: ["status": "authorized"],
    ]
  }

  static func envelope(_ procedure: SettingsIntegrationsProcedure) throws -> Data {
    let metadata = SettingsIntegrationsRemoteV3Contract.metadata(for: procedure)
    let object: [String: Any]
    if metadata.resultKind == "omitted" {
      object = [:]
    } else {
      object = ["result": try XCTUnwrap(results[procedure])]
    }
    return try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  }

  static func request(_ procedure: SettingsIntegrationsProcedure) throws -> Data {
    switch procedure {
    case .scanSkills:
      return try SettingsIntegrationsRemoteV3Contract.request(
        procedure,
        payload: SettingsSkillScanRequest(
          projectLocation: wsl, wslDistro: "Ubuntu", agentKind: "codex", presentationMode: "gui"
        )
      )
    case .listSkillMarketplace:
      return try SettingsIntegrationsRemoteV3Contract.request(
        procedure,
        payload: SettingsSkillMarketplaceRequest(
          marketplace: .skillsSH, query: "swift", sort: .rank
        )
      )
    case .setSkillEnabled:
      return try SettingsIntegrationsRemoteV3Contract.request(
        procedure,
        payload: SettingsSetSkillEnabledRequest(
          absolutePath: "/skills/demo", enabled: true, projectLocation: wsl, wslDistro: "Ubuntu"
        )
      )
    case .deleteSkill:
      return try SettingsIntegrationsRemoteV3Contract.request(
        procedure,
        payload: SettingsDeleteSkillRequest(
          absolutePath: "/skills/demo", projectLocation: wsl, wslDistro: "Ubuntu"
        )
      )
    case .importSkills:
      return try SettingsIntegrationsRemoteV3Contract.request(
        procedure,
        payload: SettingsImportSkillsRequest(skills: [
          .init(
            sourcePath: "/source/demo",
            sourceProjectLocation: wsl,
            sourceWslDistro: "Ubuntu",
            destinationScope: .project,
            availability: .poracode,
            mode: .copy,
            replace: false,
            projectLocation: posix,
            wslDistro: nil
          )
        ])
      )
    case .installMarketplaceSkill:
      return try SettingsIntegrationsRemoteV3Contract.request(
        procedure,
        payload: SettingsInstallMarketplaceSkillRequest(
          marketplace: .skillsSH,
          marketplaceSkillID: "owner/repo/demo",
          destinationScope: .global,
          availability: .poracode,
          replace: false,
          projectLocation: nil,
          wslDistro: nil
        )
      )
    case .discoverExternalMcpServers:
      return try SettingsIntegrationsRemoteV3Contract.request(
        procedure, payload: SettingsDiscoverMCPRequest(source: .workspace(wsl))
      )
    case .probeMcpServer, .beginMcpServerOauth:
      return try SettingsIntegrationsRemoteV3Contract.request(
        procedure,
        payload: SettingsMCPServerRequest(projectLocation: wsl, server: server)
      )
    case .getMcpOauthStatus:
      return try SettingsIntegrationsRemoteV3Contract.request(
        procedure, payload: SettingsMCPOAuthOwnerRequest(projectLocation: wsl)
      )
    case .waitMcpServerOauth:
      return try SettingsIntegrationsRemoteV3Contract.request(
        procedure,
        payload: SettingsMCPOAuthWaitRequest(projectLocation: wsl, flowID: "flow-1")
      )
    case .clearMcpServerOauth:
      return try SettingsIntegrationsRemoteV3Contract.request(
        procedure,
        payload: SettingsMCPOAuthClearRequest(
          projectLocation: wsl, url: "https://mcp.example.test/rpc"
        )
      )
    }
  }
}

final class SettingsIntegrationsURLProtocol: URLProtocol, @unchecked Sendable {
  struct Reply: Sendable {
    let status: Int
    let body: Data
  }
  private static let lock = NSLock()
  nonisolated(unsafe) private static var replies: [Reply] = []
  nonisolated(unsafe) private static var captured: [URLRequest] = []
  nonisolated(unsafe) private static var capturedBodies: [Data?] = []

  static func reset() {
    lock.withLock {
      replies = []
      captured = []
      capturedBodies = []
    }
  }
  static func enqueue(_ data: Data, status: Int = 200) {
    lock.withLock { replies.append(.init(status: status, body: data)) }
  }
  static var requests: [URLRequest] { lock.withLock { captured } }
  static var bodies: [Data?] { lock.withLock { capturedBodies } }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    let reply: Reply? = Self.lock.withLock {
      Self.captured.append(request)
      Self.capturedBodies.append(Self.body(from: request))
      return Self.replies.isEmpty ? nil : Self.replies.removeFirst()
    }
    guard let reply,
      let response = HTTPURLResponse(
        url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1",
        headerFields: ["Content-Type": "application/json"]
      )
    else {
      client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
      return
    }
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: reply.body)
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}

  private static func body(from request: URLRequest) -> Data? {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var data = Data()
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4_096)
    defer { buffer.deallocate() }
    while true {
      let count = stream.read(buffer, maxLength: 4_096)
      if count <= 0 { return data.isEmpty ? nil : data }
      data.append(buffer, count: count)
    }
  }
}

func settingsIntegrationsClient() -> RemoteAPIClient {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [SettingsIntegrationsURLProtocol.self]
  return RemoteAPIClient(
    endpoint: "https://host.example/prefix",
    accessToken: "host-token",
    session: URLSession(configuration: configuration)
  )
}

func settingsIntegrationsContext(
  suffix: String = "1",
  generation: UInt64 = 1,
  projectID: String? = nil,
  project: ProjectLocation? = nil
) -> SettingsIntegrationsContext {
  let uuid = UUID(uuidString: "00000000-0000-4000-8000-00000000000\(suffix)")!
  let connectionID = ClientConnectionID(uuid)
  return .init(
    lease: .init(connectionID: connectionID, generation: generation),
    projectIdentity: projectID.map {
      ProjectIdentity(connectionId: connectionID, projectId: $0)
    },
    projectLocation: project
  )
}

func settingsIntegrationsAccess(
  _ context: SettingsIntegrationsContext,
  protocolVersion: Int = 3,
  online: Bool = true,
  ready: Bool = true,
  scopes: Set<SettingsIntegrationsScope> = Set(SettingsIntegrationsScope.allCases)
) -> SettingsIntegrationsAccess {
  .init(
    context: context,
    protocolVersion: protocolVersion,
    isOnline: online,
    isReady: ready,
    scopes: scopes
  )
}
