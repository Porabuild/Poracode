import Foundation

/// Native String Catalog accessors for host-owned environments.
/// Never interpolate secrets or credentials.
enum EnvironmentStrings {
    static var title: String {
        String(localized: "environment.title", defaultValue: "Host-owned environments")
    }

    static var subtitle: String {
        String(
            localized: "environment.subtitle",
            defaultValue: "These environments run on this host and are reached through it."
        )
    }

    static var unavailableTitle: String {
        String(localized: "environment.unavailable.title", defaultValue: "Unavailable")
    }

    static var unavailableMessage: String {
        String(
            localized: "environment.unavailable.message",
            defaultValue: "This host does not offer host-owned environments."
        )
    }

    static var readOnlyMessage: String {
        String(
            localized: "environment.readonly.message",
            defaultValue: "This connection has read-only access to environments."
        )
    }

    static var emptyTitle: String {
        String(localized: "environment.empty.title", defaultValue: "No environments")
    }

    static var emptyMessage: String {
        String(
            localized: "environment.empty.message",
            defaultValue: "Create one on the host to run Poracode on another machine."
        )
    }

    static var addTitle: String {
        String(localized: "environment.add.title", defaultValue: "Create environment")
    }

    static var addLabel: String {
        String(localized: "environment.add.label", defaultValue: "Name")
    }

    static var addTarget: String {
        String(localized: "environment.add.target", defaultValue: "SSH target")
    }

    static var addTargetPlaceholder: String {
        String(localized: "environment.add.target.placeholder", defaultValue: "user@host")
    }

    static var addPort: String {
        String(localized: "environment.add.port", defaultValue: "SSH port")
    }

    static var addPortPlaceholder: String {
        String(localized: "environment.add.port.placeholder", defaultValue: "Default")
    }

    static var addCredential: String {
        String(localized: "environment.add.credential", defaultValue: "Credential reference")
    }

    static var addCredentialPlaceholder: String {
        String(localized: "environment.add.credential.placeholder", defaultValue: "Optional")
    }

    static var addAction: String {
        String(localized: "environment.add.action", defaultValue: "Create on host")
    }

    static var addConfirmTitle: String {
        String(localized: "environment.add.confirm.title", defaultValue: "Create on host?")
    }

    static var addConfirmMessage: String {
        String(
            localized: "environment.add.confirm.message",
            defaultValue:
                "This authorizes the host to install and run a Poracode server on the SSH target you entered. Continue only if you trust that machine."
        )
    }

    static var addRequired: String {
        String(
            localized: "environment.add.required",
            defaultValue: "A name and an SSH target are required."
        )
    }

    static var refresh: String {
        String(localized: "environment.action.refresh", defaultValue: "Refresh")
    }

    static var connect: String {
        String(localized: "environment.action.connect", defaultValue: "Connect")
    }

    static var disconnect: String {
        String(localized: "environment.action.disconnect", defaultValue: "Disconnect")
    }

    static var probeTrust: String {
        String(localized: "environment.action.probeTrust", defaultValue: "Check host key")
    }

    static var acceptTrust: String {
        String(localized: "environment.action.acceptTrust", defaultValue: "Accept host key")
    }

    static var upgrade: String {
        String(localized: "environment.action.upgrade", defaultValue: "Upgrade")
    }

    static var delete: String {
        String(localized: "environment.action.delete", defaultValue: "Delete environment")
    }

    static var pairDevice: String {
        String(localized: "environment.action.pairDevice", defaultValue: "Pair this device")
    }

    static var open: String {
        String(localized: "environment.action.open", defaultValue: "Use on this device")
    }

    static var forget: String {
        String(localized: "environment.action.forget", defaultValue: "Remove from this device")
    }

    static var configurationSection: String {
        String(localized: "environment.detail.section.configuration", defaultValue: "Configuration")
    }

    static var deviceSection: String {
        String(localized: "environment.detail.section.device", defaultValue: "This device")
    }

    static var actionsSection: String {
        String(localized: "environment.detail.section.actions", defaultValue: "Actions")
    }

    static var detailTarget: String {
        String(localized: "environment.detail.target", defaultValue: "Target")
    }

    static var detailPort: String {
        String(localized: "environment.detail.port", defaultValue: "Port")
    }

    static var detailState: String {
        String(localized: "environment.detail.state", defaultValue: "State")
    }

    static var detailTrust: String {
        String(localized: "environment.detail.trust", defaultValue: "Host key")
    }

    static var detailRevision: String {
        String(localized: "environment.detail.revision", defaultValue: "Revision")
    }

    static var paired: String {
        String(localized: "environment.detail.paired", defaultValue: "Paired on this device")
    }

    static var notPaired: String {
        String(
            localized: "environment.detail.notPaired",
            defaultValue: "Not paired on this device"
        )
    }

