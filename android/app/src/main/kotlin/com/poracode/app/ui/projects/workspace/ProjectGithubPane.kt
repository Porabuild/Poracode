package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.GithubRequests
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.protocol.github.GithubProcedure
import com.poracode.app.session.projects.GithubOperationsController
import com.poracode.app.session.projects.GithubOperationsEntry
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private enum class GithubPaneSection { PullRequests, Actions, Repositories }

@Composable
internal fun ProjectGithubPane(
    controller: GithubOperationsController,
    target: ProjectWorkspaceTarget,
    canRead: Boolean,
    canOperate: Boolean,
    expanded: Boolean,
    modifier: Modifier = Modifier,
) {
    val state by controller.state.collectAsStateWithLifecycle()
    val entry = state.entries[target.identity] ?: GithubOperationsEntry()
    val gate = githubUiGate(
        canRead,
        canOperate,
        entry.available,
        entry.loading,
        entry.activeMutation != null,
    )
    val scope = rememberCoroutineScope()
    var sectionName by rememberSaveable(target.identity) {
        mutableStateOf(GithubPaneSection.PullRequests.name)
    }
    val section = GithubPaneSection.valueOf(sectionName)
    Column(modifier.fillMaxSize()) {
        if (entry.loading || entry.activeMutation != null) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (entry.available == false) {
            Text(
                stringResource(R.string.github_unavailable),
                Modifier.padding(16.dp),
                color = MaterialTheme.colorScheme.error,
            )
        }
        GithubOutcomeBanner(entry.lastOutcome)
        if (entry.failure != null) ProjectWorkspaceFailureCard(entry.failure, modifier = Modifier)
        PrimaryTabRow(section.ordinal) {
            GithubPaneSection.entries.forEach { candidate ->
                Tab(
                    selected = section == candidate,
                    onClick = { sectionName = candidate.name },
                    text = { Text(githubSectionLabel(candidate)) },
                    enabled = gate.canRead,
                )
            }
        }
        when (section) {
            GithubPaneSection.PullRequests -> GithubPullRequestsPane(
                entry, target, controller, gate.canRead, gate.canMutate, expanded,
            )
            GithubPaneSection.Actions -> GithubActionsPane(
                entry, target, controller, gate.canRead, gate.canMutate, expanded,
            )
            GithubPaneSection.Repositories -> GithubRepositoriesPane(
                entry, target, controller, gate.canRead,
            )
        }
    }
    if (entry.pendingConfirmation != null) {
        AlertDialog(
            onDismissRequest = { controller.dismissConfirmation(target.identity) },
            title = { Text(stringResource(R.string.github_confirm_title)) },
            text = { Text(stringResource(R.string.github_confirm_message)) },
            confirmButton = {
                TextButton(onClick = { scope.launch { controller.confirm(target) } }) {
                    Text(stringResource(R.string.github_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { controller.dismissConfirmation(target.identity) }) {
                    Text(stringResource(R.string.git_cancel))
                }
            },
        )
    }
}

@Composable
private fun GithubPullRequestsPane(
    entry: GithubOperationsEntry,
    target: ProjectWorkspaceTarget,
    controller: GithubOperationsController,
    canRead: Boolean,
    canOperate: Boolean,
    expanded: Boolean,
) {
    val scope = rememberCoroutineScope()
    var selectedNumber by rememberSaveable(target.identity) { mutableLongStateOf(0L) }
    var selectedBranch by rememberSaveable(target.identity) { mutableStateOf("") }
    val rows = remember(entry.pullRequests) { entry.pullRequests.pullRequestRows() }
    val list: @Composable (Modifier) -> Unit = { modifier ->
        LazyColumn(modifier) {
            item("pr-actions") {
                OutlinedButton(
                    onClick = { scope.launch { controller.refresh(target) } },
                    enabled = canRead && !entry.loading,
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                ) { Text(stringResource(R.string.github_refresh)) }
                GithubCreatePullRequest(target, controller, canOperate && entry.activeMutation == null)
            }
            if (rows.isEmpty()) item("empty") {
                Text(stringResource(R.string.github_no_pull_requests), Modifier.padding(20.dp))
            }
            items(rows.take(MAX_GITHUB_ROWS), key = { it.number }) { row ->
                Column(
                    Modifier.fillMaxWidth().clickable(enabled = canRead) {
                        selectedNumber = row.number
                        selectedBranch = row.branch
                        scope.launch { controller.selectPullRequest(target, row.number, row.branch) }
                    }.semantics { role = Role.Button }.padding(16.dp),
                ) {
                    Text(row.title, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(
                        stringResource(R.string.github_pr_summary, row.number, row.branch, row.state),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                HorizontalDivider()
            }
        }
    }
    val detail: @Composable (Modifier) -> Unit = { modifier ->
        GithubPullRequestDetail(
            entry, target, controller, selectedNumber, selectedBranch,
            canOperate && entry.activeMutation == null, modifier,
        )
    }
    AdaptiveGithubSplit(expanded, list, detail)
}

@Composable
private fun GithubCreatePullRequest(
    target: ProjectWorkspaceTarget,
    controller: GithubOperationsController,
    enabled: Boolean,
) {
    val scope = rememberCoroutineScope()
    var title by rememberSaveable(target.identity) { mutableStateOf("") }
    var branch by rememberSaveable(target.identity) { mutableStateOf("") }
    var base by rememberSaveable(target.identity) { mutableStateOf("") }
    Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(title, { title = it }, label = { Text(stringResource(R.string.github_pr_title)) })
        OutlinedTextField(branch, { branch = it }, label = { Text(stringResource(R.string.github_head_branch)) })
        OutlinedTextField(base, { base = it }, label = { Text(stringResource(R.string.github_base_branch)) })
        Button(
            onClick = {
                scope.launch {
                    controller.execute(
                        target,
                        GithubRequests.create(
                            GithubProcedure.CreatePr,
                            target.location,
                            mapOf(
                                "title" to JsonPrimitive(title.trim()),
                                "branch" to JsonPrimitive(branch.trim()),
                                "baseBranch" to JsonPrimitive(base.trim()),
                            ),
                        ),
                    )
                }
            },
            enabled = enabled && title.isNotBlank() && branch.isNotBlank() && base.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.github_create_pr)) }
    }
}

@Composable
private fun GithubPullRequestDetail(
    entry: GithubOperationsEntry,
    target: ProjectWorkspaceTarget,
    controller: GithubOperationsController,
    number: Long,
    branch: String,
    enabled: Boolean,
    modifier: Modifier,
) {
    if (number <= 0) {
        Text(stringResource(R.string.github_select_pr), modifier.padding(24.dp))
        return
    }
    val scope = rememberCoroutineScope()
    var comment by rememberSaveable(target.identity, number) { mutableStateOf("") }
    val mutate: (GithubProcedure, Map<String, JsonElement>) -> Unit = { procedure, fields ->
        scope.launch {
            controller.execute(
                target,
                GithubRequests.create(
                    procedure,
                    target.location,
                    mapOf("prNumber" to JsonPrimitive(number)) + fields,
                ),
            )
        }
    }
    LazyColumn(modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item("title") {
            Text(stringResource(R.string.github_pr_number, number), style = MaterialTheme.typography.titleLarge)
            Text(branch, style = MaterialTheme.typography.bodySmall)
        }
        item("mutations") {
            GithubActionButtons(
                enabled,
                listOf(
                    R.string.github_ready to { mutate(GithubProcedure.MarkPrReady, emptyMap()) },
                    R.string.github_update_branch to { mutate(GithubProcedure.UpdatePrBranch, emptyMap()) },
                    R.string.github_reopen to { mutate(GithubProcedure.ReopenPr, emptyMap()) },
                    R.string.github_close to { mutate(GithubProcedure.ClosePr, emptyMap()) },
                    R.string.github_merge to { mutate(GithubProcedure.MergePr, emptyMap()) },
                    R.string.github_approve to {
                        mutate(GithubProcedure.SubmitPrReview, mapOf("decision" to JsonPrimitive("approve")))
                    },
                ),
            )
            OutlinedTextField(
                comment,
                { comment = it },
                label = { Text(stringResource(R.string.github_comment)) },
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { mutate(GithubProcedure.PostPrComment, mapOf("body" to JsonPrimitive(comment.trim()))) },
                enabled = enabled && comment.isNotBlank(),
            ) { Text(stringResource(R.string.github_post_comment)) }
        }
        githubJsonSection(R.string.github_details, entry.prDetails, "details")
        githubJsonSection(R.string.github_checks, entry.prChecks, "checks")
        githubJsonSection(R.string.github_files, entry.prFiles, "files")
        githubJsonSection(R.string.github_reviews, entry.prReviews, null)
        githubJsonSection(R.string.github_diff, entry.prDiff, "diff", monospace = true)
    }
}

@Composable
private fun GithubActionsPane(
    entry: GithubOperationsEntry,
    target: ProjectWorkspaceTarget,
    controller: GithubOperationsController,
    canRead: Boolean,
    canOperate: Boolean,
    expanded: Boolean,
) {
    val scope = rememberCoroutineScope()
    var workflowId by rememberSaveable(target.identity) { mutableLongStateOf(0L) }
    var runId by rememberSaveable(target.identity) { mutableLongStateOf(0L) }
    val workflows = remember(entry.workflows) { entry.workflows.workflowRows() }
    val runs = remember(entry.workflowRuns) { entry.workflowRuns.runRows() }
    val list: @Composable (Modifier) -> Unit = { modifier ->
        LazyColumn(modifier) {
            item("refresh") {
                OutlinedButton(
                    onClick = { scope.launch { controller.refresh(target) } },
                    enabled = canRead && !entry.loading,
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                ) { Text(stringResource(R.string.github_refresh)) }
            }
            items(workflows.take(MAX_GITHUB_ROWS), key = { "w${it.id}" }) { workflow ->
                Text(
                    workflow.name,
                    Modifier.fillMaxWidth().clickable(enabled = canRead) {
                        workflowId = workflow.id
                        scope.launch { controller.selectWorkflow(target, workflow.id) }
                    }.semantics { role = Role.Button }.padding(16.dp),
                )
            }
            items(runs.take(MAX_GITHUB_ROWS), key = { "r${it.id}" }) { run ->
                Column(
                    Modifier.fillMaxWidth().clickable(enabled = canRead) {
                        runId = run.id
                        scope.launch { controller.selectWorkflowRun(target, run.id) }
                    }.semantics { role = Role.Button }.padding(16.dp),
                ) {
                    Text(run.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(run.status, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
    val detail: @Composable (Modifier) -> Unit = { modifier ->
        GithubWorkflowDetail(
            entry, target, controller, workflowId, runId,
            canOperate && entry.activeMutation == null, modifier,
        )
    }
    AdaptiveGithubSplit(expanded, list, detail)
}

@Composable
private fun GithubRepositoriesPane(
    entry: GithubOperationsEntry,
    target: ProjectWorkspaceTarget,
    controller: GithubOperationsController,
    canRead: Boolean,
) {
    val scope = rememberCoroutineScope()
    val accounts = remember(entry.accounts) { entry.accounts.arrayObjects("accounts") }
    val repos = remember(entry.repos) { entry.repos.arrayObjects("repos") }
    LazyColumn(Modifier.fillMaxSize()) {
        item("discover") {
            OutlinedButton(
                onClick = { scope.launch { controller.discoverAccounts(target) } },
                enabled = canRead && !entry.loading,
                modifier = Modifier.fillMaxWidth().padding(12.dp),
            ) { Text(stringResource(R.string.github_discover_accounts)) }
        }
        items(accounts.take(MAX_GITHUB_ROWS), key = { it.string("host") + it.string("login") }) { account ->
            Text(
                stringResource(R.string.github_account, account.string("login"), account.string("host")),
                Modifier.fillMaxWidth().clickable(enabled = canRead) {
                    scope.launch { controller.discoverRepos(target, account) }
                }.semantics { role = Role.Button }.padding(16.dp),
            )
        }
        items(repos.take(MAX_GITHUB_ROWS), key = { it.string("nameWithOwner") }) { repo ->
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Text(repo.string("nameWithOwner"))
                Text(
                    repo.string("description"),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
internal fun GithubActionButtons(
    enabled: Boolean,
    actions: List<Pair<Int, () -> Unit>>,
    validity: List<Boolean> = List(actions.size) { true },
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        actions.chunked(2).forEachIndexed { rowIndex, row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEachIndexed { columnIndex, (label, action) ->
                    val index = rowIndex * 2 + columnIndex
                    OutlinedButton(
                        onClick = action,
                        enabled = enabled && validity[index],
                        modifier = Modifier.weight(1f),
                    ) { Text(stringResource(label)) }
                }
            }
        }
    }
}

internal fun androidx.compose.foundation.lazy.LazyListScope.githubJsonSection(
    title: Int,
    value: JsonElement?,
    child: String?,
    monospace: Boolean = false,
) {
    if (value == null) return
    item("json-$title") {
        Text(stringResource(title), style = MaterialTheme.typography.titleMedium)
        val content = (if (child == null) value else (value as? JsonObject)?.get(child))
            ?.toString().orEmpty().take(MAX_GITHUB_TEXT)
        Text(
            content,
            fontFamily = if (monospace) FontFamily.Monospace else null,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun AdaptiveGithubSplit(
    expanded: Boolean,
    list: @Composable (Modifier) -> Unit,
    detail: @Composable (Modifier) -> Unit,
) {
    if (expanded) {
        Row(Modifier.fillMaxSize()) {
            list(Modifier.width(360.dp).fillMaxSize())
            VerticalDivider()
            detail(Modifier.weight(1f).fillMaxSize())
        }
    } else {
        Column(Modifier.fillMaxSize()) {
            list(Modifier.weight(0.45f).fillMaxWidth())
            HorizontalDivider()
            detail(Modifier.weight(0.55f).fillMaxWidth())
        }
    }
}

@Composable
private fun githubSectionLabel(section: GithubPaneSection) = stringResource(
    when (section) {
        GithubPaneSection.PullRequests -> R.string.github_pull_requests
        GithubPaneSection.Actions -> R.string.github_actions
        GithubPaneSection.Repositories -> R.string.github_repositories
    },
)
