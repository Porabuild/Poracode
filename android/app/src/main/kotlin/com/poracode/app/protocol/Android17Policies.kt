package com.poracode.app.protocol

/**
 * Pure Android 17 (API 37) target-behavior decisions.
 * Kept free of Android framework types so unit tests stay on the JVM.
 */
object Android17Policies {
    const val LARGE_SCREEN_SW_DP = 600
    const val EXPANDED_WIDTH_DP = 840
    const val HOST_SWITCHER_TWO_PANE_WIDTH_DP = 840

    /** Orientation / aspect-ratio locks are ignored on sw>=600 when targeting 37. */
    fun ignoresOrientationLocks(smallestWidthDp: Int, targetSdkInt: Int): Boolean =
        targetSdkInt >= LocalNetworkAccess.ANDROID_17_SDK_INT &&
            smallestWidthDp >= LARGE_SCREEN_SW_DP

    fun useTwoPaneHostSwitcher(widthDp: Int): Boolean =
        widthDp >= HOST_SWITCHER_TWO_PANE_WIDTH_DP

    fun useNavigationRail(widthDp: Int): Boolean =
        widthDp >= LARGE_SCREEN_SW_DP

    /**
     * Config-change survival: process-level session + no-backup registry already
     * outlive Activity recreation. Compose state that is not a secret may use
     * rememberSaveable; pairing tokens must not.
     */
    fun pairingSecretsSurviveConfigChange(): Boolean = false

    /**
     * SessionPool + background gate already cancel sockets. Extra work must not
     * start while backgrounded, even after a density/uiMode config change.
     */
    fun mayStartNetworkAfterConfigChange(isForeground: Boolean): Boolean = isForeground

    /** Selected + one LRU secondary. Never more than two live sockets. */
    const val MAX_LIVE_SESSIONS = 2
}
