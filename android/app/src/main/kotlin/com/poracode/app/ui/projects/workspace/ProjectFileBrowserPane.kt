package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ProjectFileEntry
import com.poracode.app.model.ProjectFileEntryType
import com.poracode.app.session.projects.ProjectWorkspaceEntry
import com.poracode.app.session.projects.ProjectEntryMutation
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.theme.PoracodeIcons
import kotlinx.coroutines.delay

/** Debounce delay before a typed query auto-searches, matching the PWA/iOS live-search feel. */
private const val SEARCH_DEBOUNCE_MS = 250L

@Composable
internal fun ProjectFileBrowserPane(
    entry: ProjectWorkspaceEntry,
    rootPath: String,
    searchText: String,
    showingSearch: Boolean,
    canBrowse: Boolean,
    canSearch: Boolean,
    canOpenFile: Boolean,
    canMutate: Boolean,
    mutating: Boolean,
    onSearchTextChange: (String) -> Unit,
    onSearch: () -> Unit,
    onClearSearch: () -> Unit,
    onOpenDirectory: (String) -> Unit,
    onOpenFile: (String) -> Unit,
    onMutation: (ProjectEntryMutation) -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusManager = LocalFocusManager.current
    val loadingDescription = stringResource(R.string.workspace_loading_files)
    val submitSearch = {
        focusManager.clearFocus()
        onSearch()
    }
    // Live search: debounce so every keystroke doesn't trigger a request, but never require an
    // explicit submit. Keyed on searchText, so Compose cancels the pending delay on the next
    // keystroke and on leaving this pane (tab switch/back) unmounts it entirely.
    LaunchedEffect(searchText) {
        if (searchText.isBlank()) {
            if (showingSearch) onClearSearch()
        } else if (canSearch) {
            delay(SEARCH_DEBOUNCE_MS)
            onSearch()
        }
    }
    Column(modifier.fillMaxSize()) {
        PoracodeTextField(
            value = searchText,
            onValueChange = onSearchTextChange,
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            enabled = canSearch,
            singleLine = true,
            label = { Text(stringResource(R.string.workspace_search_files)) },
            leadingIcon = { Icon(PoracodeIcons.Search, contentDescription = null) },
            trailingIcon = {
                Row {
                    if (showingSearch || searchText.isNotEmpty()) {
                        IconButton(onClick = onClearSearch) {
                            Icon(
                                PoracodeIcons.Clear,
                                contentDescription = stringResource(
                                    R.string.workspace_clear_search,
                                ),
                            )
                        }
                    }
                    IconButton(
                        onClick = submitSearch,
                        enabled = canSearch && searchText.isNotBlank(),
                    ) {
                        Icon(
                            PoracodeIcons.Search,
                            contentDescription = stringResource(R.string.workspace_search_action),
                        )
                    }
                }
            },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { submitSearch() }),
        )
        if (!showingSearch) {
            DirectoryBreadcrumb(
                entry.tree?.directoryPath.orEmpty(),
                enabled = canBrowse,
                onUp = onOpenDirectory,
                actions = {
                    ProjectDirectoryActions(
                        entry.tree?.directoryPath.orEmpty(),
                        canMutate && !mutating,
                        onMutation,
                    )
                },
            )
        } else {
            val result = entry.searchResult
            Text(
                stringResource(
                    R.string.workspace_search_summary,
                    result?.entries?.size ?: 0,
                    result?.totalIndexed ?: 0,
                ),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        HorizontalDivider()
        if (entry.loadingTree || entry.searching) {
            LinearProgressIndicator(
                Modifier.fillMaxWidth().semantics {
                    contentDescription = loadingDescription
                },
            )
        }
        val entries = if (showingSearch) entry.searchResult?.entries else entry.tree?.entries
        if (entries.isNullOrEmpty() && !(entry.loadingTree || entry.searching)) {
            Text(
                stringResource(
                    if (showingSearch) {
                        R.string.workspace_no_search_results
                    } else {
                        R.string.workspace_empty_folder
                    },
                ),
                modifier = Modifier.padding(24.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    bottom = WorkspaceBottomBarClearance,
                ),
            ) {
                items(entries.orEmpty(), key = { "${it.type}:${it.path}" }) { file ->
                    ProjectFileRow(
                        file, rootPath, canBrowse, canOpenFile, canMutate && !mutating,
                        onOpenDirectory, onOpenFile, onMutation,
                    )
                    HorizontalDivider(Modifier.padding(start = 52.dp))
                }
            }
        }
    }
}

@Composable
private fun DirectoryBreadcrumb(
    path: String,
    enabled: Boolean,
    onUp: (String) -> Unit,
    actions: @Composable () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = { onUp(projectParentPath(path)) }, enabled = enabled && path.isNotEmpty()) {
            Icon(
                PoracodeIcons.ArrowUpward,
                contentDescription = stringResource(R.string.workspace_up_folder),
            )
        }
        Text(
            path.ifEmpty { stringResource(R.string.workspace_root_folder) },
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.labelLarge,
        )
        actions()
    }
}

@Composable
@OptIn(ExperimentalFoundationApi::class)
private fun ProjectFileRow(
    file: ProjectFileEntry,
    rootPath: String,
    canBrowse: Boolean,
    canOpenFile: Boolean,
    canMutate: Boolean,
    onOpenDirectory: (String) -> Unit,
    onOpenFile: (String) -> Unit,
    onMutation: (ProjectEntryMutation) -> Unit,
) {
    val directory = file.type == ProjectFileEntryType.Directory
    val enabled = if (directory) canBrowse else canOpenFile
    val description = stringResource(
        if (directory) {
            R.string.workspace_open_folder_description
        } else {
            R.string.workspace_open_file_description
        },
        file.name,
    )
    var rowMenuExpanded by remember(file.path) { mutableStateOf(false) }
    val actionsLabel = stringResource(R.string.workspace_file_actions, file.name)
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .combinedClickable(
                enabled = enabled,
                onClickLabel = actionsLabel,
                onLongClickLabel = actionsLabel,
                onClick = {
                    if (directory) onOpenDirectory(file.path) else onOpenFile(file.path)
                },
                onLongClick = { rowMenuExpanded = true },
            )
            .semantics {
                role = Role.Button
                contentDescription = description
            },
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (directory) PoracodeIcons.Folder else PoracodeIcons.Description,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            WorkspaceMetadata(file.name, file.path, Modifier.weight(1f))
            ProjectFileRowActions(
                expanded = rowMenuExpanded,
                onDismiss = { rowMenuExpanded = false },
                entry = file,
                rootPath = rootPath,
                enabled = canMutate,
                onMutation = onMutation,
            )
            Icon(PoracodeIcons.KeyboardArrowRight, contentDescription = null)
        }
    }
}
