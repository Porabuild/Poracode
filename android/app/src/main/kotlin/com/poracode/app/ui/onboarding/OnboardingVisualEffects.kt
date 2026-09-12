package com.poracode.app.ui.onboarding

import android.graphics.Matrix
import android.graphics.RadialGradient
import android.graphics.SweepGradient
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poracode.app.R
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

internal val OnboardingViolet = Color(0xFF8B7BFF)
internal val OnboardingForeground = Color(0xFFF3F0F6)
internal val OnboardingMuted = Color(0xFF98929F)

/**
 * Compose's stock sweep brush has no animated start angle. Rotating the border
 * node instead also rotates its rounded-square geometry, which creates the
 * flower-like outline that differs from the web animation. Rotating only the
 * Android shader keeps the squircle fixed while its bright edge travels.
 */
private class RotatingSweepBrush(
    private val stops: List<Pair<Float, Color>>,
    private val angleDegrees: Float,
) : ShaderBrush() {
    override fun createShader(size: Size): Shader {
        val rotation = Matrix().apply {
            setRotate(angleDegrees, size.width / 2f, size.height / 2f)
        }
        return SweepGradient(
            size.width / 2f,
            size.height / 2f,
            stops.map { it.second.toArgb() }.toIntArray(),
            stops.map { it.first }.toFloatArray(),
        ).apply { setLocalMatrix(rotation) }
    }
}

/** White code illumination centered on the hero, fading to black at distance. */
private class CodeRevealBrush : ShaderBrush() {
    override fun createShader(size: Size): Shader = RadialGradient(
        size.width / 2f,
        size.height * 0.34f,
        size.width * 0.82f,
        intArrayOf(
            Color.White.copy(alpha = 0.075f).toArgb(),
            Color.White.copy(alpha = 0.055f).toArgb(),
            Color.White.copy(alpha = 0.018f).toArgb(),
            Color.Transparent.toArgb(),
        ),
        floatArrayOf(0f, 0.42f, 0.72f, 1f),
        android.graphics.Shader.TileMode.CLAMP,
    )
}

private val CodeWall = """
import { startTransition, useEffect, useState } from "react";
import { invokeAgent, type AgentStatus } from "@poracode/agents";
import { PTYSession } from "@/shared/pty";
import { useAppStore } from "@/renderer/state/appStore";
import { readBridge } from "@/renderer/bridge";

export interface OrchestratorProps {
  projectId: string;
  initialPrompt?: string;
}

export function AgentOrchestrator({ projectId }: OrchestratorProps) {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const dispatch = useAppStore((state) => state.dispatch);
  useEffect(() => {
    const session = new PTYSession(projectId);
    session.on("data", (chunk) => dispatch({ type: "PTY_DATA", payload: chunk }));
    return () => session.kill();
  }, [projectId]);
  return <TerminalView status={status} />;
}

export class SupervisorRuntime {
  private workers = new Map<string, Worker>();
  async spawn(config: RuntimeConfig) {
    const worker = new Worker(config.entrypoint, { type: "module" });
    worker.postMessage({ type: "INIT", config });
    return worker;
  }
}
""".trimIndent()

/** Near-black code wall and softly breathing brand illumination. */
@Composable
internal fun OnboardingBackdrop(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "onboarding backdrop")
    val glow by transition.animateFloat(
        initialValue = 0.82f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(3_200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "backdrop glow",
    )
    val wallpaper = remember { CodeWall.repeat(3) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF050507))
            .clearAndSetSemantics { },
    ) {
        val codeMask = remember { CodeRevealBrush() }
        Text(
            text = wallpaper,
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 30.dp, vertical = 38.dp),
            style = TextStyle(brush = codeMask),
            fontFamily = FontFamily.Monospace,
            fontSize = 10.sp,
            lineHeight = 16.sp,
            maxLines = 64,
            overflow = TextOverflow.Clip,
        )
        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .offset(y = (-145).dp)
                .size(430.dp)
                .graphicsLayer {
                    scaleX = glow
                    scaleY = glow
                }
                .blur(10.dp)
                .background(
                    Brush.radialGradient(
                        listOf(
                            Color.White.copy(alpha = 0.085f),
                            OnboardingViolet.copy(alpha = 0.04f),
                            Color.Transparent,
                        ),
                    ),
                    CircleShape,
                ),
        )
    }
}

