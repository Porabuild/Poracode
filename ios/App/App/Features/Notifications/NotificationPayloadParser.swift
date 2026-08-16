import Foundation

enum NotificationPayloadParser {
  private static let envelopeKey = "poracode"

  static func parse(userInfo: [AnyHashable: Any]) -> NotificationRoute? {
    guard let raw = userInfo[envelopeKey],
      let object = stringKeyedObject(raw)
    else { return nil }
    return parse(object: object)
  }

  /// True when the payload carries the routed-v1 envelope key, even when the
  /// envelope is malformed. Lets presentation policy distinguish a routed push
  /// that cannot be host-verified from a legacy (unrouted) push.
  static func hasRoutingEnvelope(userInfo: [AnyHashable: Any]) -> Bool {
    userInfo[envelopeKey] != nil
  }

  static func parse(url: URL) -> NotificationRoute? {
    guard url.scheme?.lowercased() == "poracode", url.host == "notification",
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    else { return nil }
    var values: [String: Any] = [:]
    for item in components.queryItems ?? [] {
      guard values[item.name] == nil, let value = item.value else { return nil }
      values[item.name] = value
    }
    if let rawVersion = values["version"] as? String,
      let version = Int(rawVersion)
    {
      values["version"] = version
    }
    return parse(object: values)
  }

  static func parse(object: [String: Any]) -> NotificationRoute? {
    guard let version = exactInteger(object["version"]), version == NotificationRoute.version,
      let connectionRaw = object["clientConnectionId"] as? String,
      let connectionId = ClientConnectionID(rawValue: connectionRaw),
      let desktopId = validIdentifier(object["desktopId"]),
      let threadId = validIdentifier(object["threadId"])
    else { return nil }
    return NotificationRoute(
      version: version,
      clientConnectionId: connectionId,
      desktopId: desktopId,
      threadId: threadId
    )
  }

  private static func stringKeyedObject(_ value: Any) -> [String: Any]? {
    if let object = value as? [String: Any] { return object }
    guard let dictionary = value as? NSDictionary else { return nil }
    var result: [String: Any] = [:]
    for (key, value) in dictionary {
      guard let key = key as? String else { return nil }
      result[key] = value
    }
    return result
  }

  private static func exactInteger(_ value: Any?) -> Int? {
    if value is Bool { return nil }
    if let value = value as? Int { return value }
    if let value = value as? NSNumber {
      let double = value.doubleValue
      guard double.isFinite, double.rounded(.towardZero) == double,
        double >= Double(Int.min), double <= Double(Int.max)
      else { return nil }
      return Int(double)
    }
    return nil
  }

  private static func validIdentifier(_ value: Any?) -> String? {
    guard let value = value as? String,
      NotificationRouteValidation.validIdentifier(value)
    else { return nil }
    return value
  }
}
