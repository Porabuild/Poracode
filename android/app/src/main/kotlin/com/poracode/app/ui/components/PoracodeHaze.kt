package com.poracode.app.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.theme.PoracodeTheme
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.blur.HazeBlurStyle
import dev.chrisbanes.haze.blur.HazeColorEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

/**
 * Optional backdrop-blur state for floating chrome. A screen that places glass
 * controls over scrolling content provides one [HazeState] here and marks the
 * scrolling content with `hazeSource`; [poracodeFloatingSurface] then blurs the
 * backdrop instead of showing raw content through the pill. `null` (the
 * default) keeps the plain translucent fill for surfaces with nothing behind.
 */
val LocalPoracodeHazeState = compositionLocalOf<HazeState?> { null }

/**
 * Owns the backdrop-blur [HazeState] for one screen and provides it to floating
 * chrome through [LocalPoracodeHazeState]. Adopt it at the screen's scaffold
 * level: [content] receives a [Modifier] that marks the scrolling backdrop with
 * `hazeSource` — apply it to the content that sits behind the floating controls
 * (a sibling overlay such as a [PoracodeBottomBar] or circle dock reads the state
 * and blurs it via `poracodeFloatingSurface`). Screens without floating chrome
 * can ignore the modifier.
 */
@Composable
fun PoracodeHazeHost(content: @Composable (backdrop: Modifier) -> Unit) {
    val hazeState = rememberHazeState()
    CompositionLocalProvider(LocalPoracodeHazeState provides hazeState) {
        content(Modifier.hazeSource(hazeState))
    }
}

/**
 * The blur + tint applied to floating chrome when a [LocalPoracodeHazeState]
 * is present. The radius sits in the 20–24 dp glass band; the tint reuses the
 * current floating surface colour at reduced alpha so dark and light keep the
 * same neutral tone as the untinted fallback.
 */
@Composable
fun poracodeGlassStyle(): HazeBlurStyle {
    val glass = PoracodeTheme.colors.glass
    return remember(glass) {
        HazeBlurStyle {
            blurRadius(22.dp)
            colorEffects(
                listOf(HazeColorEffect.tint(glass.copy(alpha = glass.alpha * 0.8f))),
            )
        }
    }
}
