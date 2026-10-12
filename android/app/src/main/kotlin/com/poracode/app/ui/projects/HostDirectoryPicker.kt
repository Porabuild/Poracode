package com.poracode.app.ui.projects

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Storage
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.BrowseHostDirectoryResult
import com.poracode.app.model.HostDirectoryEntryType
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.session.projects.ProjectSessionRuntime
import kotlinx.coroutines.launch

@Composable
internal fun HostDirectoryPicker(
    runtime: ProjectSessionRuntime,
    lease: ProjectHostLease,
    title: String,
    initialPath: String,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
) {
    val directoryState by runtime.directory.state.collectAsStateWithLifecycle()
    val navigation = directoryState.sessions[lease.key]
    val listing = navigation?.listing
    val scope = rememberCoroutineScope()
    fun browse(path: String) {
        scope.launch { runtime.directory.navigate(path) }
    }
    LaunchedEffect(lease.key, initialPath) { runtime.directory.navigate(initialPath) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth(0.94f).widthIn(max = 680.dp).heightIn(max = 720.dp),
        ) {
            Column(
                Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(title, style = MaterialTheme.typography.headlineSmall)
                DirectoryToolbar(listing, navigation?.loading == true, ::browse)
                ProjectFailureText(navigation?.failure)
                when {
                    navigation?.loading == true -> {
                        Column(
                            Modifier.fillMaxWidth().heightIn(min = 240.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            CircularProgressIndicator()
                            Text(
                                stringResource(R.string.projects_loading_folders),
                                modifier = Modifier.padding(top = 12.dp),
                            )
                        }
                    }
                    listing == null -> {
                        Column(
                            Modifier.fillMaxWidth().heightIn(min = 240.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Text(stringResource(R.string.projects_folder_unavailable))
                            TextButton(onClick = { browse(navigation?.requestedPath ?: initialPath) }) {
                                Text(stringResource(R.string.retry))
                            }
                        }
                    }
                    else -> DirectoryEntries(listing, ::browse)
                }
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onDismiss) {
                        Text(stringResource(R.string.projects_cancel))
                    }
                    Spacer(Modifier.size(8.dp))
                    Button(
                        onClick = { onSelect(listing!!.path) },
                        enabled = listing != null &&
                            !listing.isDrivePseudoRoot &&
                            navigation?.loading != true,
                    ) {
                        Text(stringResource(R.string.projects_use_folder))
                    }
                }
            }
        }
    }
}

@Composable
private fun DirectoryToolbar(
    listing: BrowseHostDirectoryResult?,
    loading: Boolean,
    browse: (String) -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.large,
    ) {
        Row(
            Modifier.fillMaxWidth().padding(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = { listing?.parentPath?.let(browse) },
                enabled = !loading && listing?.parentPath != null,
            ) { Icon(Icons.Outlined.ArrowUpward, stringResource(R.string.projects_up_folder)) }
            IconButton(
                onClick = { listing?.homePath?.let(browse) },
                enabled = !loading && listing != null,
            ) { Icon(Icons.Outlined.Home, stringResource(R.string.projects_home_folder)) }
            IconButton(
                onClick = { browse(BrowseHostDirectoryResult.DRIVE_PSEUDO_ROOT) },
                enabled = !loading,
            ) { Icon(Icons.Outlined.Storage, stringResource(R.string.projects_drives)) }
            Text(
                if (listing?.isDrivePseudoRoot == true) {
                    stringResource(R.string.projects_drives)
                } else {
                    listing?.path ?: stringResource(R.string.projects_loading_path)
                },
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun DirectoryEntries(
    listing: BrowseHostDirectoryResult,
    browse: (String) -> Unit,
) {
    LazyColumn(Modifier.fillMaxWidth().heightIn(min = 240.dp, max = 500.dp)) {
        if (listing.entries.isEmpty()) {
            item { Text(stringResource(R.string.projects_folder_empty), Modifier.padding(16.dp)) }
        }
        items(listing.entries, key = { it.path }) { entry ->
            val directory = entry.type == HostDirectoryEntryType.DIRECTORY
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (directory) Modifier.clickable { browse(entry.path) } else Modifier)
                    .padding(horizontal = 8.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    if (directory) Icons.Outlined.Folder else Icons.Outlined.Description,
                    contentDescription = null,
                    tint = if (directory) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
                Text(entry.name, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (directory) {
                    Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null)
                }
            }
        }
        if (listing.truncated) {
            item {
                Text(
                    stringResource(R.string.projects_folder_truncated),
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
