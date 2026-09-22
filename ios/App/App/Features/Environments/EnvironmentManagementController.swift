import Foundation
import Observation

/// MainActor management state for one bound host's environment registry.
///
/// The bound host is the management authority: a direct host manages its own
/// registry; an environment bound through the parent proxy manages the child
/// registry through one hop under the child grant. Creating a second proxied
/// hop is refused by the local pairing flow, never by blanket-throwing the API.
@MainActor
@Observable
final class EnvironmentManagementController {
    private let session: AppSession
    let boundConnectionId: ClientConnectionID

    private(set) var availability: Availability = .unknown
    private(set) var loadState: SessionLoadState = .idle
    private(set) var environments: [RemoteEnvironmentProjection] = []
    private(set) var busyEnvironmentIds: Set<String> = []
    private(set) var notice: String?
    private(set) var failure: String?
    private(set) var trustProbe: TrustProbe?

    struct TrustProbe: Equatable {
        let environmentId: String
        let fingerprint: String
        let keyType: String
    }

    enum Availability: Equatable {
        case unknown
        case available
        /// The host answered and does not offer host-owned environments (or
        /// this connection may not read them): not retryable by itself.
        case unavailable(String)
        /// The live descriptor could not be read: retryable, and never
        /// presented as a capability absence.
        case failed(String)
    }

    init(session: AppSession, boundConnectionId: ClientConnectionID) {
        self.session = session
        self.boundConnectionId = boundConnectionId
    }

    var boundRecord: HostRecord? {
        session.hosts.first { $0.connectionId == boundConnectionId }
    }

    /// The bound host's own scopes gate every action (ADR §6).
    var capabilities: EnvironmentScopeCapabilities {
        EnvironmentScopeCapabilities.from(scopes: boundRecord?.scopes ?? [])
    }

    /// A direct host can pair environments onto this device. An environment
    /// bound through a proxy is management-only: pairing from it would invent a
    /// second proxied hop.
    var canPairOnDevice: Bool {
        boundRecord?.isDirectConnection == true
    }

    var parentRecord: HostRecord? {
        guard let reference = boundRecord?.environment else { return nil }
        return session.hosts.first { $0.connectionId == reference.parentConnectionId }
    }

    func localRecord(for environmentId: String) -> HostRecord? {
        session.hosts.first { record in
            guard let bound = boundRecord, let reference = record.environment else {
                return false
            }
            if bound.isDirectConnection {
                return reference.parentConnectionId == bound.connectionId
                    && reference.environmentId == environmentId
            }
            return reference.environmentId == environmentId
                && reference.parentConnectionId == bound.environment?.parentConnectionId
        }
    }

    func activate() async {
        guard boundRecord != nil else {
            availability = .unavailable(EnvironmentStrings.unavailableMessage)
            loadState = .failed(EnvironmentStrings.unavailableMessage)
            return
        }
        guard capabilities.canRead else {
            availability = .unavailable(EnvironmentStrings.readOnlyMessage)
            loadState = .failed(EnvironmentStrings.readOnlyMessage)
            return
        }
        guard let client = await boundClient() else {
            availability = .failed(EnvironmentStrings.descriptorFetchFailureMessage)
            loadState = .failed(EnvironmentStrings.descriptorFetchFailureMessage)
            failure = EnvironmentStrings.descriptorFetchFailureMessage
            return
        }
        do {
            let descriptor = try await client.environment()
            guard descriptor.capabilities?.sshEnvironments?.versions.contains(1) == true else {
                // The fetch succeeded and the capability is genuinely absent:
                // a reachable live gate, not a transient error.
                availability = .unavailable(EnvironmentStrings.unavailableMessage)
                loadState = .failed(EnvironmentStrings.unavailableMessage)
                return
            }
            availability = .available
            await reload(with: client)
        } catch {
            // Descriptor fetch failure is retryable and must never be
            // presented as capability absence.
            availability = .failed(EnvironmentStrings.descriptorFetchFailureMessage)
            loadState = .failed(errorMessage(error))
            failure = errorMessage(error)
        }
    }

    func refresh() async {
        guard availability == .available, let client = await boundClient() else { return }
        await reload(with: client)
    }

    func create(
        label: String,
        target: String,
        port: Int?,
        credentialRef: String?
    ) async -> Bool {
        guard capabilities.canManage else { return false }
        guard let client = await boundClient() else { return false }
        failure = nil
        do {
            _ = try await client.createEnvironment(
                RemoteEnvironmentCreateRequest(
                    label: label,
                    target: target,
                    port: port,
                    credentialRef: credentialRef,
                    desired: .enabled,
                    legacyConnectionId: nil
                )
            )
            await reload(with: client)
            return true
        } catch {
            failure = errorMessage(error)
            return false
        }
    }

