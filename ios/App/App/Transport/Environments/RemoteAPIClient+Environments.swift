import Foundation

/// The 13 C1 environment management operations (ADR §5 route matrix).
///
/// Authority is the host this client is *bound to* (endpoint + bearer):
/// - a direct/ssh client manages its own host registry;
/// - an environment-bound client manages the child registry through the parent
///   proxy under the child grant, so one proxied hop is supported rather than
///   blanket-thrown.
///
/// Pairing a second proxied hop is refused elsewhere, by construction: an
/// environment is only ever paired under a direct parent record
/// (`HostCatalog.pairAddEnvironment`), never under another environment.
extension RemoteAPIClient {
    // MARK: - Reads

    func listEnvironments() async throws -> [RemoteEnvironmentProjection] {
        let data = try await requestData(path: "/api/environments")
        let canonical = try GeneratedRemoteV3Contract.environmentListResponse(data)
        return try JSONDecoding.decode(EnvironmentListEnvelope.self, from: canonical).environments
    }

    func getEnvironment(environmentId: String) async throws -> RemoteEnvironmentProjection {
        let data = try await requestData(path: try environmentPath(environmentId))
        return try decodeEnvironmentResult(data)
    }

    // MARK: - Mutations

    func createEnvironment(
        _ request: RemoteEnvironmentCreateRequest
    ) async throws -> RemoteEnvironmentProjection {
        var body: [String: Any] = [
            "label": request.label,
            "target": request.target,
        ]
        if let port = request.port { body["port"] = port }
        if let credentialRef = request.credentialRef { body["credentialRef"] = credentialRef }
        if let desired = request.desired { body["desired"] = desired.rawValue }
        if let legacy = request.legacyConnectionId { body["legacyConnectionId"] = legacy }
        let canonical = try GeneratedRemoteV3Contract.environmentCreateRequest(
            try JSONSerialization.data(withJSONObject: body)
        )
        let data = try await requestData(
            path: "/api/environments",
            method: "POST",
            jsonBody: canonical
        )
        return try decodeEnvironmentResult(data)
    }

    func updateEnvironment(
        environmentId: String,
        expectedRevision: Int,
        patch: RemoteEnvironmentUpdatePatch
    ) async throws -> RemoteEnvironmentProjection {
        var patchObject: [String: Any] = [:]
        if let label = patch.label { patchObject["label"] = label }
        if let target = patch.target { patchObject["target"] = target }
        if let port = patch.port { patchObject["port"] = port ?? NSNull() }
        if let credentialRef = patch.credentialRef {
            patchObject["credentialRef"] = credentialRef ?? NSNull()
        }
        if let desired = patch.desired { patchObject["desired"] = desired.rawValue }
        let canonical = try GeneratedRemoteV3Contract.environmentUpdateRequest(
            try JSONSerialization.data(withJSONObject: [
                "expectedRevision": expectedRevision,
                "patch": patchObject,
            ])
        )
        let data = try await requestData(
            path: try environmentPath(environmentId),
            method: "POST",
            jsonBody: canonical
        )
        return try decodeEnvironmentResult(data)
    }

    func deleteEnvironment(environmentId: String, expectedRevision: Int) async throws {
        let body = try revisionBody(expectedRevision)
        let data = try await requestData(
            path: try environmentPath(environmentId, suffix: "/delete"),
            method: "POST",
            jsonBody: body
        )
        _ = try GeneratedRemoteV3Contract.environmentDeleteResponse(data)
    }

    // MARK: - Use

    func connectEnvironment(environmentId: String) async throws -> RemoteEnvironmentProjection {
        let data = try await requestData(
            path: try environmentPath(environmentId, suffix: "/connect"),
            method: "POST"
        )
        return try decodeEnvironmentResult(data)
    }

    func disconnectEnvironment(environmentId: String) async throws -> RemoteEnvironmentProjection {
        let data = try await requestData(
            path: try environmentPath(environmentId, suffix: "/disconnect"),
            method: "POST"
        )
        return try decodeEnvironmentResult(data)
    }

    /// Mints the one-time child pairing credential through the parent proxy.
    func pairEnvironment(environmentId: String) async throws -> RemoteEnvironmentPairing {
        let data = try await requestData(
            path: try environmentPath(environmentId, suffix: "/pairing"),
            method: "POST"
        )
        let canonical = try GeneratedRemoteV3Contract.environmentPairingResponse(data)
        return try JSONDecoding.decode(RemoteEnvironmentPairing.self, from: canonical)
    }

