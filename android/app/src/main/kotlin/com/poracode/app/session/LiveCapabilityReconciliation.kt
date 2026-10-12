package com.poracode.app.session

import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteEventSocket

/**
 * One installed socket's capability-declaration reconciliation.
 *
 * An Online descriptor can advertise a capability whose declaration the real
 * upgrade omitted (a failed preflight is not an answer). Both declarations are
 * applied to the same client the descriptor came from and are issued **at most
 * once per installed socket**, so a repeated same-capability descriptor can
 * never reconnect-loop.
 *
 * The caller runs the existing authoritative barrier when this returns a
 * reason: the declaration change reconnects through the transactional
 * shell+history (bounded catalog shell included) path rather than a bare
 * reconnect at an advanced cursor. The returned reason keeps the B1 notice
 * text exactly when a notice declaration is the one that fired.
 */
internal class LiveCapabilityReconciliation(
    private val client: RemoteApiGateway,
    private val boundedCatalogReady: () -> Boolean,
) {
    private var noticesIssued = false
    private var catalogIssued = false

    /**
     * Applies any newly possible declaration and returns the barrier reason
     * when one must run, or null when nothing changed. Caller holds the
     * capability guard and has already verified socket identity + epoch, so a
     * superseded socket can never reach this method.
     */
    fun reconcile(
        capabilities: RemoteEnvironmentDescriptor.Capabilities?,
        socket: RemoteEventSocket,
    ): String? {
        var reason: String? = null
        val noticesCapable = capabilities?.runtimeHistoryNotices?.versions
            ?.contains(RemoteEnvironmentDescriptor.RUNTIME_HISTORY_NOTICES_VERSION) == true
        if (noticesCapable && socket.upgradeDeclaredNotices == false && !noticesIssued) {
            client.declareRuntimeHistoryNotices(true)
            noticesIssued = true
            reason = NOTICES_REASON
        }
        val catalogCapable = capabilities?.boundedCatalogChanges?.versions
            ?.contains(RemoteEnvironmentDescriptor.BOUNDED_CATALOG_CHANGES_VERSION) == true
        if (catalogCapable && socket.upgradeDeclaredCatalogChanges == false &&
            boundedCatalogReady() && !catalogIssued
        ) {
            client.declareBoundedCatalogChanges(true)
            catalogIssued = true
            if (reason == null) reason = CATALOG_REASON
        }
        return reason
    }

    internal companion object {
        /** Frozen B1 reason; the notice reconcile text must not change. */
        const val NOTICES_REASON = "notices_capability_declared"

        /** The shared barrier, issued for a late bounded catalog-change declaration. */
        const val CATALOG_REASON = "bounded_catalog_changes_declared"
    }
}
