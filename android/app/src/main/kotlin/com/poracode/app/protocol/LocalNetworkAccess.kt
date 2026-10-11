package com.poracode.app.protocol

import android.os.Build
import java.net.URI

/**
 * Android 17 (API 37) local-network permission policy.
 *
 * Enforcement is mandatory only when **both** the device SDK and the app
 * target are API 37+. Older devices and apps targeting < 37 keep the
 * historical INTERNET-only LAN path (no runtime prompt).
 *
 * Loopback is not a LAN hop and never requires [PERMISSION].
 * Private RFC1918 / link-local / `.local` / emulator `10.0.2.2` do.
 */
object LocalNetworkAccess {
    const val ANDROID_17_SDK_INT = 37
    const val PERMISSION = "android.permission.ACCESS_LOCAL_NETWORK"

    fun isAndroid17OrNewer(sdkInt: Int = Build.VERSION.SDK_INT): Boolean =
        sdkInt >= ANDROID_17_SDK_INT

    /**
     * Whether the platform will actually enforce [PERMISSION] for this process.
     * Safe on older APIs: always false.
     */
    fun enforcementApplies(
        deviceSdkInt: Int = Build.VERSION.SDK_INT,
        targetSdkInt: Int = ANDROID_17_SDK_INT,
    ): Boolean = deviceSdkInt >= ANDROID_17_SDK_INT && targetSdkInt >= ANDROID_17_SDK_INT

    fun isLocalNetworkEndpoint(url: String): Boolean {
        val uri = runCatching { URI(url.trim()) }.getOrNull() ?: return false
        val host = uri.host ?: return false
        if (PairingUrl.isLoopbackHostname(host)) return false
        return PairingUrl.isPrivateOrLoopbackHostname(host)
    }

    /**
     * Request [PERMISSION] only when Android 17 enforcement applies **and**
     * the endpoint is a real LAN host. Public HTTPS and loopback skip it.
     */
    fun shouldRequestPermission(
        endpoint: String,
        deviceSdkInt: Int = Build.VERSION.SDK_INT,
        targetSdkInt: Int = ANDROID_17_SDK_INT,
    ): Boolean = enforcementApplies(deviceSdkInt, targetSdkInt) &&
        isLocalNetworkEndpoint(endpoint)

    fun shouldRequestPermissionForAny(
        endpoints: Iterable<String>,
        deviceSdkInt: Int = Build.VERSION.SDK_INT,
        targetSdkInt: Int = ANDROID_17_SDK_INT,
    ): Boolean = endpoints.any { shouldRequestPermission(it, deviceSdkInt, targetSdkInt) }

    /** Resolve only the endpoint; pairing credentials are never retained here. */
    fun pairingEndpoint(
        pairingLink: String,
        manualBaseUrl: String,
        manualToken: String = "",
    ): String? {
        val pasted = pairingLink.trim()
        if (pasted.isNotEmpty()) {
            PairingUrl.parseDeepLink(pasted)?.let { return it.endpoint }
            if (PairingUrl.parseParts(pasted) != null) {
                return runCatching { PairingUrl.normalizeEndpoint(pasted) }.getOrNull()
            }
            if (manualToken.isNotBlank()) {
                return runCatching { PairingUrl.normalizeEndpoint(pasted) }.getOrNull()
            }
            return null
        }
        return manualBaseUrl.trim().takeIf(String::isNotEmpty)?.let {
            runCatching { PairingUrl.normalizeEndpoint(it) }.getOrNull()
        }
    }
}
