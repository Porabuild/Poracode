import Foundation

enum PortForwardingRoute: String, CaseIterable, Hashable, Sendable {
  case portsRead = "ports-read"
  case portForward = "port-forward"
  case portEnter = "port-enter"
  case portUnforward = "port-unforward"
  case forwardEnter = "forward-enter"

  var expected: PortForwardingRouteMetadata {
    switch self {
    case .portsRead:
      .init(
        method: "GET", path: "/api/ports", auth: "bearer", scopes: ["ports:forward"],
        bodyKind: "empty", responseKind: "json", status: 200)
    case .portForward:
      .init(
        method: "POST", path: "/api/ports/forward", auth: "bearer",
        scopes: ["ports:forward"], bodyKind: "json", responseKind: "json", status: 200)
    case .portEnter:
      .init(
        method: "POST", path: "/api/ports/enter", auth: "bearer",
        scopes: ["ports:forward"], bodyKind: "json", responseKind: "json", status: 200)
    case .portUnforward:
      .init(
        method: "POST", path: "/api/ports/unforward", auth: "bearer",
        scopes: ["ports:forward"], bodyKind: "json", responseKind: "json", status: 200)
    case .forwardEnter:
      .init(
        method: "GET", path: "/forward/{forwardId}/enter", auth: "forward-enter-token",
        scopes: [], bodyKind: "empty", responseKind: "redirect-html", status: 302)
    }
  }

  var isMutation: Bool {
    switch self {
    case .portsRead, .forwardEnter: false
    case .portForward, .portEnter, .portUnforward: true
    }
  }
}

struct PortForwardingRouteMetadata: Equatable, Sendable {
  let method: String
  let path: String
  let auth: String
  let scopes: [String]
  let bodyKind: String
  let responseKind: String
  let status: Int
}

enum PortForwardingContractError: Error, Equatable, Sendable {
  case incompatibleMetadata
  case invalidRequest
  case invalidResponse
}

enum PortForwardingRemoteV3Contract {
  static let protocolVersion = 8

  static func metadata(for route: PortForwardingRoute) throws -> PortForwardingRouteMetadata {
    let expected = route.expected
    guard RemoteContractMetadata.protocolVersion == protocolVersion,
      RemoteContractMetadata.bindingFormatVersion == 2,
      RemoteContractMetadata.generatorVersion == 3,
      let generated = RemoteContractMetadata.routes.first(where: { $0.id == route.rawValue }),
      generated.method == expected.method,
      generated.path == expected.path,
      generated.auth == expected.auth,
      generated.scopes == expected.scopes,
      generated.bodyKind == expected.bodyKind,
      generated.responseKind == expected.responseKind,
      generated.status == expected.status
    else { throw PortForwardingContractError.incompatibleMetadata }
    return expected
  }

  static func portsResponse(_ data: Data) throws -> PortForwardingSnapshot {
    do {
      _ = try metadata(for: .portsRead)
      let canonical = try canonical(
        data, codec: RemoteRootCodecs.routeU2EPortsU2DReadU2EResponse)
      return try decoder.decode(PortForwardingSnapshot.self, from: canonical)
    } catch {
      throw PortForwardingContractError.invalidResponse
    }
  }

  static func forwardRequest(port: Int) throws -> Data {
    guard (1...65_535).contains(port) else {
      throw PortForwardingContractError.invalidRequest
    }
    return try request(
      ["targetPort": port], route: .portForward,
      codec: RemoteRootCodecs.routeU2EPortU2DForwardU2ERequest)
  }

  static func forwardResponse(_ data: Data) throws -> PortForward {
    struct Envelope: Decodable { let forward: PortForward }
    do {
      _ = try metadata(for: .portForward)
      let canonical = try canonical(
        data, codec: RemoteRootCodecs.routeU2EPortU2DForwardU2EResponse)
      return try decoder.decode(Envelope.self, from: canonical).forward
    } catch {
      throw PortForwardingContractError.invalidResponse
    }
  }

  static func enterRequest(forwardID: String) throws -> Data {
    try identifierRequest(
      forwardID, route: .portEnter,
      codec: RemoteRootCodecs.routeU2EPortU2DEnterU2ERequest)
  }

  static func enterResponse(_ data: Data) throws -> String {
    struct Envelope: Decodable { let enterPath: String }
    do {
      _ = try metadata(for: .portEnter)
      let canonical = try canonical(
        data, codec: RemoteRootCodecs.routeU2EPortU2DEnterU2EResponse)
      return try decoder.decode(Envelope.self, from: canonical).enterPath
    } catch {
      throw PortForwardingContractError.invalidResponse
    }
  }

  static func unforwardRequest(forwardID: String) throws -> Data {
    try identifierRequest(
      forwardID, route: .portUnforward,
      codec: RemoteRootCodecs.routeU2EPortU2DUnforwardU2ERequest)
  }

  static func unforwardResponse(_ data: Data) throws {
    struct Envelope: Decodable { let ok: Bool }
    do {
      _ = try metadata(for: .portUnforward)
      let canonical = try canonical(
        data, codec: RemoteRootCodecs.routeU2EPortU2DUnforwardU2EResponse)
      guard try decoder.decode(Envelope.self, from: canonical).ok else {
        throw PortForwardingContractError.invalidResponse
      }
    } catch {
      throw PortForwardingContractError.invalidResponse
    }
  }

  static func validateForwardEnter(forwardID: String, token: String) throws {
    do {
      _ = try metadata(for: .forwardEnter)
      _ = try canonical(
        json(["forwardId": forwardID]),
        codec: RemoteRootCodecs.routeU2EForwardU2DEnterU2EPath)
      _ = try canonical(
        json(["fwt": token]),
        codec: RemoteRootCodecs.routeU2EForwardU2DEnterU2EQuery)
    } catch {
      throw PortForwardingContractError.invalidRequest
    }
  }

  private static let decoder = JSONDecoder()

  private static func request<Value: Codable & Sendable>(
    _ object: [String: Any], route: PortForwardingRoute, codec: RemoteRootCodec<Value>
  ) throws -> Data {
    do {
      _ = try metadata(for: route)
      return try canonical(json(object), codec: codec)
    } catch {
      throw PortForwardingContractError.invalidRequest
    }
  }

  private static func identifierRequest<Value: Codable & Sendable>(
    _ id: String, route: PortForwardingRoute, codec: RemoteRootCodec<Value>
  ) throws -> Data {
    guard !id.isEmpty else { throw PortForwardingContractError.invalidRequest }
    return try request(["id": id], route: route, codec: codec)
  }

  private static func canonical<Value: Codable & Sendable>(
    _ data: Data, codec: RemoteRootCodec<Value>
  ) throws -> Data {
    try codec.encodeSnapshot(codec.decode(data))
  }

  private static func json(_ object: [String: Any]) throws -> Data {
    try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  }
}
