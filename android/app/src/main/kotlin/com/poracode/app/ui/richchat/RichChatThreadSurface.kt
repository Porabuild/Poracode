package com.poracode.app.ui.richchat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichContextUsage
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.ui.components.ModalOverlaySide
import com.poracode.app.ui.components.PanelResizeSide
import com.poracode.app.ui.components.PoracodeHazeHost
import com.poracode.app.ui.components.PoracodeModalSideOverlay
import com.poracode.app.ui.components.PoracodePaneContainer
import com.poracode.app.ui.components.PoracodePanelResizeHandle
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTheme

internal data class RichChatThreadLayout(
    val compact: Boolean,
    val backdrop: Modifier,
    val composerClearance: Dp,
    val inspectorOpen: Boolean = false,
)

/**
 * Adaptive conversation surface:
 * - Phone portrait (`!inSplitShell`): full-bleed canvas with status-bar top bar and
 *   floating Haze composer clearing the gesture pill and IME.
 * - Foldable / Tablet (`inSplitShell`): Chat Pane (`16dp` rounded full-height container)
 *   owns its own top bar, and when the Inspector is docked, BOTH panes extend full-height
 *   at the exact same top & bottom edges with a divider-free drag-pill gutter between them.
 */
@Composable
internal fun RichChatThreadSurface(
    modifier: Modifier,
    containerColor: Color,
    snackbarHost: @Composable () -> Unit,
    topBar: @Composable (capability: RichChatInspectorCapability) -> Unit,
    bottomBar: @Composable () -> Unit,
    hasComposer: Boolean,
    gitSummary: RemoteGitSummary?,
    contextUsage: RichContextUsage?,
    onOpenWorkspaceGit: () -> Unit,
    providerUsageControl: @Composable () -> Unit,
    auxiliaryControls: @Composable () -> Unit,
    inSplitShell: Boolean = false,
    tabletopTopHeightDp: Float = 0f,
    tabletopHingeHeightDp: Float = 0f,
    inspectorOpen: Boolean = false,
    onCloseInspector: () -> Unit = {},
    preferredInspectorWidthDp: Int = 0,
    onCommitInspectorWidthDp: (Int) -> Unit = {},
    onResetInspectorWidth: () -> Unit = {},
    inspectorContent: (@Composable (panelWidthDp: Float) -> Unit)? = null,
    content: @Composable (PaddingValues, RichChatThreadLayout) -> Unit,
) {
    val colors = PoracodeTheme.colors
    val density = LocalDensity.current
    var dragInspectorWidthDp by remember { mutableStateOf<Float?>(null) }

    BoxWithConstraints(modifier) {
        val isTabletopSplit = tabletopTopHeightDp > 0f
        val localTabletopTopDp = (tabletopTopHeightDp - if (inSplitShell) 8f else 0f)
            .coerceIn(160f, (maxHeight.value - tabletopHingeHeightDp - 120f).coerceAtLeast(160f))
        val capability = RichChatInspectorCapability.resolve(
            widthDp = maxWidth.value,
            heightDp = maxHeight.value,
            fontScale = density.fontScale,
        )
        // Disable inspector docking/overlay while in Tabletop posture so inspector tabs
        // never straddle the horizontal hinge crease.
        val showsInspector = !isTabletopSplit && capability.supportsInspector && inspectorOpen && inspectorContent != null
        val docksInspector = showsInspector && capability.docksInspector
        val overlaysInspector = showsInspector && !capability.docksInspector
        val range = RichChatInspectorGeometry.widthRangeDp(maxWidth.value, docked = capability.docksInspector)
        val defaultWidth = RichChatInspectorGeometry.defaultWidthDp(maxWidth.value)
        val resolvedInspectorWidth = (
            dragInspectorWidthDp
                ?: preferredInspectorWidthDp.takeIf { it > 0 }?.toFloat()
                ?: defaultWidth
            ).coerceIn(range.start, range.endInclusive)

        val compact = !capability.supportsInspector
        val floating = hasComposer
        var footerHeight by remember { mutableStateOf(0.dp) }

        val chatPaneBody: @Composable () -> Unit = {
            PoracodeHazeHost { backdrop ->
                if (isTabletopSplit) {
                    // Tabletop foldable posture: transcript unconditionally above the horizontal
                    // hinge, unobstructed crease gutter, composer/controls & snackbar below.
                    Column(Modifier.fillMaxSize().background(containerColor)) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(localTabletopTopDp.dp),
                        ) {
                            topBar(capability)
                            Box(
                                modifier = Modifier.weight(1f).fillMaxWidth(),
                                contentAlignment = Alignment.TopCenter,
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxHeight()
                                        .widthIn(max = RichChatInspectorGeometry.MAX_READING_MEASURE_DP.dp)
                                        .fillMaxWidth(),
                                ) {
                                    content(
                                        PaddingValues(0.dp),
                                        RichChatThreadLayout(
                                            compact = compact,
                                            backdrop = backdrop,
                                            composerClearance = 12.dp,
                                            inspectorOpen = false,
                                        ),
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(tabletopHingeHeightDp.dp))
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                                .then(if (!inSplitShell) Modifier.navigationBarsPadding() else Modifier)
                                .imePadding(),
                            contentAlignment = Alignment.BottomCenter,
                        ) {
                            if (floating) {
                                Column(
                                    modifier = Modifier
                                        .widthIn(max = RichChatInspectorGeometry.MAX_READING_MEASURE_DP.dp)
                                        .fillMaxWidth()
                                        .onSizeChanged {
                                            footerHeight = with(density) { it.height.toDp() }
                                        },
                                ) {
                                    Box(
                                        Modifier
                                            .weight(1f, fill = false)
                                            .verticalScroll(rememberScrollState()),
                                    ) {
                                        auxiliaryControls()
                                    }
                                    RichChatCompactInfoRow(
                                        gitSummary,
                                        contextUsage,
                                        onOpenWorkspaceGit,
                                        modifier = Modifier.padding(bottom = 4.dp),
                                        providerUsageControl = providerUsageControl,
                                    )
                                    bottomBar()
                                }
                            }
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomCenter)
                                    .padding(bottom = if (floating) footerHeight else 0.dp),
                            ) {
                                snackbarHost()
                            }
                        }
                    }
                } else {
                    Column(Modifier.fillMaxSize().background(containerColor)) {
                        topBar(capability)
                        Box(Modifier.weight(1f).fillMaxWidth()) {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.TopCenter,
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxHeight()
                                        .widthIn(max = RichChatInspectorGeometry.MAX_READING_MEASURE_DP.dp)
                                        .fillMaxWidth(),
                                ) {
                                    content(
                                        PaddingValues(0.dp),
                                        RichChatThreadLayout(
                                            compact = compact,
                                            backdrop = backdrop,
                                            composerClearance = if (floating) footerHeight else 0.dp,
                                            inspectorOpen = showsInspector,
                                        ),
                                    )
                                }
                            }
                            if (floating) {
                                Box(
                                    modifier = Modifier.fillMaxSize(),
                                    contentAlignment = Alignment.BottomCenter,
                                ) {
                                    Column(
                                        modifier = Modifier
                                            .widthIn(max = RichChatInspectorGeometry.MAX_READING_MEASURE_DP.dp)
                                            .fillMaxWidth()
                                            .then(if (!inSplitShell) Modifier.navigationBarsPadding() else Modifier)
                                            .imePadding()
                                            .onSizeChanged {
                                                footerHeight = with(density) { it.height.toDp() }
                                            },
                                    ) {
                                        if (!showsInspector) {
                                            Box(
                                                Modifier
                                                    .weight(1f, fill = false)
                                                    .verticalScroll(rememberScrollState()),
                                            ) {
                                                auxiliaryControls()
                                            }
                                            RichChatCompactInfoRow(
                                                gitSummary,
                                                contextUsage,
                                                onOpenWorkspaceGit,
                                                modifier = Modifier.padding(bottom = 4.dp),
                                                providerUsageControl = providerUsageControl,
                                            )
                                        }
                                        bottomBar()
                                    }
                                }
                            }
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomCenter)
                                    .padding(bottom = if (floating) footerHeight else 0.dp),
                            ) {
                                snackbarHost()
                            }
                        }
                    }
                }
            }
        }

        Box(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f).fillMaxHeight()) {
                    if (inSplitShell) {
                        PoracodePaneContainer(containerColor = containerColor) {
                            chatPaneBody()
                        }
                    } else {
                        chatPaneBody()
                    }
                }

                if (docksInspector) {
                    PoracodePanelResizeHandle(
                        side = PanelResizeSide.LeadingOfTrailingPanel,
                        label = stringResource(R.string.inspector_resize),
                        currentWidthDp = resolvedInspectorWidth,
                        defaultWidthDp = defaultWidth,
                        allowedRangeDp = range,
                        enabled = range.endInclusive > range.start,
                        onLiveResize = { dragInspectorWidthDp = it },
                        onCommit = { committed ->
                            dragInspectorWidthDp = null
                            onCommitInspectorWidthDp(committed.toInt())
                        },
                        onReset = {
                            dragInspectorWidthDp = null
                            onResetInspectorWidth()
                        },
                    )
                    Box(
                        modifier = Modifier
                            .width(resolvedInspectorWidth.dp)
                            .fillMaxHeight(),
                    ) {
                        if (inSplitShell) {
                            PoracodePaneContainer(containerColor = containerColor) {
                                inspectorContent.invoke(resolvedInspectorWidth)
                            }
                        } else {
                            inspectorContent.invoke(resolvedInspectorWidth)
                        }
                    }
                }
            }

            PoracodeModalSideOverlay(
                visible = overlaysInspector,
                side = ModalOverlaySide.Trailing,
                widthDp = resolvedInspectorWidth.dp,
                onDismiss = onCloseInspector,
            ) {
                inspectorContent?.invoke(resolvedInspectorWidth)
            }
        }
    }
}
