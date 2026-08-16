package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.poracode.app.session.projects.ProjectWorkspaceEntry

@Composable
internal fun FilesWorkspaceContent(
    entry: ProjectWorkspaceEntry,
    draft: String,
    dirty: Boolean,
    saveFailed: Boolean,
    searchText: String,
    showingSearch: Boolean,
    actions: ProjectWorkspaceActions,
    access: ProjectWorkspaceAccess,
    expanded: Boolean,
    onSearchTextChange: (String) -> Unit,
    onSearch: () -> Unit,
    onClearSearch: () -> Unit,
    onDirectory: (String) -> Unit,
    onFile: (String) -> Unit,
    onDraftChange: (String) -> Unit,
    onSave: () -> Unit,
    onReload: () -> Unit,
) {
    val browser: @Composable (Modifier) -> Unit = { paneModifier ->
        ProjectFileBrowserPane(
            entry, searchText, showingSearch, actions.canBrowse, actions.canSearch,
            actions.canOpenFile, onSearchTextChange, onSearch, onClearSearch,
            onDirectory, onFile, paneModifier,
        )
    }
    val editor: @Composable (Modifier) -> Unit = { paneModifier ->
        ProjectFileEditorPane(
            entry.openFile, draft, dirty, entry.loadingFile, entry.savingFile,
            access.canWrite, actions.canSaveFile, actions.canOpenFile, entry.failure,
            saveFailed, onDraftChange, onSave, onReload, paneModifier,
        )
    }
    if (expanded) {
        Row(Modifier.fillMaxSize()) {
            browser(Modifier.weight(0.38f).fillMaxSize())
            VerticalDivider()
            editor(Modifier.weight(0.62f).fillMaxSize())
        }
    } else {
        Column(Modifier.fillMaxSize()) {
            browser(Modifier.weight(0.44f).fillMaxWidth())
            HorizontalDivider()
            editor(Modifier.weight(0.56f).fillMaxWidth())
        }
    }
}
