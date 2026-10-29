package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.GithubRequests
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.session.projects.GithubOperationsController
import com.poracode.app.session.projects.ForgeReviewEntry
import kotlinx.coroutines.launch
import com.poracode.app.protocol.github.GithubProcedure
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray

/** The three review mutations that need structured input, mirroring the iOS review action sheet. */
internal enum class PullRequestActionSheet { Review, Comment, Merge }

private enum class ReviewDecision(val wireName: String, val label: Int) {
    Approve("approve", R.string.github_approve),
    RequestChanges("request-changes", R.string.github_request_changes),
    Comment("comment", R.string.github_comment_decision),
}

private enum class MergeMethod(val wireName: String, val label: Int) {
    Merge("merge", R.string.github_merge_method_merge),
    Squash("squash", R.string.github_merge_method_squash),
    Rebase("rebase", R.string.github_merge_method_rebase),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PullRequestActionSheetHost(
    sheet: PullRequestActionSheet,
    enabled: Boolean,
    onDismiss: () -> Unit,
    onSubmit: suspend (GithubProcedure, Map<String, JsonElement>) -> Boolean,
    capabilities: JsonObject? = null,
) {
    val scope = rememberCoroutineScope()
    var submitting by remember { mutableStateOf(false) }
    val decisions = ReviewDecision.entries.filter { capabilities == null || (capabilities["reviewDecisions"] as? JsonArray)?.contains(JsonPrimitive(it.wireName)) == true }
    val methods = MergeMethod.entries.filter { capabilities == null || (capabilities["mergeMethods"] as? JsonArray)?.contains(JsonPrimitive(it.wireName)) == true }
    var decision by remember(sheet, decisions) { mutableStateOf(decisions.firstOrNull { it == ReviewDecision.Comment } ?: decisions.firstOrNull() ?: ReviewDecision.Comment) }
    var method by remember(sheet, methods) { mutableStateOf(methods.firstOrNull() ?: MergeMethod.Merge) }
    var admin by remember(sheet) { mutableStateOf(false) }
    var body by remember(sheet) { mutableStateOf("") }
    val trimmedBody = body.trim()
    val valid = when (sheet) {
        PullRequestActionSheet.Review ->
            decision in decisions && (decision == ReviewDecision.Approve || trimmedBody.isNotEmpty())
        PullRequestActionSheet.Comment -> trimmedBody.isNotEmpty()
        PullRequestActionSheet.Merge -> method in methods
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .padding(horizontal = 20.dp)
                .padding(bottom = 20.dp)
                .navigationBarsPadding()
                .imePadding(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                stringResource(sheetTitle(sheet)),
                style = MaterialTheme.typography.titleLarge,
            )
            when (sheet) {
                PullRequestActionSheet.Review -> {
                    SegmentedChoice(
                        options = decisions,
                        selected = decision,
                        label = { stringResource(it.label) },
                        onSelect = { decision = it },
                    )
                    BodyEditor(body) { body = it }
                }

                PullRequestActionSheet.Comment -> BodyEditor(body) { body = it }

                PullRequestActionSheet.Merge -> {
                    SegmentedChoice(
                        options = methods,
                        selected = method,
                        label = { stringResource(it.label) },
                        onSelect = { method = it },
                    )
                    if (capabilities == null || capabilities.boolean("adminMerge")) {
                    val adminLabel = stringResource(R.string.github_merge_admin)
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .toggleable(admin, role = Role.Switch) { admin = it },
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(adminLabel)
                        Switch(admin, null, Modifier.clearAndSetSemantics {})
                    }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TextButton(onDismiss, Modifier.weight(1f)) {
                    Text(stringResource(R.string.git_cancel))
                }
                Button(
                    onClick = {
                        submitting = true
                        scope.launch {
                        val accepted = onSubmit(
                            procedure(sheet),
                            fields(sheet, decision, method, admin, trimmedBody),
                        )
                        submitting = false
                        if (accepted) onDismiss()
                        }
                    },
                    enabled = enabled && valid && !submitting,
                    modifier = Modifier.weight(1f),
                ) { Text(stringResource(R.string.github_submit)) }
            }
        }
    }
}

@Composable
private fun BodyEditor(value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(stringResource(R.string.github_body)) },
        modifier = Modifier.fillMaxWidth().heightIn(min = 140.dp),
    )
}

