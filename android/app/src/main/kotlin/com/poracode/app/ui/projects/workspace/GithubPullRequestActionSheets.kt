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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.protocol.github.GithubProcedure
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

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
    onSubmit: (GithubProcedure, Map<String, JsonElement>) -> Unit,
) {
    var decision by remember(sheet) { mutableStateOf(ReviewDecision.Comment) }
    var method by remember(sheet) { mutableStateOf(MergeMethod.Merge) }
    var admin by remember(sheet) { mutableStateOf(false) }
    var body by remember(sheet) { mutableStateOf("") }
    val trimmedBody = body.trim()
    val valid = when (sheet) {
        PullRequestActionSheet.Review ->
            decision == ReviewDecision.Approve || trimmedBody.isNotEmpty()
        PullRequestActionSheet.Comment -> trimmedBody.isNotEmpty()
        PullRequestActionSheet.Merge -> true
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
                        options = ReviewDecision.entries,
                        selected = decision,
                        label = { stringResource(it.label) },
                        onSelect = { decision = it },
                    )
                    BodyEditor(body) { body = it }
                }

                PullRequestActionSheet.Comment -> BodyEditor(body) { body = it }

                PullRequestActionSheet.Merge -> {
                    SegmentedChoice(
                        options = MergeMethod.entries,
                        selected = method,
                        label = { stringResource(it.label) },
                        onSelect = { method = it },
                    )
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
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TextButton(onDismiss, Modifier.weight(1f)) {
                    Text(stringResource(R.string.git_cancel))
                }
                Button(
                    onClick = {
                        onSubmit(
                            procedure(sheet),
                            fields(sheet, decision, method, admin, trimmedBody),
                        )
                        onDismiss()
                    },
                    enabled = enabled && valid,
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