    func connect(_ environmentId: String) async {
        await run(environmentId) { client in
            _ = try await client.connectEnvironment(environmentId: environmentId)
        }
    }

    func disconnect(_ environmentId: String) async {
        await run(environmentId) { client in
            _ = try await client.disconnectEnvironment(environmentId: environmentId)
        }
    }

    func probeTrust(_ environmentId: String) async {
        guard capabilities.canManage else { return }
        guard let client = await boundClient() else { return }
        failure = nil
        do {
            let probe = try await client.probeEnvironmentTrust(environmentId: environmentId)
            trustProbe = TrustProbe(
                environmentId: environmentId,
                fingerprint: probe.fingerprint,
                keyType: probe.keyType
            )
        } catch {
            failure = errorMessage(error)
        }
    }

    func clearTrustProbe() {
        trustProbe = nil
    }

    func acceptTrust(_ environmentId: String) async {
        guard capabilities.canManage,
              let revision = revision(for: environmentId),
              let probe = trustProbe,
              probe.environmentId == environmentId
        else { return }
        await run(environmentId) { client in
            _ = try await client.acceptEnvironmentTrust(
                environmentId: environmentId,
                expectedRevision: revision,
                fingerprint: probe.fingerprint
            )
        }
        trustProbe = nil
    }

    func upgrade(_ environmentId: String) async {
        guard capabilities.canManage, let revision = revision(for: environmentId) else { return }
        await run(environmentId) { client in
            _ = try await client.upgradeEnvironment(
                environmentId: environmentId,
                expectedRevision: revision
            )
        }
    }

    func delete(_ environmentId: String) async {
        guard capabilities.canManage, let revision = revision(for: environmentId) else { return }
        await run(environmentId) { client in
            try await client.deleteEnvironment(
                environmentId: environmentId,
                expectedRevision: revision
            )
        }
    }

    /// Pair this device with one environment of a direct parent host.
    @discardableResult
    func pairOnDevice(_ environmentId: String) async -> ClientConnectionID? {
        guard canPairOnDevice else { return nil }
        failure = nil
        do {
            return try await session.pairEnvironmentOnDevice(
                parentConnectionId: boundConnectionId,
                environmentId: environmentId
            )
        } catch {
            failure = errorMessage(error)
            return nil
        }
    }

    func openLocal(_ connectionId: ClientConnectionID) async {
        await session.switchHost(connectionId)
    }

    func forgetLocal(_ connectionId: ClientConnectionID) async {
        await session.unpairEnvironmentOnDevice(connectionId: connectionId)
    }

    func clearFeedback() {
        failure = nil
        notice = nil
    }

    // MARK: - Internals

    private func reload(with client: RemoteAPIClient) async {
        loadState = .loading
        do {
            let list = try await client.listEnvironments()
            environments = list
            loadState = list.isEmpty ? .empty : .loaded
        } catch {
            loadState = .failed(errorMessage(error))
            failure = errorMessage(error)
        }
    }

    private func run(
        _ environmentId: String,
        _ operation: (RemoteAPIClient) async throws -> Void
    ) async {
        guard !busyEnvironmentIds.contains(environmentId) else { return }
        busyEnvironmentIds.insert(environmentId)
        defer { busyEnvironmentIds.remove(environmentId) }
        failure = nil
        guard let client = await boundClient() else { return }
        do {
            try await operation(client)
            await reload(with: client)
        } catch {
            failure = errorMessage(error)
        }
    }

    private func revision(for environmentId: String) -> Int? {
        environments.first { $0.environmentId == environmentId }?.revision
    }

    /// The bound management client. An environment-bound host uses its proxy
    /// endpoint plus the child grant and the registry's parent context
    /// (one-hop child registry management); a direct host uses its own
    /// endpoint and token. A missing parent fails closed.
    private func boundClient() async -> RemoteAPIClient? {
        guard let record = boundRecord,
              let token = try? await session.deps.hostCatalog.token(for: record.connectionId),
              !token.isEmpty
        else {
            return nil
        }
        let environment = record.isDirectConnection
            ? nil
            : EnvironmentConnectionRegistry.shared.context(forEndpoint: record.httpBaseURL)
        if !record.isDirectConnection, environment == nil { return nil }
        return RemoteAPIClient(
            endpoint: record.httpBaseURL,
            accessToken: token,
            environment: environment
        )
    }

    private func errorMessage(_ error: Error) -> String {
        if let clientError = error as? RemoteClientError {
            return clientError.environmentRepairMessage ?? clientError.localizedDescription
        }
        return error.localizedDescription
    }
}
