package com.poracode.app.ui.components

import android.annotation.SuppressLint
import androidx.activity.BackEventCompat
import androidx.activity.compose.BackHandler
import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.CancellationException

/**
 * Shared predictive-back treatment for in-app destinations. Registers a
 * [PredictiveBackHandler] and returns a [Modifier] that the screen applies to its
 * root: as the back gesture progresses the screen scales toward 0.92, shifts up to
 * 24.dp toward the swipe edge, rounds its corners to 28.dp over a subtle scrim.
 * Committing the gesture calls [onBack]; cancelling springs the transform back.
 *
 * All animation runs in the draw phase (graphicsLayer + drawWithContent) so the
 * gesture never recomposes screen content. Under reduced motion this degrades to a
 * plain [BackHandler] with no visual transform.
 *
 * Apply the returned modifier to the screen's outermost layout, e.g.
 * `Scaffold(modifier = rememberPredictiveBackModifier(onBack = …))`.
 */
@SuppressLint("ModifierFactoryExtensionFunction")
@Composable
fun rememberPredictiveBackModifier(
    enabled: Boolean = true,
    onBack: () -> Unit,
): Modifier {
    val reducedMotion = rememberReducedMotion()
    val progress = remember { Animatable(0f) }
    val swipeEdge = remember { mutableIntStateOf(BackEventCompat.EDGE_LEFT) }
    val scrim = PoracodeTheme.colors.scrim
    val shiftPx = with(LocalDensity.current) { 24.dp.toPx() }

    if (reducedMotion) {
        BackHandler(enabled = enabled, onBack = onBack)
    } else {
        PredictiveBackHandler(enabled = enabled) { events ->
            try {
                events.collect { event ->
                    swipeEdge.intValue = event.swipeEdge
                    progress.snapTo(event.progress)
                }
                onBack()
            } catch (cancelled: CancellationException) {
                progress.animateTo(
                    0f,
                    spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMediumLow),
                )
            }
        }
    }

    return Modifier
        .graphicsLayer {
            val p = progress.value
            scaleX = 1f - SCALE_RANGE * p
            scaleY = 1f - SCALE_RANGE * p
            val direction = if (swipeEdge.intValue == BackEventCompat.EDGE_LEFT) -1f else 1f
            translationX = direction * shiftPx * p
        }
        .drawWithContent {
            val p = progress.value
            if (p <= 0f) {
                drawContent()
            } else {
                drawRect(scrim.copy(alpha = scrim.alpha * SCRIM_STRENGTH * p))
                val radius = CORNER_RADIUS.toPx() * p
                val path = Path().apply {
                    addRoundRect(RoundRect(Rect(Offset.Zero, size), CornerRadius(radius, radius)))
                }
                val canvas = drawContext.canvas
                canvas.save()
                canvas.clipPath(path)
                drawContent()
                canvas.restore()
            }
        }
}

private const val SCALE_RANGE = 0.08f // scale settles at 0.92 at full progress
private const val SCRIM_STRENGTH = 0.3f
private val CORNER_RADIUS = 28.dp
