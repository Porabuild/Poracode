import Foundation

/// App-owned accessors for the generated C1 environment route codecs.
///
/// The generated Swift bindings already carry every environment route codec
/// (`RemoteRootCodecs.routeU2EEnvironmentU2D*`). This file only exposes them
/// through the stable `GeneratedRemoteV3Contract` boundary so app models can
/// decode canonical JSON and never hand-roll a second protocol stack.
extension GeneratedRemoteV3Contract {
    static func environmentListResponse(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DListU2EResponse,
            boundary: "environment list response"
        )
    }

    static func environmentResultResponse(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DGetU2EResponse,
            boundary: "environment response"
        )
    }

    static func environmentDeleteResponse(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DDeleteU2EResponse,
            boundary: "environment delete response"
        )
    }

    static func environmentPairingResponse(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DPairingU2EResponse,
            boundary: "environment pairing response"
        )
    }

    static func environmentTrustProbeResponse(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DTrustU2DProbeU2EResponse,
            boundary: "environment trust probe response"
        )
    }

    static func environmentWebSocketTicketResponse(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DWebsocketU2DTicketU2EResponse,
            boundary: "environment websocket ticket response"
        )
    }

    static func environmentCreateRequest(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DCreateU2ERequest,
            boundary: "environment create request"
        )
    }

    static func environmentUpdateRequest(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DUpdateU2ERequest,
            boundary: "environment update request"
        )
    }

    static func environmentExpectedRevisionRequest(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DDeleteU2ERequest,
            boundary: "environment revision request"
        )
    }

    static func environmentUpgradeRequest(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DUpgradeU2ERequest,
            boundary: "environment upgrade request"
        )
    }

    static func environmentTrustAcceptRequest(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DTrustU2DAcceptU2ERequest,
            boundary: "environment trust accept request"
        )
    }

    static func environmentAdoptLegacyRequest(_ data: Data) throws -> Data {
        try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DAdoptU2DLegacyU2ERequest,
            boundary: "environment adopt legacy request"
        )
    }

    /// Validates an `{environmentId}` path payload against the generated route
    /// path schema (UUID grammar) and returns the accepted id.
    static func validatedEnvironmentId(_ data: Data) throws -> String {
        let canonical = try canonicalData(
            data,
            codec: RemoteRootCodecs.routeU2EEnvironmentU2DGetU2EPath,
            boundary: "environment path"
        )
        let object = try JSONDecoding.decode(EnvironmentPathPayload.self, from: canonical)
        return object.environmentId
    }
}

private struct EnvironmentPathPayload: Codable {
    var environmentId: String
}