    static func stateLabel(_ state: String) -> String {
        switch state {
        case "disconnected":
            return String(localized: "environment.state.disconnected", defaultValue: "Disconnected")
        case "connecting":
            return String(localized: "environment.state.connecting", defaultValue: "Connecting")
        case "connected":
            return String(localized: "environment.state.connected", defaultValue: "Connected")
        case "error":
            return String(localized: "environment.state.error", defaultValue: "Error")
        case "credential-missing":
            return String(
                localized: "environment.state.credentialMissing",
                defaultValue: "Credential missing"
            )
        case "owner-unverified":
            return String(
                localized: "environment.state.ownerUnverified",
                defaultValue: "Owner not verified"
            )
        case "identity-changed":
            return String(
                localized: "environment.state.identityChanged",
                defaultValue: "Identity changed"
            )
        case "hostkey-mismatch":
            return String(
                localized: "environment.state.hostkeyMismatch",
                defaultValue: "Host key mismatch"
            )
        case "needs-repair":
            return String(
                localized: "environment.state.needsRepair",
                defaultValue: "Repair needed"
            )
        case "trust-required":
            return String(
                localized: "environment.state.trustRequired",
                defaultValue: "Host key check needed"
            )
        default:
            return state
        }
    }

    static func trustLabel(_ stateKey: String) -> String {
        switch stateKey {
        case "observed":
            return String(localized: "environment.trust.observed", defaultValue: "Observed")
        case "pinned":
            return String(localized: "environment.trust.pinned", defaultValue: "Pinned")
        default:
            return String(localized: "environment.trust.unknown", defaultValue: "Not verified")
        }
    }

    static var upgradeConfirmTitle: String {
        String(
            localized: "environment.confirm.upgrade.title",
            defaultValue: "Upgrade environment?"
        )
    }

    static var upgradeConfirmMessage: String {
        String(
            localized: "environment.confirm.upgrade.message",
            defaultValue:
                "The host stops the running environment, switches to the new runtime, and starts it again. Work may be interrupted."
        )
    }

    static var deleteConfirmTitle: String {
        String(
            localized: "environment.confirm.delete.title",
            defaultValue: "Delete this environment?"
        )
    }

    static var deleteConfirmMessage: String {
        String(
            localized: "environment.confirm.delete.message",
            defaultValue:
                "The environment is removed from the host. The local pairing on this device is not changed."
        )
    }

    static var trustAcceptTitle: String {
        String(localized: "environment.trust.accept.title", defaultValue: "Accept this host key?")
    }

    static var trustAcceptMessage: String {
        String(
            localized: "environment.trust.accept.message",
            defaultValue:
                "Compare this fingerprint with the target machine before accepting. Accepting pins the key and future mismatches fail closed."
        )
    }

    static var trustFingerprint: String {
        String(localized: "environment.trust.fingerprint", defaultValue: "Fingerprint")
    }

    static var trustKeyType: String {
        String(localized: "environment.trust.keyType", defaultValue: "Key type")
    }

    static var operationFailed: String {
        String(localized: "environment.error.generic", defaultValue: "The environment operation failed.")
    }

    static var working: String {
        String(localized: "environment.busy", defaultValue: "Working…")
    }

    static var environmentModeBadge: String {
        String(localized: "hosts.mode.environment", defaultValue: "Host-owned environment")
    }

    static var directModeBadge: String {
        String(localized: "hosts.mode.direct", defaultValue: "Device-local SSH")
    }

    static var hostRowEnvironments: String {
        String(localized: "hosts.detail.environments", defaultValue: "Host-owned environments")
    }

    // MARK: - Transport / repair messages

    /// Environment transport fail-closed: the parent pairing is missing.
    static var parentNotPairedMessage: String {
        String(
            localized: "environment.error.parentNotPaired",
            defaultValue: "The parent desktop for this environment is not paired."
        )
    }

    /// Trusted parent-origin marker proved the parent token was rejected.
    static var parentRepairMessage: String {
        String(
            localized: "environment.error.parentNeedsRepair",
            defaultValue: "The parent desktop needs to be paired again."
        )
    }

    /// No parent-origin proof: repair is needed but unattributed.
    static var environmentRepairMessage: String {
        String(
            localized: "environment.error.needsRepair",
            defaultValue: "This environment session needs repair. Pair it again."
        )
    }

    /// The proxied descriptor no longer matches the verified child identity.
    static var identityChangedMessage: String {
        String(
            localized: "environment.error.identityChanged",
            defaultValue:
                "The target identity changed. Remove the local connection and pair again."
        )
    }

    /// Environment upgrade is missing its paired parent ticket.
    static var parentTicketMissingMessage: String {
        String(
            localized: "environment.error.parentTicketMissing",
            defaultValue: "This environment upgrade is missing its parent ticket."
        )
    }

