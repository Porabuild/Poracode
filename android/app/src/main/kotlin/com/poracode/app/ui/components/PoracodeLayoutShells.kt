package com.poracode.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

enum class ModalOverlaySide { Leading, Trailing }

/**
 * Resolved Book-posture vertical hinge split for any two-pane Android screen
 * (Settings, Projects, Hosts, Home).
 */
data class BookHingeSplit(
    val isBookPosture: Boolean,
    val sidebarWidthDp: Dp,
    val hingeGapDp: Dp,
) {
    companion object {
        fun resolve(
            containerWidthDp: Float,
            defaultSidebarWidthDp: Float,
            minSidebarWidthDp: Float = 240f,
            minTrailingWidthDp: Float = com.poracode.app.ui.home.HomeAdaptiveLayoutPolicy.MINIMUM_DETAIL_WIDTH_DP,
            hingeLeftDp: Float? = null,
            hingeWidthDp: Float? = null,
            isSeparatingVertical: Boolean = false,
        ): BookHingeSplit {
            val valid = isSeparatingVertical &&
                hingeLeftDp != null &&
                hingeWidthDp != null &&
                hingeLeftDp >= minSidebarWidthDp &&
                (containerWidthDp - hingeLeftDp - hingeWidthDp) >= minTrailingWidthDp
            return if (valid) {
                BookHingeSplit(
                    isBookPosture = true,
                    sidebarWidthDp = hingeLeftDp.dp,
                    hingeGapDp = hingeWidthDp.coerceAtLeast(0f).dp,
                )
            } else {
                BookHingeSplit(
                    isBookPosture = false,
                    sidebarWidthDp = defaultSidebarWidthDp.dp,
                    hingeGapDp = 0.dp,
                )
            }
        }
    }
}

@Composable
fun rememberBookHingeSplit(
    containerWidthDp: Dp,
    defaultSidebarWidthDp: Dp = 280.dp,
    minSidebarWidthDp: Dp = 240.dp,
    minTrailingWidthDp: Dp = com.poracode.app.ui.home.HomeAdaptiveLayoutPolicy.MINIMUM_DETAIL_WIDTH_DP.dp,
): BookHingeSplit {
    val density = LocalDensity.current
    val posture = currentWindowAdaptiveInfoV2().windowPosture
    return remember(containerWidthDp, defaultSidebarWidthDp, posture, density) {
        val hinge = posture.hingeList.firstOrNull { it.isVertical && it.isSeparating }
        BookHingeSplit.resolve(
            containerWidthDp = containerWidthDp.value,
            defaultSidebarWidthDp = defaultSidebarWidthDp.value,
            minSidebarWidthDp = minSidebarWidthDp.value,
            minTrailingWidthDp = minTrailingWidthDp.value,
            hingeLeftDp = hinge?.let { with(density) { it.bounds.left.toDp().value } },
            hingeWidthDp = hinge?.let { with(density) { it.bounds.width.toDp().value } },
            isSeparatingVertical = hinge != null,
        )
    }
}

/**
 * Unified `52dp` pane header shared across split sidebars, detail panes, inspector panels,
 * and nested editors — replaces ad-hoc header rows across screens.
 */
