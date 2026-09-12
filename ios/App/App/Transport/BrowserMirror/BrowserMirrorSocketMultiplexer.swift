import Foundation

/// Narrow inbound sink for browser traffic carried on the shared event-stream socket.
/// Implementations receive raw bytes plus the socket generation they arrived on so a
/// frame from a superseded connection can be discarded without inspecting it.
protocol BrowserMirrorSocketInboundSink: Sendable {
  func receiveBrowserMirrorMessage(_ data: Data, socketGeneration: UInt64) async
}

/// Wire classification for the browser multiplexer.
///
/// Browser traffic is deliberately out-of-band: it is neither a replayable `event` nor a
/// transcript frame, so it must never advance the replay cursor or reach the reducers.
/// Classification only reads the top-level `type` discriminator; payload validation stays
/// in `BrowserMirrorRemoteV3Adapter` behind the generated roots.
enum BrowserMirrorSocketWire {
  static let clientTypes: Set<String> = [
    "browser-watch", "browser-unwatch", "browser-input",
  ]

  static let serverTypes: Set<String> = [
    "browser-state", "browser-frame", "browser-mirror-status",
  ]

  static let maximumMessageBytes = BrowserMirrorRemoteV3Adapter.maximumMessageBytes

  private static let token = Data("\"browser-".utf8)

  /// Cheap byte prefilter so ordinary event frames are not parsed twice. A false
  /// positive is harmless: `serverType` still requires a top-level browser discriminator.
  static func mayBeBrowserMessage(_ data: Data) -> Bool {
    data.count <= maximumMessageBytes && data.range(of: token) != nil
  }

  static func serverType(_ data: Data) -> String? {
    type(data, allowed: serverTypes)
  }

  static func clientType(_ data: Data) -> String? {
    type(data, allowed: clientTypes)
  }

  private static func type(_ data: Data, allowed: Set<String>) -> String? {
    guard data.count <= maximumMessageBytes,
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let value = object["type"] as? String,
      allowed.contains(value)
    else { return nil }
    return value
  }
}
