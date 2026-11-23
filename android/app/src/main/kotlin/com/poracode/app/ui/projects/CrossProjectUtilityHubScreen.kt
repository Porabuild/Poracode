package com.poracode.app.ui.projects

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.RemoteGitPrSummary
import com.poracode.app.model.RemoteProject
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeChip
import com.poracode.app.ui.components.PoracodeInlineSearchField
import com.poracode.app.ui.components.PoracodeSegmentedControl
import com.poracode.app.ui.components.PoracodeTopAppBar
import com.poracode.app.ui.components.rememberPredictiveBackModifier
import com.poracode.app.ui.home.HomeProjectUtility
import com.poracode.app.ui.home.supports
import com.poracode.app.ui.home.utilityLabel
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

internal data class CrossProjectPrRow(
    val project: RemoteProject,
    val branch: String,
    val pr: RemoteGitPrSummary,
)

@Composable
internal fun HomeUtilityOverlay(
    utility: HomeProjectUtility,
    state: com.poracode.app.session.AppSession.UiState,
    projectOptions: List<com.poracode.app.ui.home.HomeProjectFilterOption>,
    onDismiss: () -> Unit,
    onOpenProjectUtility: (com.poracode.app.model.ClientConnectionId, String, HomeProjectUtility) -> Unit,
) {
    val matchingProjects = projectOptions.filter {
        it.connectionId == state.hostCatalog.selectedConnectionId &&
            utility.supports(it.project)
    }
    if (utility == HomeProjectUtility.PullRequests ||
        utility == HomeProjectUtility.GithubActions ||
        utility == HomeProjectUtility.Notes
    ) {
        val prRows = matchingProjects.flatMap { opt ->
            state.hostReplay.gitSummaryByTarget.entries
                .filter { (key, summary) -> key.projectId == opt.project.id && summary.pr != null }
                .mapNotNull { (_, summary) ->
                    summary.pr?.let { pr ->
                        CrossProjectPrRow(
                            project = opt.project,
                            branch = summary.branch.orEmpty().ifBlank { "HEAD" },
                            pr = pr,
                        )
                    }
                }
        }
        androidx.compose.material3.Surface(Modifier.fillMaxSize()) {
            CrossProjectUtilityHubScreen(
                utility = utility,
                projects = matchingProjects.map { it.project },
                pullRequests = prRows,
                onOpenProjectUtility = { selectedProj, targetUtility ->
                    val connId = state.hostCatalog.selectedConnectionId
                    onDismiss()
                    if (connId != null) {
                        onOpenProjectUtility(connId, selectedProj.id, targetUtility)
                    }
                },
                onBack = onDismiss,
            )
        }
    } else {
        com.poracode.app.ui.home.HomeProjectUtilityPicker(
            utility = utility,
            projects = matchingProjects,
            onDismiss = onDismiss,
            onSelect = { option ->
                onDismiss()
                onOpenProjectUtility(option.connectionId, option.project.id, utility)
            },
        )
    }
}

