package com.poracode.app.transport

import com.poracode.app.model.RemoteBoundedCatalogChangeCodes
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteHistoryNoticeCodes
import okhttp3.HttpUrl

/**
 * Per-client upgrade-declaration state, observed from this client's own
 * authoritative `environment()` answer. Each declaration has two independent
 * facts and both are read at the moment the actual request URL is built
 * (never from a captured snapshot):
 *
 * - **runtime history notices** (`notices=v1`) — the host advertised
 *   `capabilities.runtimeHistoryNotices` version 1.
 * - **bounded catalog changes** (`catalogChanges=bounded-v1`) — the host
 *   advertised `capabilities.boundedCatalogChanges` version 1 AND the bounded
 *   catalog controller on this same client actually negotiated bounded reads.
 *   A notification capability is worthless before the controller that consumes
 *   the signal is ready.
 *
 * An older host has no signal form and strips unknown capability keys, so a
 * declaration sent there would only misclassify the frames it actually sends;
 * absence is authoritative and fails closed. State is per [RemoteApiClient], so
 * a host switch creates fresh state and a held answer from a superseded
 * authority can never declare the new one.
 */
internal class ClientCapabilityDeclaration {
    @Volatile
    private var notices: Boolean = false

    @Volatile
    private var catalogAdvertised: Boolean = false

    @Volatile
    private var catalogDeclared: Boolean = false

    /** Records the authoritative host answer once per `environment()` read. */
    fun observe(descriptor: RemoteEnvironmentDescriptor) {
        notices = descriptor.capabilities?.runtimeHistoryNotices?.versions
            ?.contains(RemoteEnvironmentDescriptor.RUNTIME_HISTORY_NOTICES_VERSION) == true
        catalogAdvertised = descriptor.capabilities?.boundedCatalogChanges?.versions
            ?.contains(RemoteEnvironmentDescriptor.BOUNDED_CATALOG_CHANGES_VERSION) == true
    }

    val noticesDeclared: Boolean
        get() = notices

    fun declareNotices(enabled: Boolean) {
        notices = enabled
    }

    /** The bounded catalog owner's negotiation result on this client. */
    fun declareCatalogChanges(enabled: Boolean) {
        catalogDeclared = enabled
    }

    /** Adds every declaration this client currently owns to the upgrade URL. */
    fun decorateWebSocketUrl(builder: HttpUrl.Builder) {
        if (notices) {
            builder.setQueryParameter("notices", RemoteHistoryNoticeCodes.DECLARATION)
        }
        if (catalogAdvertised && catalogDeclared) {
            builder.setQueryParameter(
                RemoteBoundedCatalogChangeCodes.WS_PARAM,
                RemoteBoundedCatalogChangeCodes.DECLARATION,
            )
        }
    }
}
