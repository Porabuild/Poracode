package com.poracode.app.model

/**
 * Bounded catalog-change notification vocabulary (app-owned).
 *
 * The host advertises `capabilities.boundedCatalogChanges.versions` and honors
 * an exact per-connection `catalogChanges=bounded-v1` upgrade declaration. A
 * declared connection receives the signal form of the existing
 * `remote-projects-changed` event (`mode:"signal"`, no payload); the router
 * refreshes through the bounded catalog reads exactly as it does for the
 * legacy full form, so no payload decoding is involved on either form.
 */
object RemoteBoundedCatalogChangeCodes {
    /** WS upgrade query parameter carrying [DECLARATION]. */
    const val WS_PARAM = "catalogChanges"

    /** The only declaration value this generation emits (exact match, fail closed). */
    const val DECLARATION = "bounded-v1"
}
