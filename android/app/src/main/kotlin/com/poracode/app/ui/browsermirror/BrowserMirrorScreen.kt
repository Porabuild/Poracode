package com.poracode.app.ui.browsermirror

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.session.browsermirror.BrowserMirrorController

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrowserMirrorScreen(
    controller: BrowserMirrorController,
    onBack: () -> Unit,
) {
    val state by controller.state.collectAsStateWithLifecycle()
    var address by rememberSaveable { mutableStateOf("") }
    BackHandler(onBack = onBack)

    LaunchedEffect(controller) {
        controller.requestWatch()
        controller.refreshNow()
    }
    LaunchedEffect(state.browser.activeTabId) {
        address = state.browser.activeTab?.url.orEmpty()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.browser_mirror_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = stringResource(R.string.browser_mirror_back_nav),
                        )
                    }
                },
                actions = {
                    IconButton(onClick = {
                        if (state.watching) controller.stopWatch() else controller.requestWatch()
                    }) {
                        Icon(
                            if (state.watching) Icons.Outlined.Stop else Icons.Outlined.PlayArrow,
                            contentDescription = stringResource(
                                if (state.watching) {
                                    R.string.browser_mirror_stop
                                } else {
                                    R.string.browser_mirror_start
                                },
                            ),
                        )
                    }
                    IconButton(
                        onClick = {
                            controller.launchCommand(
                                BrowserMirrorUiAction.Create(null).toCommand(),
                            )
                        },
                    ) {
                        Icon(
                            Icons.Outlined.Add,
                            contentDescription = stringResource(R.string.browser_mirror_create_tab),
                        )
                    }
                },
            )
        },
    ) { padding ->
        BoxWithConstraints(
            Modifier.fillMaxSize().padding(padding),
        ) {
            if (maxWidth >= 840.dp) {
                Row(Modifier.fillMaxSize()) {
                    BrowserTabList(
                        state = state,
                        controller = controller,
                        modifier = Modifier.width(280.dp).fillMaxHeight(),
                        vertical = true,
                    )
                    BrowserContent(
                        state,
                        address,
                        { address = it },
                        controller,
                        Modifier.weight(1f),
                    )
                }
            } else {
                Column(Modifier.fillMaxSize()) {
                    BrowserTabList(
                        state = state,
                        controller = controller,
                        modifier = Modifier.fillMaxWidth(),
                        vertical = false,
                    )
                    BrowserContent(
                        state,
                        address,
                        { address = it },
                        controller,
                        Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
