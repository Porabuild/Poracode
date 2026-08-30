import Foundation

enum BrowserMirrorRoute: String, CaseIterable, Sendable {
  case state = "browser-state"
  case command = "browser-command"

  var expected: BrowserMirrorRouteMetadata {
    switch self {
    case .state:
      BrowserMirrorRouteMetadata(
        method: "GET",
        path: "/api/browser/state",
        scopes: [BrowserMirrorCapability.read.rawValue],
        bodyKind: "empty",
        status: 200
      )
    case .command:
      BrowserMirrorRouteMetadata(
        method: "POST",
        path: "/api/browser/command",
        scopes: [BrowserMirrorCapability.operate.rawValue],
        bodyKind: "json",
        status: 200
      )
    }
  }
}

struct BrowserMirrorRouteMetadata: Equatable, Sendable {
  let method: String
  let path: String
  let scopes: [String]
  let bodyKind: String
  let status: Int
}

enum BrowserMirrorContractError: Error, Equatable, Sendable {
  case incompatibleMetadata
  case invalidRequest
  case invalidResponse
  case messageTooLarge
  case invalidFrame
}

enum BrowserMirrorRemoteV3Adapter {
  static let protocolVersion = 8
  static let maximumFrameBytes = 4 * 1_024 * 1_024
  static let maximumMessageBytes = 6 * 1_024 * 1_024

  static var individualRootIDs: Set<String> {
    [
      RemoteRootCodecs.routeU2EBrowserU2DCommandU2ERequest.id,
      RemoteRootCodecs.routeU2EBrowserU2DCommandU2EResponse.id,
      RemoteRootCodecs.routeU2EBrowserU2DStateU2EResponse.id,
      RemoteRootCodecs.websocketU2EClientU2EBrowserU2DWatch.id,
      RemoteRootCodecs.websocketU2EClientU2EBrowserU2DUnwatch.id,
      RemoteRootCodecs.websocketU2EClientU2EBrowserU2DInput.id,
      RemoteRootCodecs.websocketU2EServerU2EBrowserU2DState.id,
      RemoteRootCodecs.websocketU2EServerU2EBrowserU2DFrame.id,
      RemoteRootCodecs.websocketU2EServerU2EBrowserU2DMirrorU2DStatus.id,
    ]
  }

  static func metadata(for route: BrowserMirrorRoute) throws -> BrowserMirrorRouteMetadata {
    let expected = route.expected
    guard RemoteContractMetadata.protocolVersion == protocolVersion,
      RemoteContractMetadata.bindingFormatVersion == 2,
      RemoteContractMetadata.generatorVersion == 3,
      let generated = RemoteContractMetadata.routes.first(where: { $0.id == route.rawValue }),
      generated.method == expected.method,
      generated.path == expected.path,
      generated.auth == "bearer",
      generated.scopes == expected.scopes,
      generated.bodyKind == expected.bodyKind,
      generated.responseKind == "json",
      generated.status == expected.status
    else { throw BrowserMirrorContractError.incompatibleMetadata }
    return expected
  }

  static func stateResponse(_ data: Data) throws -> BrowserMirrorState {
    do {
      _ = try metadata(for: .state)
      let canonical = try canonical(
        data,
        codec: RemoteRootCodecs.routeU2EBrowserU2DStateU2EResponse
      )
      return try decoder.decode(StateEnvelope.self, from: canonical).state
    } catch {
      throw BrowserMirrorContractError.invalidResponse
    }
  }

  static func commandRequest(_ command: BrowserMirrorCommand) throws -> Data {
    do {
      _ = try metadata(for: .command)
      return try canonical(
        encoder.encode(command),
        codec: RemoteRootCodecs.routeU2EBrowserU2DCommandU2ERequest
      )
    } catch {
      throw BrowserMirrorContractError.invalidRequest
    }
  }

  static func commandResponse(_ data: Data) throws -> BrowserMirrorState {
    do {
      _ = try metadata(for: .command)
      let canonical = try canonical(
        data,
        codec: RemoteRootCodecs.routeU2EBrowserU2DCommandU2EResponse
      )
      return try decoder.decode(StateEnvelope.self, from: canonical).state
    } catch {
      throw BrowserMirrorContractError.invalidResponse
    }
  }

  static func watchMessage() throws -> Data {
    try canonical(
      json(["type": "browser-watch"]),
      codec: RemoteRootCodecs.websocketU2EClientU2EBrowserU2DWatch
    )
  }

