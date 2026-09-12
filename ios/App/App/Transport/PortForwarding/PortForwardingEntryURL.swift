import Foundation

enum PortForwardingEntryURL {
  private static let tokenPattern = try! NSRegularExpression(
    pattern: #"^[A-Za-z0-9_-]{43}$"#)

  static func build(endpoint: String, enterPath: String, expectedForwardID: String) throws -> URL {
    guard let entry = URLComponents(string: enterPath),
      entry.scheme == nil, entry.host == nil, entry.user == nil, entry.password == nil,
      entry.port == nil, entry.fragment == nil,
      !enterPath.contains("\\"), !entry.percentEncodedPath.contains("%2f"),
      !entry.percentEncodedPath.contains("%2F"),
      !entry.percentEncodedPath.contains("..")
    else { throw PortForwardingFailure.unsafeEntry }

    let segments = entry.percentEncodedPath.split(separator: "/", omittingEmptySubsequences: false)
    guard segments.count == 4, segments[0].isEmpty, segments[1] == "forward",
      segments[3] == "enter",
      let decodedID = String(segments[2]).removingPercentEncoding,
      decodedID == expectedForwardID,
      entry.queryItems?.count == 1,
      let item = entry.queryItems?.first, item.name == "fwt", let token = item.value,
      tokenPattern.firstMatch(in: token, range: NSRange(token.startIndex..., in: token)) != nil
    else { throw PortForwardingFailure.unsafeEntry }

    try PortForwardingRemoteV3Contract.validateForwardEnter(
      forwardID: decodedID, token: token)
    guard var base = URLComponents(string: endpoint),
      let scheme = base.scheme?.lowercased(), ["http", "https"].contains(scheme),
      base.host != nil, base.user == nil, base.password == nil
    else { throw PortForwardingFailure.unsafeEntry }

    base.query = nil
    base.fragment = nil
    var basePath = base.percentEncodedPath
    if basePath.isEmpty { basePath = "/" }
    if !basePath.hasSuffix("/") { basePath += "/" }
    base.percentEncodedPath = basePath + entry.percentEncodedPath.drop(while: { $0 == "/" })
    base.percentEncodedQuery = entry.percentEncodedQuery
    guard let result = base.url else { throw PortForwardingFailure.unsafeEntry }
    return result
  }
}
