package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScaffoldDefaults
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.poracode.app.chat.RichContextUsage
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.ui.components.PoracodeHazeHost

internal data class RichChatThreadLayout(val compact: Boolean, val backdrop: Modifier, val composerClearance: Dp)

/** Phone chrome floats over every transcript state, including an empty thread. */
@Composable
internal fun RichChatThreadSurface(
    modifier: Modifier,
    containerColor: Color,
    snackbarHost: @Composable () -> Unit,
    topBar: @Composable () -> Unit,
    bottomBar: @Composable () -> Unit,
    hasComposer: Boolean,
    gitSummary: RemoteGitSummary?,
    contextUsage: RichContextUsage?,
    onOpenWorkspaceGit: () -> Unit,
    providerUsageControl: @Composable () -> Unit,
    auxiliaryControls: @Composable () -> Unit,
    content: @Composable (PaddingValues, RichChatThreadLayout) -> Unit,
) {
    BoxWithConstraints(modifier) {
        val compact = maxWidth < 760.dp
        val floating = compact && hasComposer
        val density = LocalDensity.current
        var footerHeight by remember { mutableStateOf(0.dp) }
        PoracodeHazeHost { backdrop ->
            Scaffold(
                containerColor = containerColor,
                contentWindowInsets = if (floating) WindowInsets(0, 0, 0, 0) else ScaffoldDefaults.contentWindowInsets,
                topBar = topBar,
                bottomBar = { if (!floating) bottomBar() },
                snackbarHost = { Box(Modifier.padding(bottom = if (floating) footerHeight else 0.dp)) { snackbarHost() } },
            ) { padding ->
                Box(Modifier.fillMaxSize()) {
                    content(padding, RichChatThreadLayout(compact, backdrop, if (floating) footerHeight else 0.dp))
                    if (floating) {
                        Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.BottomCenter) {
                            Column(Modifier.onSizeChanged { footerHeight = with(density) { it.height.toDp() } }) {
                                Box(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                                    auxiliaryControls()
                                }
                                RichChatCompactInfoRow(
                                    gitSummary, contextUsage, onOpenWorkspaceGit,
                                    modifier = Modifier.padding(bottom = 4.dp),
                                    providerUsageControl = providerUsageControl,
                                )
                                bottomBar()
                            }
                        }
                    }
                }
            }
        }
    }
}
