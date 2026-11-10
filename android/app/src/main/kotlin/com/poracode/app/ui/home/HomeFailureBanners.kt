package com.poracode.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

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
    val colors = PoracodeTheme.colors
    val errorDescription = stringResource(R.string.error_prefix, error)
    Row(
        modifier = Modifier
            .padding(horizontal = PoracodeMetrics.pageInline, vertical = 4.dp)
            .fillMaxWidth()
            .background(colors.danger.copy(alpha = 0.12f), RoundedCornerShape(PoracodeRadius.row))
            .padding(horizontal = 10.dp, vertical = 8.dp)
            .clearAndSetSemantics { contentDescription = errorDescription },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            PoracodeIcons.ErrorOutline,
            contentDescription = null,
            tint = colors.danger,
            modifier = Modifier.size(14.dp),
        )
        Text(error, color = colors.danger, style = PoracodeTextStyles.rowDescription)
    }
}