/** Native counterpart of the PWA comet landing and always-on lightning ring. */
@Composable
internal fun AnimatedBrandMark(
    size: Dp,
    modifier: Modifier = Modifier,
) {
    val landing = remember { Animatable(0f) }
    val splash = remember { Animatable(0f) }
    val transition = rememberInfiniteTransition(label = "brand lightning")
    val clockwise by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(6_000, easing = LinearEasing)),
        label = "clockwise lightning",
    )
    val counterclockwise by transition.animateFloat(
        initialValue = 0f,
        targetValue = -360f,
        animationSpec = infiniteRepeatable(tween(4_000, easing = LinearEasing)),
        label = "counterclockwise lightning",
    )
    val glow by transition.animateFloat(
        initialValue = 0.82f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(2_000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "lightning glow",
    )
    val shape = RoundedCornerShape(size * 0.27f)
    val ringShape = RoundedCornerShape((size + 6.dp) * 0.27f)

    LaunchedEffect(Unit) {
        coroutineScope {
            launch {
                landing.animateTo(
                    targetValue = 1f,
                    animationSpec = spring(
                        dampingRatio = 0.72f,
                        stiffness = Spring.StiffnessMediumLow,
                    ),
                )
            }
            launch {
                delay(520)
                splash.animateTo(1f, animationSpec = tween(900, easing = FastOutSlowInEasing))
            }
        }
    }

    Box(
        modifier = modifier
            .size(size * 2.2f)
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(size * 2.1f)
                .graphicsLayer {
                    scaleX = glow
                    scaleY = glow
                }
                .blur(9.dp)
                .background(
                    Brush.radialGradient(
                        listOf(
                            Color.White.copy(alpha = 0.18f),
                            OnboardingViolet.copy(alpha = 0.075f),
                            Color.Transparent,
                        ),
                    ),
                    CircleShape,
                ),
        )

        Box(
            Modifier
                .size(size * 1.15f)
                .graphicsLayer {
                    alpha = 0.62f * (1f - splash.value)
                    val expansion = 1f + splash.value * 3.5f
                    scaleX = expansion
                    scaleY = expansion
                }
                .border(1.dp, Color.White.copy(alpha = 0.34f), CircleShape),
        )

        Box(
            Modifier
                .size(size + 6.dp)
                .border(
                    2.dp,
                    RotatingSweepBrush(
                        listOf(
                            0f to Color.Transparent,
                            0.50f to Color.Transparent,
                            0.61f to OnboardingViolet.copy(alpha = 0.15f),
                            0.75f to OnboardingViolet,
                            0.82f to Color.White,
                            0.89f to OnboardingViolet,
                            0.97f to OnboardingViolet.copy(alpha = 0.15f),
                            1f to Color.Transparent,
                        ),
                        clockwise,
                    ),
                    ringShape,
                ),
        )

        Box(
            Modifier
                .size(size + 6.dp)
                .border(
                    1.dp,
                    RotatingSweepBrush(
                        listOf(
                            0f to Color.Transparent,
                            0.33f to Color.Transparent,
                            0.44f to OnboardingViolet.copy(alpha = 0.15f),
                            0.61f to OnboardingViolet,
                            0.69f to Color.White.copy(alpha = 0.85f),
                            0.78f to OnboardingViolet,
                            0.89f to OnboardingViolet.copy(alpha = 0.15f),
                            1f to Color.Transparent,
                        ),
                        counterclockwise,
                    ),
                    ringShape,
                ),
        )

        Image(
            painter = painterResource(R.drawable.ic_brand_mark),
            contentDescription = null,
            modifier = Modifier
                .size(size)
                .graphicsLayer {
                    alpha = landing.value
                    scaleX = 0.78f + 0.22f * landing.value
                    scaleY = 0.78f + 0.22f * landing.value
                    translationY = (1f - landing.value) * 18.dp.toPx()
                }
                .border(
                    1.dp,
                    Brush.linearGradient(
                        listOf(
                            OnboardingViolet.copy(alpha = 0.62f),
                            OnboardingViolet.copy(alpha = 0.12f),
                        ),
                    ),
                    shape,
                )
                .clip(shape),
        )
    }
}