/**
 * Unified cross-project hub for Pull Requests, GitHub Actions, and Notes from Home,
 * mirroring PWA `MobileUtilityPage` and iOS `PullRequestsPageView` / `GitHubActionsProjectsView` / `ProjectNotesPageView`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CrossProjectUtilityHubScreen(
    utility: HomeProjectUtility,
    projects: List<RemoteProject>,
    pullRequests: List<CrossProjectPrRow>,
    onOpenProjectUtility: (RemoteProject, HomeProjectUtility) -> Unit,
    onBack: () -> Unit,
) {
    val colors = PoracodeTheme.colors
    var query by rememberSaveable(utility.name) { mutableStateOf("") }
    var filterIndex by rememberSaveable(utility.name) { mutableStateOf(0) }
    var selectedProjectId by rememberSaveable(utility.name) { mutableStateOf<String?>(null) }
    val backModifier = rememberPredictiveBackModifier(enabled = true, onBack = onBack)

    val filteredPrs = remember(pullRequests, query, filterIndex, selectedProjectId) {
        val needle = query.trim().lowercase()
        pullRequests.filter { row ->
            if (selectedProjectId != null && row.project.id != selectedProjectId) return@filter false
            val stateMatches = when (filterIndex) {
                1 -> !row.pr.isDraft && row.pr.state.equals("OPEN", ignoreCase = true)
                2 -> row.pr.isDraft
                else -> true
            }
            if (!stateMatches) return@filter false
            if (needle.isEmpty()) true
            else listOf(row.project.name, row.branch, row.pr.title, "#${row.pr.number}")
                .any { it.lowercase().contains(needle) }
        }
    }

    val filteredProjects = remember(projects, query) {
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) projects
        else projects.filter { it.name.lowercase().contains(needle) }
    }

    Scaffold(
        modifier = backModifier,
        topBar = {
            PoracodeTopAppBar(
                title = { Text(utilityLabel(utility)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(PoracodeIcons.ArrowBack, stringResource(R.string.back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            PoracodeInlineSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = stringResource(R.string.hub_search_placeholder),
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
            if (utility == HomeProjectUtility.PullRequests) {
                PoracodeSegmentedControl(
                    options = listOf(
                        stringResource(R.string.hub_filter_all),
                        stringResource(R.string.hub_filter_open),
                        stringResource(R.string.hub_filter_draft),
                    ),
                    selectedIndex = filterIndex,
                    onSelect = { filterIndex = it },
                    modifier = Modifier.fillMaxWidth(),
                )
                if (projects.size > 1) {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        PoracodeChip(
                            text = stringResource(R.string.home_all_projects),
                            selected = selectedProjectId == null,
                            onClick = { selectedProjectId = null },
                        )
                        projects.forEach { project ->
                            PoracodeChip(
                                text = project.name,
                                selected = selectedProjectId == project.id,
                                onClick = {
                                    selectedProjectId = if (selectedProjectId == project.id) null else project.id
                                },
                            )
                        }
                    }
                }
                if (filteredPrs.isNotEmpty()) {
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(filteredPrs, key = { "${it.project.id}:${it.pr.number}" }) { row ->
                            PoracodeCard(modifier = Modifier.clickable { onOpenProjectUtility(row.project, utility) }) {
                                Row(
                                    Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(
                                            "#${row.pr.number} ${row.pr.title}",
                                            style = PoracodeTextStyles.rowTitle,
                                            color = colors.foreground,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        Text(
                                            "${row.project.name} · ${row.branch}",
                                            style = PoracodeTextStyles.rowDescription,
                                            color = colors.muted,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                    Icon(
                                        PoracodeIcons.KeyboardArrowRight,
                                        contentDescription = null,
                                        tint = colors.muted,
                                    )
                                }
                            }
                        }
                    }
                } else {
                    Text(
                        stringResource(R.string.hub_select_project_hint),
                        style = PoracodeTextStyles.rowDescription,
                        color = colors.muted,
                    )
                    HubProjectList(
                        projects = filteredProjects,
                        utility = utility,
                        onOpen = { onOpenProjectUtility(it, utility) },
                        modifier = Modifier.weight(1f),
                    )
                }
            } else {
                HubProjectList(
                    projects = filteredProjects,
                    utility = utility,
                    onOpen = { onOpenProjectUtility(it, utility) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun HubProjectList(
    projects: List<RemoteProject>,
    utility: HomeProjectUtility,
    onOpen: (RemoteProject) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    if (projects.isEmpty()) {
        EmptyStateView(
            stringResource(R.string.projects_empty_title),
            stringResource(R.string.projects_empty_message),
            modifier = modifier,
        )
        return
    }
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(projects, key = { it.id }) { project ->
            PoracodeCard(modifier = Modifier.clickable { onOpen(project) }) {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            project.name,
                            style = PoracodeTextStyles.rowTitle,
                            color = colors.foreground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            utilityLabel(utility),
                            style = PoracodeTextStyles.rowDescription,
                            color = colors.muted,
                        )
                    }
                    Icon(
                        PoracodeIcons.KeyboardArrowRight,
                        contentDescription = null,
                        tint = colors.muted,
                    )
                }
            }
        }
    }
}
