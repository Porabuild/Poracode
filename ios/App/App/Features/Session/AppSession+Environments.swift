import Foundation

/// Locally pairing a host-owned environment through its parent proxy.
///
/// Two authorities stay distinct:
/// - the parent management client (`pairEnvironment`) mints the one-time child
///   credential and is bound to the parent's own endpoint/token;
/// - the environment client talks through the parent proxy prefix and carries
///   the parent header on the child token exchange.
///
/// The child certificate is never registered as a pin: the environment
/// endpoint is the parent host:port, so the parent pin applies automatically.
extension AppSession {
    enum EnvironmentPairingFailure: LocalizedError, Equatable {
        case parentNotPaired
        case secondHopRefused
        case identityChanged

        var errorDescription: String? {
            switch self {
            case .parentNotPaired:
                return EnvironmentStrings.pairingParentNotPaired
            case .secondHopRefused:
                return EnvironmentStrings.pairingSecondHopRefused
            case .identityChanged:
                return EnvironmentStrings.identityChangedMessage
            }
        }
    }

    /// Pair (or re-pair) one environment of a direct parent host on this
    /// device. Returns the local environment connection id.
    ///
    /// `environmentSession` is a test seam (URLProtocol-backed session);
    /// production uses the default redirect-denying sessions.
    @discardableResult
    func pairEnvironmentOnDevice(
        parentConnectionId: ClientConnectionID,
        environmentId: String,
        environmentSession: URLSession? = nil
    ) async throws -> ClientConnectionID {
        guard let parent = state.hosts.first(where: { $0.connectionId == parentConnectionId }),
              parent.isDirectConnection
        else {
            throw state.hosts.contains(where: { $0.connectionId == parentConnectionId })
                ? EnvironmentPairingFailure.secondHopRefused
                : EnvironmentPairingFailure.parentNotPaired
        }
        guard let parentToken = try? await deps.hostCatalog.token(for: parentConnectionId),
              !parentToken.isEmpty
        else {
            throw EnvironmentPairingFailure.parentNotPaired
        }

        let parentClient = RemoteAPIClient(
            endpoint: parent.httpBaseURL,
            accessToken: parentToken,
            session: environmentSession
        )
        let pairing = try await parentClient.pairEnvironment(environmentId: environmentId)
        guard pairing.environmentId == environmentId else {
            throw EnvironmentPairingFailure.identityChanged
        }

        let proxyURL = try EnvironmentEndpoints.proxyURL(
            parentBaseURL: parent.httpBaseURL,
            environmentId: environmentId
        )
        let authorityStore = EnvironmentParentAuthorityStore.shared
        await authorityStore.noteParentToken(parentToken, for: parentConnectionId)
        let reference = EnvironmentHostReference(
            parentConnectionId: parentConnectionId,
            environmentId: environmentId,
            childDesktopId: pairing.childDesktopId
        )
        let context = authorityStore.makeContext(reference: reference)
        let environmentClient = RemoteAPIClient(
            endpoint: proxyURL,
            accessToken: nil,
            session: environmentSession,
            environment: context
        )

        // The descriptor through the proxy carries the child identity; a
        // mismatch refuses before any durable write.
        let descriptor = try await environmentClient.environment()
        guard descriptor.desktopId == pairing.childDesktopId else {
            throw EnvironmentPairingFailure.identityChanged
        }
        // The child's own descriptor is the live gate for pairing it as a
        // device-local host; the parent's capability gate already ran in the
        // management surface. No nested-environment capability is required
        // here — a second proxied hop is refused by construction.

        let requestedScopes = try RemoteAccessScopes.scopesToRequest(
            advertised: descriptor.auth.scopes
        )
        let tokenResult = try await environmentClient.exchangePairingCredential(
            credential: pairing.pairingCredential,
            scopes: requestedScopes
        )
        await environmentClient.setAccessToken(tokenResult.accessToken)

        // Strict describe: a failed read must not erase capabilities already
        // known for an existing in-place re-pair of the same verified child
        // identity, while a *successful* declaration — including an empty one —
        // is authoritative and replaces the recorded set.
        let previouslyKnownCapabilities = state.hosts.first(where: {
            $0.environment?.parentConnectionId == parentConnectionId
                && $0.environment?.environmentId == environmentId
                && $0.environment?.childDesktopId == pairing.childDesktopId
        })?.hostCapabilities
        let childCapabilities: HostServiceCapabilities
        do {
            childCapabilities = try await environmentClient.fetchHostCapabilities()
        } catch {
            childCapabilities = previouslyKnownCapabilities ?? .unknown
        }
        let grantedScopes = RemoteAccessScopes.filterKnown(tokenResult.scopes)
        let profile = ConnectionProfile(
            desktopId: descriptor.desktopId,
            label: descriptor.label,
            httpBaseURL: proxyURL,
            wsBaseURL: (try? EnvironmentEndpoints.proxyWebSocketURL(
                parentBaseURL: parent.httpBaseURL,
                environmentId: environmentId
            )) ?? descriptor.endpoints.wsBaseUrl,
            appVersion: descriptor.appVersion,
            hostMode: descriptor.hostMode,
            platform: descriptor.platform,
            scopes: grantedScopes,
            tokenExpiresAt: tokenResult.expiresAt,
            pairedAt: Date(),
            protocolVersion: ProtocolConstants.remoteProtocolVersion,
            // Never a child fingerprint: the proxy endpoint is the parent
            // host:port and the parent pin already governs it.
            certFingerprint: nil,
            hostCapabilities: childCapabilities
        )
        let record = HostRecord(
            connectionId: ClientConnectionID(),
            profile: profile,
            environment: reference
        )

        let began = state.operationOwner.beginMetadata(.pair)
        let activated: Bool
        do {
            activated = try await deps.hostCatalog.activate(
                id: began.operationId,
                kind: .addEnvironment
            )
        } catch {
            throw EnvironmentPairingFailure.parentNotPaired
        }
        guard activated else { throw EnvironmentPairingFailure.parentNotPaired }
        let mutation = try await deps.hostCatalog.pairAddEnvironment(
            record: record,
            token: tokenResult.accessToken,
            owning: began.operationId
        )
        guard mutation.didApply else { throw EnvironmentPairingFailure.parentNotPaired }

        let snapshot = try await deps.hostCatalog.snapshot()
        applyCatalogSnapshot(snapshot)
        guard let committed = snapshot.hosts.first(where: {
            $0.environment?.parentConnectionId == parentConnectionId
                && $0.environment?.environmentId == environmentId
        }) else {
            throw EnvironmentPairingFailure.identityChanged
        }
        return committed.connectionId
    }

    /// Remove the local pairing of an environment without touching the host
    /// registry or the parent pairing.
    func unpairEnvironmentOnDevice(connectionId: ClientConnectionID) async {
        guard let record = state.hosts.first(where: { $0.connectionId == connectionId }),
              record.environment != nil
        else { return }
        await removeHost(connectionId)
    }
}
