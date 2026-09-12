package com.poracode.app.ui.components

import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith

private const val TotalDurationMillis = 300
private const val FadeOutDurationMillis = 90
private const val FadeInDurationMillis = 210
private const val FadeInDelayMillis = TotalDurationMillis - FadeInDurationMillis
private const val SlideFractionOfSize = 0.3f

/**
 * A Material 3 "shared axis - X" style transition: the entering destination slides in from
 * the trailing edge while fading in, and the exiting destination slides toward the leading
 * edge while fading out (mirrored when [forward] is false). Fade-out finishes before
 * fade-in starts to avoid a visible cross-fade "double image".
 *
 * When [reducedMotion] is true (system animations disabled), motion is replaced by an
 * instant cut so the destination change still reads as complete state, never a stuck
 * mid-transition frame.
 */
internal fun sharedAxisX(forward: Boolean, reducedMotion: Boolean): ContentTransform {
    if (reducedMotion) {
        return fadeIn(animationSpec = snap()) togetherWith fadeOut(animationSpec = snap())
    }
    val enter = fadeIn(
        animationSpec = tween(durationMillis = FadeInDurationMillis, delayMillis = FadeInDelayMillis),
    ) + slideInHorizontally(
        animationSpec = tween(durationMillis = TotalDurationMillis),
        initialOffsetX = { fullWidth ->
            val magnitude = (fullWidth * SlideFractionOfSize).toInt()
            if (forward) magnitude else -magnitude
        },
    )
    val exit = fadeOut(
        animationSpec = tween(durationMillis = FadeOutDurationMillis),
    ) + slideOutHorizontally(
        animationSpec = tween(durationMillis = TotalDurationMillis),
        targetOffsetX = { fullWidth ->
            val magnitude = (fullWidth * SlideFractionOfSize).toInt()
            if (forward) -magnitude else magnitude
        },
    )
    return enter togetherWith exit
}
