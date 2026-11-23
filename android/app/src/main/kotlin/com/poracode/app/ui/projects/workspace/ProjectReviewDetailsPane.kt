package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.GitStatusResult
import com.poracode.app.model.RemoteGitPrSummary
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Heavy-review summary pane inside the project Git workspace, mirroring iOS
 * `ProjectReviewDetailsView.swift`.
 */
@Composable
internal fun ProjectReviewDetailsPane(
    projectName: String,
    status: GitStatusResult?,
    pullRequest: RemoteGitPrSummary?,
    sourceBranch: String?,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp),
        contentPadding = PaddingValues(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (pullRequest != null) {
            item(key = "pr-summary") {
                PoracodeCard {
                    Text(
                        "#${pullRequest.number} ${pullRequest.title}",
                        style = PoracodeTextStyles.sheetTitle,
                        color = colors.foreground,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            pullRequest.state,
                            style = PoracodeTextStyles.rowDescription,
                            color = colors.muted,
                        )
                        if (pullRequest.isDraft) {
                            Text(
                                stringResource(R.string.hub_filter_draft),
                                style = PoracodeTextStyles.rowDescription,
                                color = colors.muted,
                            )
                        }
                        pullRequest.checksStatus?.takeIf(String::isNotBlank)?.let { checks ->
                            Text(checks, style = PoracodeTextStyles.rowDescription, color = colors.muted)
                        }
                    }
                    sourceBranch?.takeIf(String::isNotBlank)?.let { base ->
                        Text(
                            stringResource(R.string.git_source_branch) + ": $base",
                            style = PoracodeTextStyles.rowDescription,
                            color = colors.muted,
                        )
                    }
                }
            }
        } else {
            item(key = "pr-empty") {
                EmptyStateView(
                    stringResource(R.string.review_details_no_pr_title),
                    stringResource(R.string.review_details_no_pr_description),
                )
            }
        }
        item(key = "project-git") {
            PoracodeCard {
                Text(projectName, style = PoracodeTextStyles.rowTitle, color = colors.foreground)
                status?.let { git ->
                    Text(
                        stringResource(R.string.workspace_branch, git.branch),
                        style = PoracodeTextStyles.rowDescription,
                        color = colors.muted,
                    )
                    Text(
                        stringResource(
                            R.string.review_details_changes_summary,
                            git.staged.size,
                            git.unstaged.size,
                            git.conflictFiles.orEmpty().size,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.muted,
                    )
                }
            }
        }
    }
}