    /// Parent environment-bound WS upgrade ticket. Never proxied.
    func environmentWebSocketTicket(environmentId: String) async throws -> String {
        let data = try await requestData(
            path: try environmentPath(environmentId, suffix: "/websocket-ticket"),
            method: "POST"
        )
        let canonical = try GeneratedRemoteV3Contract.environmentWebSocketTicketResponse(data)
        let result = try JSONDecoding.decode(RemoteWebSocketTicketResult.self, from: canonical)
        return result.ticket
    }

    // MARK: - Explicit trust / upgrade / migration

    func probeEnvironmentTrust(environmentId: String) async throws -> RemoteEnvironmentTrustProbe {
        let data = try await requestData(
            path: try environmentPath(environmentId, suffix: "/trust-probe"),
            method: "POST"
        )
        let canonical = try GeneratedRemoteV3Contract.environmentTrustProbeResponse(data)
        return try JSONDecoding.decode(RemoteEnvironmentTrustProbe.self, from: canonical)
    }

    func acceptEnvironmentTrust(
        environmentId: String,
        expectedRevision: Int,
        fingerprint: String
    ) async throws -> RemoteEnvironmentProjection {
        let canonical = try GeneratedRemoteV3Contract.environmentTrustAcceptRequest(
            try JSONSerialization.data(withJSONObject: [
                "expectedRevision": expectedRevision,
                "fingerprint": fingerprint,
            ])
        )
        let data = try await requestData(
            path: try environmentPath(environmentId, suffix: "/trust-accept"),
            method: "POST",
            jsonBody: canonical
        )
        return try decodeEnvironmentResult(data)
    }

    func upgradeEnvironment(
        environmentId: String,
        expectedRevision: Int
    ) async throws -> RemoteEnvironmentProjection {
        // The upgrade route has its own generated request codec; validation must
        // not piggyback on the delete codec even though the shape matches today.
        let body = try GeneratedRemoteV3Contract.environmentUpgradeRequest(
            try JSONSerialization.data(withJSONObject: ["expectedRevision": expectedRevision])
        )
        let data = try await requestData(
            path: try environmentPath(environmentId, suffix: "/upgrade"),
            method: "POST",
            jsonBody: body
        )
        return try decodeEnvironmentResult(data)
    }

    func adoptLegacyEnvironment(
        environmentId: String,
        expectedRevision: Int,
        legacyConnectionId: String
    ) async throws -> RemoteEnvironmentProjection {
        let canonical = try GeneratedRemoteV3Contract.environmentAdoptLegacyRequest(
            try JSONSerialization.data(withJSONObject: [
                "expectedRevision": expectedRevision,
                "legacyConnectionId": legacyConnectionId,
            ])
        )
        let data = try await requestData(
            path: try environmentPath(environmentId, suffix: "/adopt-legacy"),
            method: "POST",
            jsonBody: canonical
        )
        return try decodeEnvironmentResult(data)
    }

    // MARK: - Internals

    private struct EnvironmentListEnvelope: Codable {
        var environments: [RemoteEnvironmentProjection]
    }

    /// Validated path segment: the generated path codec enforces the UUID
    /// grammar before the segment is percent-encoded.
    private func environmentPath(_ environmentId: String, suffix: String = "") throws -> String {
        // UUID shape gate before the generated path codec and before any dial:
        // a non-UUID segment is a traversal/shape attempt, never a lookup.
        guard UUID(uuidString: environmentId) != nil else {
            throw RemoteClientError.invalidResponse("Invalid environment id.")
        }
        let raw = try JSONSerialization.data(withJSONObject: ["environmentId": environmentId])
        let validated = try GeneratedRemoteV3Contract.validatedEnvironmentId(raw)
        return "/api/environments/\(Self.encodePathSegment(validated))\(suffix)"
    }

    private func revisionBody(_ expectedRevision: Int) throws -> Data {
        try GeneratedRemoteV3Contract.environmentExpectedRevisionRequest(
            try JSONSerialization.data(withJSONObject: ["expectedRevision": expectedRevision])
        )
    }

    private func decodeEnvironmentResult(_ data: Data) throws -> RemoteEnvironmentProjection {
        let canonical = try GeneratedRemoteV3Contract.environmentResultResponse(data)
        return try JSONDecoding.decode(EnvironmentEnvelope.self, from: canonical).environment
    }

    private struct EnvironmentEnvelope: Codable {
        var environment: RemoteEnvironmentProjection
    }
}
