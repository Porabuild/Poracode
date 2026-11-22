package com.poracode.app.ui.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.launch

/**
 * Material 3 bottom sheet for browsing and importing existing local CLI sessions
 * discovered on the connected host via `listImportableSessions`.
 */
@Composable
fun SessionImportSheet(
    project: RemoteProject,
    existingThreads: List<RemoteThread>,
    agents: List<AgentStatusEntry>,
    onLoadSessions: suspend (SessionImportFilter) -> Result<SessionImportListing>,
    onImportSession: suspend (ImportableCliSession, String) -> Result<Unit>,
    onOpenThread: (String) -> Unit,
    onDismiss: () -> Unit,
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
            val result = onLoadSessions(SessionImportFilter(cwd = project.location.path))
            result.onSuccess { listing = it }
                .onFailure { errorMessage = it.message ?: "" }
            loading = false
        }
    }

    LaunchedEffect(project.id) { refresh() }

    val filtered = remember(listing, query) {
        val filter = SessionImportFilter(query = query)
        listing?.sessions.orEmpty().filter { filter.includes(it) }
    }

    PoracodeSheet(
        onDismissRequest = onDismiss,
        title = stringResource(R.string.session_import_title),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().heightIn(max = 520.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            PoracodeInlineSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = stringResource(R.string.session_import_search_placeholder),
                modifier = Modifier.fillMaxWidth(),
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
                    modifier = Modifier.weight(1f, fill = false),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(filtered, key = { it.id }) { session ->
                        val importedId = SessionImportContract.alreadyImportedThreadId(session, existingThreads)
                        val resolvedModel = SessionImportContract.resolveModel(session, project, agents)
                        PoracodeCard {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Icon(
                                    PoracodeIcons.Terminal,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                    tint = colors.muted,
                                )
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        session.displayTitle,
                                        style = MaterialTheme.typography.labelLarge,
                                        color = colors.foreground,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        listOfNotNull(session.agentKind, session.cwd)
                                            .joinToString(" · "),
                                        style = PoracodeTextStyles.rowMeta,
                                        color = colors.muted,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                if (importedId != null) {
                                    PoracodeActionButton(
                                        label = stringResource(R.string.session_import_open),
                                        variant = PoracodeButtonVariant.Outlined,
                                        onClick = {
                                            onDismiss()
                                            onOpenThread(importedId)
                                        },
                                    )
                                } else {
                                    PoracodeActionButton(
                                        label = stringResource(R.string.session_import_action),
                                        variant = PoracodeButtonVariant.Tonal,
                                        enabled = importingId == null && resolvedModel != null,
                                        onClick = {
                                            val model = resolvedModel ?: return@PoracodeActionButton
                                            scope.launch {
                                                importingId = session.id
                                                onImportSession(session, model)
                                                    .onSuccess { onDismiss() }
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
}
