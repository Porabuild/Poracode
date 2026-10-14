package com.poracode.app.ui.onboarding

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * Viewfinder chrome: dimmed surround with a clear rounded scan window, accent corner
 * brackets, and the desktop path caption. Purely decorative — it never blocks touches.
 */
@Composable
internal fun PairingScanOverlay(
    hint: String,
    caption: String,
    invalidMessage: String?,
    reducedMotion: Boolean,
    modifier: Modifier = Modifier,
) {
    val accent = MaterialTheme.colorScheme.primary
    val transition = rememberInfiniteTransition(label = "pairing-scan")
    // Reduced motion keeps the sweep pinned at its start value: no animation runs.
    val sweep by transition.animateFloat(
        initialValue = 0f,
        targetValue = if (reducedMotion) 0f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2400, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pairing-scan-sweep",
    )

    Box(modifier = modifier.fillMaxSize()) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val windowSide = minOf(size.width, size.height) * 0.68f
            val left = (size.width - windowSide) / 2f
            val top = (size.height - windowSide) / 2f - size.height * 0.04f
            val window = Rect(Offset(left, top), Size(windowSide, windowSide))
            val radius = 32.dp.toPx()

            val scrim = Path().apply {
                addRect(Rect(Offset.Zero, size))
                addRoundRect(RoundRect(window, CornerRadius(radius, radius)))
                fillType = PathFillType.EvenOdd
            }
            drawPath(scrim, color = Color.Black.copy(alpha = 0.62f))

            val bracket = windowSide * 0.16f
            val stroke = 4.dp.toPx()
            val corners = listOf(
                // (start, mid, end) per corner: two strokes meeting at the corner point.
                Triple(
                    Offset(window.left, window.top + bracket + radius * 0.2f),
                    Offset(window.left, window.top),
                    Offset(window.left + bracket + radius * 0.2f, window.top),
                ),
                Triple(
                    Offset(window.right - bracket - radius * 0.2f, window.top),
                    Offset(window.right, window.top),
                    Offset(window.right, window.top + bracket + radius * 0.2f),
                ),
                Triple(
                    Offset(window.right, window.bottom - bracket - radius * 0.2f),
                    Offset(window.right, window.bottom),
                    Offset(window.right - bracket - radius * 0.2f, window.bottom),
                ),
                Triple(
                    Offset(window.left + bracket + radius * 0.2f, window.bottom),
                    Offset(window.left, window.bottom),
                    Offset(window.left, window.bottom - bracket - radius * 0.2f),
                ),
            )
            corners.forEach { (start, corner, end) ->
                val path = Path().apply {
                    moveTo(start.x, start.y)
                    quadraticTo(corner.x, corner.y, end.x, end.y)
                }
                drawPath(
                    path = path,
                    color = accent,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }

            if (!reducedMotion) {
                val y = window.top + windowSide * sweep
                drawLine(
                    color = accent.copy(alpha = 0.85f),
                    start = Offset(window.left + radius * 0.4f, y),
                    end = Offset(window.right - radius * 0.4f, y),
                    strokeWidth = 2.dp.toPx(),
                    cap = StrokeCap.Round,
                )
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(horizontal = 24.dp, vertical = 28.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                hint,
                style = MaterialTheme.typography.titleMedium,
                color = Color.White,
                textAlign = TextAlign.Center,
            )
            Text(
                caption,
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.78f),
                textAlign = TextAlign.Center,
            )
            if (invalidMessage != null) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.errorContainer,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                ) {
                    Text(
                        invalidMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    )
                }
            }
        }
    }
}
