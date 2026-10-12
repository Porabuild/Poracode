import Foundation

/// Removal-time and retry-time custody rules for the bounded unregister
/// outbox.
///
/// One cohesive owner of two decisions that must agree:
///
/// - what a removal must snapshot *before* the catalog deletes it (the direct
///   record, and for a direct parent every locally paired environment, each
///   with its own existing child grant and the parent grant read from the
///   parent's vault slot while it still exists), and
/// - what one authenticated cleanup attempt means for the entry (a confirmed
///   success concludes it; an environment-custody refusal never does).
///
/// It holds no state, dispatches nothing, and never invents a credential: a
/// record whose grant is unreadable contributes no target. The explicit
/// catalog/state dependencies keep the controller on dispatch and
/// reconciliation without a second owner of the removal rules.
struct PushUnregisterRemovalPolicy: Sendable {
    struct Target: Sendable {
        var record: HostRecord
        var accessToken: String
        var parentAuthority: PushUnregisterParentAuthority?
        var cascaded = false
    }

    let catalog: HostCatalog
    let stateStore: PushClientStateStore

    /// Durable removal targets for one record. A direct parent cascades every
    /// locally paired environment record; each dependent gets its own existing
    /// child grant plus the parent grant read from the parent's vault slot (the
    /// same authority the removal caller already passed). An environment record
    /// resolves only its own parent grant; a second hop does not exist by
    /// construction. A dependent without a readable child grant contributes no
    /// target and no invented credential; its push state is dropped with the
    /// record.
    func targets(record: HostRecord, accessToken: String) async -> [Target] {
        guard record.isDirectConnection else {
            return [
                Target(
                    record: record,
                    accessToken: accessToken,
                    parentAuthority: await captureParentAuthority(for: record)
                )
            ]
        }
        var targets = [Target(record: record, accessToken: accessToken, parentAuthority: nil)]
        let dependents = (try? await catalog.snapshot())?.hosts.filter {
            $0.environment?.parentConnectionId == record.connectionId
        } ?? []
        guard !dependents.isEmpty else { return targets }
        let parentToken = try? await catalog.token(for: record.connectionId)
        for dependent in dependents {
            guard let childToken = try? await catalog.token(for: dependent.connectionId),
                !childToken.isEmpty
            else {
                try? await stateStore.removeHost(dependent.connectionId)
                continue
            }
            let authority = parentToken.flatMap { token -> PushUnregisterParentAuthority? in
                guard !token.isEmpty else { return nil }
                // Bound to the dependent's own dispatch endpoint (its proxy URL).
                return PushUnregisterParentAuthority(
                    endpoint: dependent.httpBaseURL,
                    accessToken: token
                )
            }
            targets.append(
                Target(
                    record: dependent,
                    accessToken: childToken,
                    parentAuthority: authority,
                    cascaded: true
                )
            )
        }
        return targets
    }

    /// Existing parent authority for one environment record, read from the
    /// parent record's vault slot while it still exists. Nil for a direct record
    /// or a missing/unreadable parent grant — credentials are never invented.
    func captureParentAuthority(for record: HostRecord) async -> PushUnregisterParentAuthority? {
        guard let reference = record.environment else { return nil }
        guard let token = try? await catalog.token(for: reference.parentConnectionId),
            !token.isEmpty
        else { return nil }
        return PushUnregisterParentAuthority(
            endpoint: record.httpBaseURL,
            accessToken: token
        )
    }

    /// True when a genuine 401/403 auth refusal concludes cleanup. Only a
    /// direct-host route keeps its existing retirement; every environment
    /// custody route is retained (see `isEnvironmentCustody`).
    static func retiresOnAuthRefusal(_ entry: PushUnregisterOutbox.Entry) -> Bool {
        !isEnvironmentCustody(entry)
    }

    /// True when the entry's cleanup travels through a parent proxy: a
    /// recorded environment route, a captured (possibly unbound) parent
    /// authority, or a proxy-shaped endpoint that lost its recorded tuple to a
    /// corrupt/legacy write. The protocol carries no trusted child-origin
    /// marker — the parent marker proves only the parent's own pre-dial
    /// rejection — so an unattributed 401/403 on any of these can be the
    /// parent, a local fail-closed resolution, a CORS/host refusal, or the
    /// child, and the client must not delete the only cleanup record on a
    /// cause it cannot prove.
    static func isEnvironmentCustody(_ entry: PushUnregisterOutbox.Entry) -> Bool {
        entry.isEnvironmentBound || EnvironmentEndpoints.isProxyEndpoint(entry.endpoint)
    }
}
