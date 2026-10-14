import Foundation

/// Bounded environment client error codes and repair attribution.
///
/// Native ships without a refresh grant (ADR §13): a 401 is never silently
/// re-paired or refreshed. The parent proxy marks its own authorization
/// rejections — the auth-step 401s and 403s it answers before any child dial —
/// with `x-poracode-environment-auth-authority: parent`; only a marker-proven
/// rejection may name the parent as the repair authority. Any other
/// authorization failure fails closed as an unattributed environment repair —
/// the client never claims a parent or child cause it cannot prove.
enum RemoteEnvironmentErrorCode {
    static let parentNotPaired = "environment_parent_not_paired"
    static let parentNeedsRepair = "environment_parent_needs_repair"
    static let needsRepair = "environment_needs_repair"
    static let parentTicketMissing = "environment_parent_ticket_missing"
    static let identityChanged = "environment_identity_changed"
}

/// Single construction point for every environment transport error, so the
/// user-visible wording is localized once.
enum EnvironmentTransportError {
    static func parentNotPaired() -> RemoteClientError {
        RemoteClientError(
            message: EnvironmentStrings.parentNotPairedMessage,
            status: 401,
            code: RemoteEnvironmentErrorCode.parentNotPaired
        )
    }

    static func parentNeedsRepair(evidence: [String: String]? = nil) -> RemoteClientError {
        RemoteClientError(
            message: EnvironmentStrings.parentRepairMessage,
            status: 401,
            code: RemoteEnvironmentErrorCode.parentNeedsRepair,
            responseEvidence: evidence
        )
    }

    static func needsRepair(evidence: [String: String]? = nil) -> RemoteClientError {
        RemoteClientError(
            message: EnvironmentStrings.environmentRepairMessage,
            status: 401,
            code: RemoteEnvironmentErrorCode.needsRepair,
            responseEvidence: evidence
        )
    }

    static func identityChanged() -> RemoteClientError {
        RemoteClientError(
            message: EnvironmentStrings.identityChangedMessage,
            status: 409,
            code: RemoteEnvironmentErrorCode.identityChanged
        )
    }

    static func parentTicketMissing() -> RemoteClientError {
        RemoteClientError(
            message: EnvironmentStrings.parentTicketMissingMessage,
            status: 401,
            code: RemoteEnvironmentErrorCode.parentTicketMissing
        )
    }
}

extension RemoteClientError {
    /// Deterministic 401/403 classification shared by every environment-bound
    /// transport (JSON and raw bodies).
    ///
    /// Native has no refresh grant (ADR §13), so no recovery is attempted. A
    /// trusted `x-poracode-environment-auth-authority: parent` marker is the
    /// only proof that the parent rejected the request pre-dial; the proxy
    /// marks both its own auth-step 401s and its auth-step 403s (missing
    /// parent scope), so the marker on either status becomes the typed parent
    /// repair. Without it, a 401 on an authorized environment dispatch is
    /// reported as an unattributed environment repair — never as a parent
    /// failure the client cannot prove — and any other failure, including a
    /// markerless 403 (CORS/host/child), keeps its original code and
    /// evidence. Non-environment (direct) dispatches are never reclassified.
    static func environmentAwareFailure(
        message: String,
        status: Int,
        code: String,
        evidence: [String: String]?,
        environmentBound: Bool,
        authorized: Bool
    ) -> RemoteClientError {
        let parentProven = evidence?[ProtocolConstants.environmentAuthAuthorityHeader]
            == ProtocolConstants.environmentAuthAuthorityParent
        guard environmentBound, status == 401 || (status == 403 && parentProven),
            authorized || parentProven
        else {
            return RemoteClientError(
                message: message,
                status: status,
                code: code,
                responseEvidence: evidence
            )
        }
        if parentProven {
            return EnvironmentTransportError.parentNeedsRepair(evidence: evidence)
        }
        return EnvironmentTransportError.needsRepair(evidence: evidence)
    }
}

/// Repair authority the client can prove for a failed environment session.
enum EnvironmentRepairAuthority: Sendable, Equatable {
    /// The trusted parent-origin response marker proved the parent rejected
    /// this request before the child dial.
    case parent
    /// No marker (or no parent-origin proof): a repair is needed but the
    /// client does not attribute it to a specific authority.
    case unattributed
}

extension RemoteClientError {
    /// Parent-origin proof captured from an allowlisted response header.
    var environmentAuthAuthority: String? {
        responseEvidence?[ProtocolConstants.environmentAuthAuthorityHeader]
    }

    var environmentRepairAuthority: EnvironmentRepairAuthority? {
        switch code {
        case RemoteEnvironmentErrorCode.parentNeedsRepair: return .parent
        case RemoteEnvironmentErrorCode.needsRepair: return .unattributed
        default: return nil
        }
    }

    /// Explicit repair message for environment sessions. Nil for every other
    /// error so callers keep their existing wording.
    var environmentRepairMessage: String? {
        switch environmentRepairAuthority {
        case .parent:
            return EnvironmentStrings.parentRepairMessage
        case .unattributed:
            return EnvironmentStrings.environmentRepairMessage
        case .none:
            return nil
        }
    }

    /// Terminal identity refusal: the proxied descriptor no longer matches the
    /// verified child identity recorded at pairing. Never retried as a generic
    /// network error; the local connection must be re-paired.
    var isEnvironmentIdentityChanged: Bool {
        code == RemoteEnvironmentErrorCode.identityChanged
    }
}

/// Granted-scope gates for the environment management surface (ADR §6).
/// Reuses the existing protocol scopes; no new scope is ever requested.
struct EnvironmentScopeCapabilities: Sendable, Equatable {
    var canRead: Bool
    var canUse: Bool
    var canManage: Bool

    static let none = EnvironmentScopeCapabilities(canRead: false, canUse: false, canManage: false)

    static func from(scopes: [String]) -> EnvironmentScopeCapabilities {
        let set = Set(RemoteAccessScopes.filterKnown(scopes))
        let read = set.contains("session:read")
        let use = set.contains("session:operate") && set.contains("ports:forward")
        let manage = use && set.contains("projects:manage")
        return EnvironmentScopeCapabilities(canRead: read, canUse: use, canManage: manage)
    }
}