    /// Live descriptor fetch failed (retryable), distinct from a genuine
    /// capability absence.
    static var descriptorFetchFailureMessage: String {
        String(
            localized: "environment.error.descriptorFetch",
            defaultValue: "Couldn't load environment support from this host. Try again."
        )
    }

    static var pairingParentNotPaired: String {
        String(
            localized: "environment.pairing.parentNotPaired",
            defaultValue: "The parent desktop is not paired on this device."
        )
    }

    static var pairingSecondHopRefused: String {
        String(
            localized: "environment.pairing.secondHopRefused",
            defaultValue: "Environments cannot be paired through another environment."
        )
    }

    /// Localized label for one closed host `lastError.code`
    /// (`environmentPublicErrorCodeSchema`). Unknown codes fall back to the
    /// server's diagnostic message rather than inventing a meaning.
    static func publicErrorLabel(code: String, fallback: String) -> String {
        let localized: String? = switch code {
        case "environment/not-found":
            String(localized: "environment.lastError.notFound", defaultValue: "Environment not found")
        case "environment/revision-conflict":
            String(
                localized: "environment.lastError.revisionConflict",
                defaultValue: "A newer change was applied first"
            )
        case "environment/store-busy":
            String(
                localized: "environment.lastError.storeBusy",
                defaultValue: "The host's environment store is busy"
            )
        case "environment/store-limit":
            String(
                localized: "environment.lastError.storeLimit",
                defaultValue: "The host reached its environment limit"
            )
        case "environment/store-unavailable":
            String(
                localized: "environment.lastError.storeUnavailable",
                defaultValue: "The host's environment store is unavailable"
            )
        case "environment/invalid-input":
            String(
                localized: "environment.lastError.invalidInput",
                defaultValue: "Invalid environment settings"
            )
        case "environment/not-connected":
            String(
                localized: "environment.lastError.notConnected",
                defaultValue: "The environment is not connected"
            )
        case "environment/trust-required":
            String(
                localized: "environment.lastError.trustRequired",
                defaultValue: "The host key must be verified"
            )
        case "environment/trust-changed":
            String(
                localized: "environment.lastError.trustChanged",
                defaultValue: "The host key changed"
            )
        case "environment/trust-mismatch":
            String(
                localized: "environment.lastError.trustMismatch",
                defaultValue: "The host key did not match"
            )
        case "environment/hostkey-mismatch":
            String(
                localized: "environment.lastError.hostkeyMismatch",
                defaultValue: "Host key mismatch"
            )
        case "environment/identity-changed":
            String(
                localized: "environment.lastError.identityChanged",
                defaultValue: "The environment identity changed"
            )
        case "environment/credential-missing":
            String(
                localized: "environment.lastError.credentialMissing",
                defaultValue: "The SSH credential is missing"
            )
        case "environment/owner-unverified":
            String(
                localized: "environment.lastError.ownerUnverified",
                defaultValue: "The environment owner is not verified"
            )
        case "environment/owner-unresponsive":
            String(
                localized: "environment.lastError.ownerUnresponsive",
                defaultValue: "The environment owner is not responding"
            )
        case "environment/owner-incompatible":
            String(
                localized: "environment.lastError.ownerIncompatible",
                defaultValue: "The host runtime is incompatible"
            )
        case "environment/owner-busy":
            String(
                localized: "environment.lastError.ownerBusy",
                defaultValue: "The environment owner is busy"
            )
        case "environment/owner-conflict":
            String(
                localized: "environment.lastError.ownerConflict",
                defaultValue: "The environment is in use"
            )
        case "environment/launch-failed":
            String(
                localized: "environment.lastError.launchFailed",
                defaultValue: "The environment could not start"
            )
        case "environment/upgrade-unavailable":
            String(
                localized: "environment.lastError.upgradeUnavailable",
                defaultValue: "Upgrade is not available"
            )
        case "environment/upgrade-refused":
            String(
                localized: "environment.lastError.upgradeRefused",
                defaultValue: "Upgrade was refused"
            )
        case "environment/transport-error":
            String(
                localized: "environment.lastError.transportError",
                defaultValue: "A transport error occurred"
            )
        case "environment/cancelled":
            String(
                localized: "environment.lastError.cancelled",
                defaultValue: "The operation was cancelled"
            )
        case "environment/internal-error":
            String(
                localized: "environment.lastError.internalError",
                defaultValue: "An internal error occurred"
            )
        case "environment/not-authorized":
            String(
                localized: "environment.lastError.notAuthorized",
                defaultValue: "Not authorized"
            )
        default:
            nil
        }
        guard let localized else {
            return fallback.isEmpty ? operationFailed : fallback
        }
        return localized
    }
}