@Composable
private fun <T> SegmentedChoice(
    options: List<T>,
    selected: T,
    label: @Composable (T) -> String,
    onSelect: (T) -> Unit,
) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        options.forEachIndexed { index, option ->
            SegmentedButton(
                selected = option == selected,
                onClick = { onSelect(option) },
                shape = SegmentedButtonDefaults.itemShape(index, options.size),
            ) { Text(label(option)) }
        }
    }
}

private fun sheetTitle(sheet: PullRequestActionSheet) = when (sheet) {
    PullRequestActionSheet.Review -> R.string.github_submit_review
    PullRequestActionSheet.Comment -> R.string.github_post_comment
    PullRequestActionSheet.Merge -> R.string.github_merge
}

private fun procedure(sheet: PullRequestActionSheet) = when (sheet) {
    PullRequestActionSheet.Review -> GithubProcedure.SubmitPrReview
    PullRequestActionSheet.Comment -> GithubProcedure.PostPrComment
    PullRequestActionSheet.Merge -> GithubProcedure.MergePr
}

private fun fields(
    sheet: PullRequestActionSheet,
    decision: ReviewDecision,
    method: MergeMethod,
    admin: Boolean,
    body: String,
): Map<String, JsonElement> = when (sheet) {
    PullRequestActionSheet.Review -> buildMap {
        put("decision", JsonPrimitive(decision.wireName))
        if (body.isNotEmpty()) put("body", JsonPrimitive(body))
    }

    PullRequestActionSheet.Comment -> mapOf("body" to JsonPrimitive(body))

    PullRequestActionSheet.Merge -> mapOf(
        "method" to JsonPrimitive(method.wireName),
        "admin" to JsonPrimitive(admin),
    )
}

@Composable
internal fun GithubCreatePullRequest(
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
internal fun ForgeCommentEditor(comment: PullRequestCommentRow, threadId: String?, forge: ForgeReviewEntry?,
    canMutate: Boolean, save: suspend (Map<String, JsonElement>) -> Boolean) {
    if (forge == null || !comment.author.equals(forge.viewerLogin, ignoreCase = true) ||
        (forge.capabilities["commentEditing"] as? JsonArray)?.contains(JsonPrimitive(if (threadId == null) "conversation" else "inline")) != true) return
    var editing by rememberSaveable(forge.source, forge.number, threadId, comment.id) { mutableStateOf(false) }
    var draft by rememberSaveable(forge.source, forge.number, threadId, comment.id) { mutableStateOf("") }
    var expectedBody by rememberSaveable(forge.source, forge.number, threadId, comment.id) { mutableStateOf("") }
    var saving by remember(forge.source, forge.number, threadId, comment.id) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    if (editing) {
        OutlinedTextField(draft, { draft = it }, enabled = !forge.mutating && !saving, label = { Text(stringResource(R.string.github_body)) }, modifier = Modifier.fillMaxWidth())
        Row {
            TextButton(onClick = {
                saving = true
                scope.launch {
                    try {
                        if (save(buildMap {
                            put("commentId", JsonPrimitive(comment.id)); put("body", JsonPrimitive(draft)); put("expectedBody", JsonPrimitive(expectedBody))
                            if (threadId != null) put("threadId", JsonPrimitive(threadId))
                        })) editing = false
                    } finally { saving = false }
                }
            }, enabled = canMutate && !saving && draft.isNotBlank()) { Text(stringResource(R.string.remote_integrations_save)) }
            TextButton({ editing = false; draft = comment.body }, enabled = !forge.mutating && !saving) { Text(stringResource(R.string.git_cancel)) }
        }
    } else TextButton({ draft = comment.body; expectedBody = comment.body; editing = true }, enabled = canMutate) { Text(stringResource(R.string.forge_review_edit_comment)) }
}
