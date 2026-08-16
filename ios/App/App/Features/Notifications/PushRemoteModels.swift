import Foundation

struct PushRegistrationRequest: Codable, Sendable, Equatable {
  var deviceId: String
  var platform: String = "ios"
  var deviceToken: String
  var appVersion: String
  var routing: PushRegistrationRoute
  var pushToStartToken: String?
  var activityTokens: [String: String]?

  init(
    deviceId: String,
    deviceToken: String,
    appVersion: String,
    routing: PushRegistrationRoute,
    pushToStartToken: String? = nil,
    activityTokens: [String: String]? = nil
  ) {
    self.deviceId = deviceId
    self.deviceToken = deviceToken
    self.appVersion = appVersion
    self.routing = routing
    self.pushToStartToken = pushToStartToken
    self.activityTokens = activityTokens
  }
}

struct PushRegistrationResponse: Codable, Sendable, Equatable {
  struct RoutingEcho: Codable, Sendable, Equatable {
    var version: Int
  }

  var ok: Bool
  var routing: RoutingEcho?

  var acceptedRoutingV1: Bool {
    ok && routing?.version == NotificationRoute.version
  }
}

struct PushUnregisterRequest: Codable, Sendable, Equatable {
  var deviceId: String
  var routing: PushRegistrationRoute
}

protocol PushRemoteAPI: Sendable {
  func environment() async throws -> RemoteEnvironmentDescriptor
  func registerPush(_ request: PushRegistrationRequest) async throws -> PushRegistrationResponse
  func unregisterPush(_ request: PushUnregisterRequest) async throws
}

struct PushHostEndpoint: Sendable, Equatable {
  var connectionId: ClientConnectionID
  var desktopId: String
  var endpoint: String
  var accessToken: String
}

enum PushRoutingCapability {
  static func supportsV1(_ environment: RemoteEnvironmentDescriptor) -> Bool {
    environment.capabilities?.pushRouting?.versions.contains(NotificationRoute.version) == true
  }
}
