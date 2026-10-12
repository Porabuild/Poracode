import Foundation

/// MainActor registry mapping an environment record's proxy endpoint to its
/// parent-bound transport context.
///
/// `SessionDependencies.makeAPI(endpoint:token:)` resolves the endpoint here,
/// so every transport built for an environment record — HTTP, images, rich
/// chat raw bodies, and both sockets — carries the parent authority. An
/// endpoint known to be an environment proxy with no paired parent resolves to
/// a fail-closed context (no dial).
@MainActor
final class EnvironmentConnectionRegistry {
    static let shared = EnvironmentConnectionRegistry()

    private var contexts: [String: RemoteEnvironmentContext] = [:]
    private var environmentEndpoints: Set<String> = []

    private let authorityStore: EnvironmentParentAuthorityStore

    init(authorityStore: EnvironmentParentAuthorityStore = .shared) {
        self.authorityStore = authorityStore
    }

    /// Register (or refresh) the context for one environment record. `parent`
    /// must be a direct pairing; nil, or a parent that is itself an
    /// environment, registers a fail-closed context (no dial, no header).
    func register(record: HostRecord, parent: HostRecord?) {
        guard let reference = record.environment else { return }
        let endpoint = record.httpBaseURL
        guard !endpoint.isEmpty else { return }
        records[record.connectionId] = record
        environmentEndpoints.insert(endpoint)
        if parent?.isDirectConnection == true {
            contexts[endpoint] = makeContext(reference: reference)
        } else {
            contexts[endpoint] = .parentMissing(environmentId: reference.environmentId)
        }
    }

    /// Context for a transport endpoint, or nil when this endpoint is not an
    /// environment proxy. Known environment endpoints always resolve to a
    /// context so a missing parent fails closed rather than dialing bare.
    func context(forEndpoint endpoint: String) -> RemoteEnvironmentContext? {
        contexts[endpoint]
    }

    func isEnvironmentEndpoint(_ endpoint: String) -> Bool {
        environmentEndpoints.contains(endpoint)
    }

    func remove(connectionId: ClientConnectionID) {
        guard let record = records[connectionId] else { return }
        records.removeValue(forKey: connectionId)
        environmentEndpoints.remove(record.httpBaseURL)
        contexts.removeValue(forKey: record.httpBaseURL)
    }

    func removeAll() {
        contexts.removeAll()
        environmentEndpoints.removeAll()
        records.removeAll()
    }

    /// Drop every registered context and endpoint. Used by the explicit local
    /// repair path, which clears all host records in the same operation.
    func clearAll() {
        removeAll()
    }

    /// Local connection ids currently registered as environments.
    var registeredConnectionIds: Set<ClientConnectionID> {
        Set(records.keys)
    }

    private func makeContext(reference: EnvironmentHostReference) -> RemoteEnvironmentContext {
        authorityStore.makeContext(reference: reference)
    }

    // Retained so endpoint cleanup does not depend on an in-flight snapshot.
    private var records: [ClientConnectionID: HostRecord] = [:]
}