  static func unwatchMessage() throws -> Data {
    try canonical(
      json(["type": "browser-unwatch"]),
      codec: RemoteRootCodecs.websocketU2EClientU2EBrowserU2DUnwatch
    )
  }

  static func inputMessage(_ input: BrowserMirrorInput) throws -> Data {
    do {
      let inputObject = try JSONSerialization.jsonObject(with: encoder.encode(input))
      return try canonical(
        json(["type": "browser-input", "input": inputObject]),
        codec: RemoteRootCodecs.websocketU2EClientU2EBrowserU2DInput
      )
    } catch {
      throw BrowserMirrorContractError.invalidRequest
    }
  }

  static func serverEvent(_ data: Data) throws -> BrowserMirrorSocketEvent {
    guard data.count <= maximumMessageBytes else {
      throw BrowserMirrorContractError.messageTooLarge
    }
    guard
      let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let type = object["type"] as? String
    else { throw BrowserMirrorContractError.invalidResponse }

    switch type {
    case "browser-state":
      let canonical = try canonical(
        data,
        codec: RemoteRootCodecs.websocketU2EServerU2EBrowserU2DState
      )
      return .state(try decoder.decode(SocketStateEnvelope.self, from: canonical).state)
    case "browser-frame":
      let canonical = try canonical(
        data,
        codec: RemoteRootCodecs.websocketU2EServerU2EBrowserU2DFrame
      )
      let envelope = try decoder.decode(FrameEnvelope.self, from: canonical)
      return .frame(try frame(from: envelope))
    case "browser-mirror-status":
      let canonical = try canonical(
        data,
        codec: RemoteRootCodecs.websocketU2EServerU2EBrowserU2DMirrorU2DStatus
      )
      let envelope = try decoder.decode(StatusEnvelope.self, from: canonical)
      switch envelope.status.status {
      case "starting": return .status(.starting(tabId: envelope.status.tabId))
      case "active": return .status(.active(tabId: envelope.status.tabId))
      case "unavailable": return .status(.unavailable)
      default: throw BrowserMirrorContractError.invalidResponse
      }
    default:
      throw BrowserMirrorContractError.invalidResponse
    }
  }

  private static let decoder = JSONDecoder()
  private static let encoder: JSONEncoder = {
    let value = JSONEncoder()
    value.outputFormatting = [.sortedKeys]
    return value
  }()

  private static func frame(from envelope: FrameEnvelope) throws -> BrowserMirrorFrame {
    let maximumEncodedCharacters = ((maximumFrameBytes + 2) / 3) * 4
    guard envelope.data.utf8.count <= maximumEncodedCharacters,
      let bytes = Data(base64Encoded: envelope.data),
      bytes.count <= maximumFrameBytes,
      bytes.count >= 5,
      bytes.starts(with: [0xFF, 0xD8, 0xFF]),
      bytes.suffix(2).elementsEqual([0xFF, 0xD9])
    else { throw BrowserMirrorContractError.invalidFrame }

    let metadata = envelope.metadata
    guard metadata.deviceWidth.isFinite, metadata.deviceHeight.isFinite,
      metadata.deviceWidth > 0, metadata.deviceHeight > 0,
      metadata.deviceWidth <= 16_384, metadata.deviceHeight <= 16_384,
      metadata.pageScaleFactor.isFinite, metadata.pageScaleFactor > 0,
      metadata.offsetTop.isFinite, metadata.scrollOffsetX.isFinite,
      metadata.scrollOffsetY.isFinite
    else { throw BrowserMirrorContractError.invalidFrame }

    return BrowserMirrorFrame(
      tabId: envelope.tabId,
      jpegData: bytes,
      metadata: metadata
    )
  }

  private static func canonical<Value: Codable & Sendable>(
    _ data: Data,
    codec: RemoteRootCodec<Value>
  ) throws -> Data {
    try codec.encodeSnapshot(codec.decode(data))
  }

  private static func json(_ object: [String: Any]) throws -> Data {
    try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  }
}

private struct StateEnvelope: Decodable {
  let state: BrowserMirrorState
}

private struct SocketStateEnvelope: Decodable {
  let state: BrowserMirrorState
}

private struct FrameEnvelope: Decodable {
  let tabId: String
  let data: String
  let metadata: BrowserMirrorFrameMetadata
}

private struct StatusEnvelope: Decodable {
  struct Status: Decodable {
    let status: String
    let tabId: String?
  }

  let status: Status
}
