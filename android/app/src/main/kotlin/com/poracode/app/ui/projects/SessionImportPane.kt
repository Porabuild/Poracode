package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.protocol.projects.ImportableCliSession
import com.poracode.app.protocol.projects.SessionImportContract
import com.poracode.app.protocol.projects.SessionImportFilter
import com.poracode.app.protocol.projects.SessionImportListing
import com.poracode.app.ui.components.PoracodeActionButton
import com.poracode.app.ui.components.PoracodeButtonVariant
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeInlineSearchField
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.launch

/**
 * Full-screen Desktop Settings pane for discovering and importing host CLI sessions
 * across all projects (mirrors PWA `ImportSettings` and iOS `SessionImportView`).
 */
@Composable
internal fun SessionImportPane(
    projects: List<RemoteProject>,
    existingThreads: List<RemoteThread>,
    agents: List<AgentStatusEntry>,
    canOperate: Boolean,
    onLoadSessions: suspend (SessionImportFilter) -> Result<SessionImportListing>,
    onImportSession: suspend (String, ImportableCliSession, String) -> Result<String?>,
    onOpenThread: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var importingId by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var listing by remember { mutableStateOf<SessionImportListing?>(null) }

    fun refresh() {
        scope.launch {
            loading = true
            errorMessage = null
            onLoadSessions(SessionImportFilter())
                .onSuccess { listing = it }
                .onFailure { errorMessage = it.message ?: "" }
            loading = false
        }
    }

    LaunchedEffect(Unit) { refresh() }

    val filtered = remember(listing, query) {
        val filter = SessionImportFilter(query = query)
        listing?.sessions.orEmpty().filter { filter.includes(it) }
    }

    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PoracodeInlineSearchField(
            value = query,
            onValueChange = { query = it },
            placeholder = stringResource(R.string.session_import_search_placeholder),
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        )
        when {
            loading -> Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = colors.muted)
                Text(
                    stringResource(R.string.session_import_loading),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
            }
            errorMessage != null -> PoracodeCard {
                Text(
                    errorMessage?.ifBlank { stringResource(R.string.session_import_failed) }
                        ?: stringResource(R.string.session_import_failed),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.danger,
                )
                PoracodeActionButton(
                    label = stringResource(R.string.retry),
                    icon = PoracodeIcons.Refresh,
                    variant = PoracodeButtonVariant.Tonal,
                    onClick = { refresh() },
                )
            }
            filtered.isEmpty() -> Text(
                stringResource(R.string.session_import_empty),
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
                modifier = Modifier.padding(vertical = 16.dp),
            )
            else -> LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(filtered, key = { it.id }) { session ->
                    val importedId = SessionImportContract.alreadyImportedThreadId(session, existingThreads)
                    val matchingProject = projects.firstOrNull { project ->
                        session.cwd != null && project.location.path == session.cwd
                    } ?: projects.firstOrNull()
                    val resolvedModel = SessionImportContract.resolveModel(session, matchingProject, agents)
                    PoracodeCard {
                        Row(
                            Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    session.displayTitle,
                                    style = PoracodeTextStyles.rowTitle,
                                    color = colors.foreground,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    listOfNotNull(session.agentKind, session.cwd ?: matchingProject?.name)
                                        .joinToString(" · "),
                                    style = PoracodeTextStyles.rowDescription,
                                    color = colors.muted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            if (importedId != null) {
                                PoracodeActionButton(
                                    label = stringResource(R.string.session_import_open),
                                    icon = PoracodeIcons.KeyboardArrowRight,
                                    variant = PoracodeButtonVariant.Tonal,
                                    onClick = { onOpenThread(importedId) },
                                )
                            } else if (matchingProject != null && resolvedModel != null) {
                                PoracodeActionButton(
                                    label = stringResource(R.string.session_import_action),
                                    icon = PoracodeIcons.Download,
                                    variant = PoracodeButtonVariant.Tonal,
                                    enabled = canOperate && importingId == null,
                                    onClick = {
                                        scope.launch {
                                            importingId = session.id
                                            errorMessage = null
                                            onImportSession(matchingProject.id, session, resolvedModel)
                                                .onSuccess { createdId ->
                                                    if (createdId != null) onOpenThread(createdId)
                                                    else refresh()
                                                }
                                                .onFailure { errorMessage = it.message ?: "" }
                                            importingId = null
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
