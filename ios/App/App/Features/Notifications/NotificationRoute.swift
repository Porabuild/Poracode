import Foundation

struct NotificationRoute: Codable, Hashable, Sendable {
  static let version = 1

  var version: Int
  var clientConnectionId: ClientConnectionID
  var desktopId: String
  var threadId: String

  var registrationRoute: PushRegistrationRoute {
    PushRegistrationRoute(
      version: version,
      clientConnectionId: clientConnectionId,
      desktopId: desktopId
    )
  }

  var url: URL? {
    var components = URLComponents()
    components.scheme = "poracode"
    components.host = "notification"
    components.percentEncodedQuery = [
      ("version", String(version)),
      ("clientConnectionId", clientConnectionId.rawValue),
      ("desktopId", desktopId),
      ("threadId", threadId),
    ].map { "\($0.0)=\(Self.percentEncode($0.1))" }.joined(separator: "&")
    return components.url
  }

  private static func percentEncode(_ value: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
  }
}

struct PushRegistrationRoute: Codable, Hashable, Sendable {
  var version: Int
  var clientConnectionId: ClientConnectionID
  var desktopId: String

  init(
    version: Int = NotificationRoute.version, clientConnectionId: ClientConnectionID,
    desktopId: String
  ) {
    self.version = version
    self.clientConnectionId = clientConnectionId
    self.desktopId = desktopId
  }
}

struct NotificationNavigationEvent: Equatable, Sendable, Identifiable {
  var id: UInt64
  var route: NotificationRoute
  var threadTitle: String
}

enum NotificationRouteValidation {
  static func validIdentifier(_ value: String) -> Bool {
    !value.isEmpty && value.utf16.count <= 512
      && !value.unicodeScalars.contains { CharacterSet.controlCharacters.contains($0) }
  }
}