@Composable
fun PoracodePaneHeader(
    title: String? = null,
    modifier: Modifier = Modifier,
    leading: (@Composable RowScope.() -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
    background: Color = Color.Transparent,
    applyStatusBarsPadding: Boolean = false,
    horizontalPadding: Dp = 12.dp,
) {
    val colors = PoracodeTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (background != Color.Transparent) Modifier.background(background) else Modifier)
            .then(if (applyStatusBarsPadding) Modifier.statusBarsPadding() else Modifier)
            .height(PoracodeMetrics.headerHeight)
            .padding(horizontal = horizontalPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        leading?.invoke(this)
        if (title != null) {
            Text(
                title,
                style = PoracodeTextStyles.headerTitle.copy(fontWeight = FontWeight.SemiBold),
                color = colors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
        } else {
            Spacer(Modifier.weight(1f))
        }
        trailing?.invoke(this)
    }
}

/**
 * Shared animated Material 3 modal navigation drawer (Leading) or modal side sheet
 * (Trailing) with scrim, `24dp` inner-edge corners, `paneSurface` fill, and predictive back.
 */
@Composable
fun PoracodeModalSideOverlay(
    visible: Boolean,
    side: ModalOverlaySide,
    widthDp: Dp,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val colors = PoracodeTheme.colors
    val backModifier = rememberPredictiveBackModifier(enabled = visible, onBack = onDismiss)
    val shape = when (side) {
        ModalOverlaySide.Leading -> RoundedCornerShape(
            topEnd = PoracodeRadius.sheet,
            bottomEnd = PoracodeRadius.sheet,
        )
        ModalOverlaySide.Trailing -> RoundedCornerShape(
            topStart = PoracodeRadius.sheet,
            bottomStart = PoracodeRadius.sheet,
        )
    }
    Box(modifier.fillMaxSize().then(backModifier)) {
        AnimatedVisibility(visible = visible, enter = fadeIn(), exit = fadeOut()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(colors.scrim)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = androidx.compose.ui.semantics.Role.Button,
                        onClick = onDismiss,
                    ),
            )
        }
        AnimatedVisibility(
            visible = visible,
            modifier = Modifier.align(
                if (side == ModalOverlaySide.Leading) Alignment.CenterStart else Alignment.CenterEnd,
            ),
            enter = slideInHorizontally { if (side == ModalOverlaySide.Leading) -it else it },
            exit = slideOutHorizontally { if (side == ModalOverlaySide.Leading) -it else it },
        ) {
            Surface(
                modifier = Modifier.width(widthDp).fillMaxHeight(),
                shape = shape,
                shadowElevation = 16.dp,
                color = colors.paneSurface,
            ) {
                content()
            }
        }
    }
}

/**
 * Compositional Material 3 multi-pane shell shared by Home, Settings, Projects, and Hosts:
 * - Outer edge-to-edge `colors.paneShell`
 * - Docked full-height sidebar (or Book-posture hinge-aligned sidebar) OR `PoracodeModalSideOverlay`
 * - Optional draggable resize gutter (`PoracodePanelResizeHandle`) or hinge spacer
 * - Safe-area-inset detail canvas optionally wrapped in `PoracodePaneContainer` (`16dp` rounded)
 */
@Composable
fun PoracodeAdaptiveSplitShell(
    dockedSidebarVisible: Boolean,
    sidebarWidthDp: Dp,
    modifier: Modifier = Modifier,
    hingeGapDp: Dp = 0.dp,
    overlaySidebarVisible: Boolean = false,
    onDismissOverlaySidebar: () -> Unit = {},
    resizeHandle: (@Composable () -> Unit)? = null,
    wrapDetailInPane: Boolean = true,
    sidebar: @Composable (Modifier) -> Unit,
    detail: @Composable () -> Unit,
) {
    val colors = PoracodeTheme.colors
    Box(modifier.fillMaxSize().background(colors.paneShell)) {
        Row(Modifier.fillMaxSize()) {
            if (dockedSidebarVisible) {
                sidebar(Modifier.width(sidebarWidthDp).fillMaxHeight())
                when {
                    hingeGapDp > 0.dp -> Spacer(Modifier.width(hingeGapDp).fillMaxHeight())
                    resizeHandle != null -> resizeHandle()
                    else -> Spacer(Modifier.width(8.dp).fillMaxHeight())
                }
            }
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(
                        start = if (dockedSidebarVisible) 0.dp else 8.dp,
                        end = 8.dp,
                        top = 8.dp,
                        bottom = 8.dp,
                    ),
            ) {
                if (wrapDetailInPane) {
                    PoracodePaneContainer { detail() }
                } else {
                    detail()
                }
            }
        }
        PoracodeModalSideOverlay(
            visible = overlaySidebarVisible,
            side = ModalOverlaySide.Leading,
            widthDp = sidebarWidthDp,
            onDismiss = onDismissOverlaySidebar,
        ) {
            sidebar(Modifier.fillMaxSize())
        }
    }
}

/**
 * Centered reading-measure wrapper inside a detail pane (`maxWidth = 720dp` default).
 */
@Composable
fun PoracodeCenteredDetail(
    modifier: Modifier = Modifier,
    maxWidth: Dp = 720.dp,
    content: @Composable () -> Unit,
) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Box(Modifier.widthIn(max = maxWidth).fillMaxSize()) {
            content()
        }
    }
}
