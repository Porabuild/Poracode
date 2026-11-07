package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.GithubRequests
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.protocol.forge.ForgeReviewOperation
import com.poracode.app.protocol.github.GithubProcedure
import com.poracode.app.session.projects.GithubOperationsController
import com.poracode.app.session.projects.GithubOperationsEntry
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@Composable
internal fun GithubPullRequestDetail(
    entry: GithubOperationsEntry,
    target: ProjectWorkspaceTarget,
    controller: GithubOperationsController,
    number: Long,
    branch: String,
    state: String,
    source: JsonObject?,
    guideWriters: List<AgentStatusEntry>,
    enabled: Boolean,
    modifier: Modifier,
) {
    val scope = rememberCoroutineScope()
    val forgeState by controller.forgeReview.state.collectAsStateWithLifecycle()
    val forge = forgeState[target.identity]?.takeIf { it.number == number && it.source == source }
    val displayEntry = if (source == null) entry else entry.copy(
        prDetails = forge?.documents?.get(ForgeReviewOperation.GetPrDetails),
        prFiles = forge?.documents?.get(ForgeReviewOperation.GetPrFiles),
        prDiff = forge?.documents?.get(ForgeReviewOperation.GetPrDiff),
        prReviews = forge?.documents?.get(ForgeReviewOperation.GetPrReviewComments), prChecks = null,
    )
    val mayMutate = enabled && (source == null || (forge != null && !forge.isCached && !forge.loading && !forge.mutating))
    var sheetName by rememberSaveable(target.identity, number) { mutableStateOf("") }
    var pending by remember(target.identity, number, source) { mutableStateOf<Pair<ForgeReviewOperation, Map<String, JsonElement>>?>(null) }
    suspend fun submit(procedure: GithubProcedure, fields: Map<String, JsonElement>): Boolean {
        if (source != null) {
            if (forge == null) return false
            var operation = ForgeReviewOperation.entries.single { it.wireName == "forge" + procedure.wireName.removePrefix("gh") }
            var scopedFields = fields
            if (operation == ForgeReviewOperation.MergePr && forge.capabilities.boolean("expectedHeadMerge")) {
                val sha = (forge.documents[ForgeReviewOperation.GetPrDetails] as? JsonObject)?.get("pr")
                    ?.let { it as? JsonObject }?.get("headSha") ?: return false
                operation = ForgeReviewOperation.MergePrAtHead
                scopedFields = fields + ("expectedHeadSha" to sha)
            }
            if (GithubRequests.create(procedure, target.location, fields).requiresConfirmation) {
                pending = operation to scopedFields
                return true
            }
            return controller.forgeReview.mutate(target, forge, operation, scopedFields)
        }
        return when (controller.execute(target, GithubRequests.create(procedure, target.location,
            mapOf("prNumber" to JsonPrimitive(number)) + fields))) {
            is com.poracode.app.session.projects.GithubExecutionResult.Completed,
            com.poracode.app.session.projects.GithubExecutionResult.ConfirmationRequired -> true
            else -> false
        }
    }
    val metadata = if (forge == null) ReviewMetadataActions.None else ReviewMetadataActions(
        editing = reviewMetadataEditing(forge),
        enabled = mayMutate,
        candidates = { operation, fields -> controller.forgeReview.readCandidates(target, forge, operation, fields) },
        write = { operation, fields -> controller.forgeReview.mutate(target, forge, operation, fields) },
    )
    val detailsPr = (displayEntry.prDetails as? JsonObject)?.child("pr")
    val effectiveState = detailsPr?.string("state")?.takeIf(String::isNotBlank) ?: state
    val availability = pullRequestActionAvailability(
        effectiveState,
        detailsPr?.boolean("isDraft") ?: (effectiveState == "draft"),
    )
    val mutate: (GithubProcedure, Map<String, JsonElement>) -> Unit = { procedure, fields -> scope.launch { submit(procedure, fields) }; Unit }
    Column(modifier.fillMaxSize()) {
        if (forge?.loading == true || forge?.mutating == true) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (forge?.isCached == true) Text(stringResource(R.string.settings_status_offline), Modifier.padding(12.dp), style = MaterialTheme.typography.labelMedium)
        forge?.failure?.let { ProjectWorkspaceFailureCard(it, modifier = Modifier) }
        GithubPullRequestDetailPane(displayEntry, number, branch, Modifier.weight(1f).fillMaxWidth(), forge,
            mayMutate, guideWriters.filter { status -> when (val location = target.location) {
                is com.poracode.app.model.WslProjectLocation -> status.envKind == "wsl" && status.envDistro == location.distro
                is com.poracode.app.model.WindowsProjectLocation -> status.envKind == "windows" || status.envKind.isEmpty()
                is com.poracode.app.model.PosixProjectLocation -> status.envKind == "posix" || status.envKind.isEmpty()
            } }, { operation, fields ->
                if (forge != null) scope.launch { controller.forgeReview.mutate(target, forge, operation, fields) }
            }, { controller.forgeReview.refreshGuide(target) }, { sheetName = PullRequestActionSheet.Review.name },
            { fields -> forge != null && controller.forgeReview.mutate(target, forge, ForgeReviewOperation.EditPrComment, fields) },
            metadata)
        if (number > 0) {
            HorizontalDivider()
            Column(Modifier.padding(12.dp)) {
                GithubActionButtons(
                    mayMutate,
                    listOfNotNull(
                        if (!availability.review || source != null && forge?.capabilities?.objectsOrValues("reviewDecisions")?.isEmpty() != false) null else
                        R.string.github_submit_review to {
                            sheetName = PullRequestActionSheet.Review.name
                        },
                        R.string.github_post_comment to {
                            sheetName = PullRequestActionSheet.Comment.name
                        },
                        if (!availability.merge || source != null && forge?.capabilities?.objectsOrValues("mergeMethods")?.isEmpty() != false) null else R.string.github_merge to { sheetName = PullRequestActionSheet.Merge.name },
                        if (!availability.ready || source != null && forge?.capabilities?.boolean("draft") != true) null else R.string.github_ready to { mutate(GithubProcedure.MarkPrReady, emptyMap()) },
                        if (!availability.updateBranch || source != null && forge?.capabilities?.boolean("updateBranch") != true && forge?.capabilities?.boolean("rebaseBranch") != true) null else R.string.github_update_branch to {
                            mutate(GithubProcedure.UpdatePrBranch, mapOf("rebase" to JsonPrimitive(source != null && forge?.capabilities?.boolean("updateBranch") != true)))
                        },
                        if (!availability.reopen || source != null && forge?.capabilities?.boolean("reopen") != true) null else R.string.github_reopen to { mutate(GithubProcedure.ReopenPr, emptyMap()) },
                        if (!availability.convertToDraft || !metadata.editing.convertToDraft) null else R.string.forge_review_convert_to_draft to {
                            scope.launch { metadata.write(ForgeReviewOperation.ConvertPrToDraft, emptyMap()) }; Unit
                        },
                        if (!availability.close) null else R.string.github_close to { mutate(GithubProcedure.ClosePr, emptyMap()) },
                    ),
                )
            }
        }
    }
    if (sheetName.isNotEmpty()) {
        PullRequestActionSheetHost(
            sheet = PullRequestActionSheet.valueOf(sheetName),
            enabled = mayMutate,
            capabilities = if (source == null) null else forge?.capabilities,
            onDismiss = { sheetName = "" },
            onSubmit = { procedure, fields -> submit(procedure, fields) },
        )
    }
    if (pending != null) {
        AlertDialog(onDismissRequest = { pending = null },
            title = { Text(stringResource(R.string.github_confirm_title)) },
            text = { Text(stringResource(R.string.github_confirm_message)) },
            confirmButton = { TextButton(onClick = {
                val request = pending ?: return@TextButton
                pending = null
                if (forge != null) scope.launch { controller.forgeReview.mutate(target, forge, request.first, request.second) }
            }, enabled = mayMutate) { Text(stringResource(R.string.github_confirm)) } },
            dismissButton = { TextButton({ pending = null }) { Text(stringResource(R.string.git_cancel)) } })
    }
}

private fun JsonObject.objectsOrValues(key: String) = (this[key] as? kotlinx.serialization.json.JsonArray).orEmpty()
