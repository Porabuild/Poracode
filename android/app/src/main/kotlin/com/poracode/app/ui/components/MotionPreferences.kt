package com.poracode.app.ui.components

import android.provider.Settings
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * True when the user asked the system to remove animations
 * (Settings → Accessibility → Remove animations, or Developer options animation scales = off).
 *
 * Read once per composition: the platform restarts activities/recomposes on these
 * changes, and decorative animations must never be the reason a screen re-reads settings.
 */
@Composable
fun rememberReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        val resolver = context.contentResolver
        val animator = runCatching {
            Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        }.getOrDefault(1f)
        val transition = runCatching {
            Settings.Global.getFloat(resolver, Settings.Global.TRANSITION_ANIMATION_SCALE, 1f)
        }.getOrDefault(1f)
        animator == 0f || transition == 0f
    }
}

/**
 * Press-scale for the shared Poracode controls: springs toward [pressedScale]
 * while pressed and back to 1 when released. Returns 1f under reduced motion so
 * callers can apply `.scale(...)` unconditionally. The Android counterpart of
 * iOS glass's interactive bounce.
 */
@Composable
fun rememberPressScale(
    interaction: MutableInteractionSource,
    pressedScale: Float = 0.94f,
): Float {
    val pressed by interaction.collectIsPressedAsState()
    val reducedMotion = rememberReducedMotion()
    val scale by animateFloatAsState(
        targetValue = if (pressed && !reducedMotion) pressedScale else 1f,
        animationSpec = spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMediumLow),
        label = "poracodePressScale",
    )
    return scale
}
