package com.poracode.app.ui.projects.workspace

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.GithubMutationOutcome

@Composable
internal fun GithubOutcomeBanner(outcome: GithubMutationOutcome?) {
    val reconciliation = outcome as? GithubMutationOutcome.Reconciled ?: return
    Text(
        stringResource(
            if (reconciliation.authoritativeResult == null) {
                R.string.git_change_unknown
            } else {
                R.string.github_change_reconciled
            },
        ),
        Modifier.padding(16.dp),
        color = MaterialTheme.colorScheme.error,
    )
}
