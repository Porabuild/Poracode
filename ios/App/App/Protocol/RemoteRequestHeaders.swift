import Foundation

/// The one place feature transports get the authenticated request headers from.
///
/// Keeping the header names here means a feature's own transport never has to
/// spell out the credential scheme, which in turn lets those slices keep a hard
/// source gate against credential vocabulary appearing in feature code.
enum RemoteRequestHeaders {
  static let authorization = "Authorization"
  static let contentType = "Content-Type"
  static let jsonContentType = "application/json"

  static func authorizationValue(for token: String) -> String {
    "\(ProtocolConstants.bearerTokenType) \(token)"
  }
}
