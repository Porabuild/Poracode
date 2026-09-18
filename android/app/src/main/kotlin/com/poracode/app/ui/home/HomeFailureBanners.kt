package com.poracode.app.ui.home

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R

/**
 * Inline failure banners under the home header. [globalError] carries
 * thread/action/pairing failures; [connectionError] is the connection
 * scope's own transient transport-failure claim, which a later successful
 * snapshot retires. Ownership is structural (separate UiState fields), so
 * recovery never clears an unrelated failure — identical text included.
 */
@Composable
internal fun HomeFailureBanners(
    globalError: String?,
    connectionError: String?,
) {
    HomeFailureBanner(globalError)
    HomeFailureBanner(connectionError)
}

@Composable
private fun HomeFailureBanner(error: String?) {
    if (error == null) return
    val errorDescription = stringResource(R.string.error_prefix, error)
    Text(
        error,
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .semantics { contentDescription = errorDescription },
    )
}
