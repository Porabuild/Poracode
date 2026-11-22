package com.poracode.app.ui.changelog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.ui.components.EmptyStateView
import com.poracode.app.ui.components.ErrorStateView
import com.poracode.app.ui.components.LoadingStateView
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import java.io.File
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlinx.coroutines.launch

@Composable
internal fun ReleaseNotesPane(
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val store = remember(context.applicationContext) {
        ChangelogStore(File(context.applicationContext.cacheDir, ChangelogStore.CACHE_FILE_NAME))
    }
    val state by store.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val colors = PoracodeTheme.colors

    LaunchedEffect(store) {
        store.refresh()
    }

    Box(modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Column(
            modifier = Modifier
                .widthIn(max = 760.dp)
                .fillMaxSize(),
        ) {
            if (state.loading && state.document != null) {
                LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            if (state.error != null && state.document != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        stringResource(R.string.changelog_cached_offline_notice),
                        style = PoracodeTextStyles.rowDescription,
                        color = colors.muted,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { scope.launch { store.refresh() } }) {
                        Text(stringResource(R.string.rich_chat_retry))
                    }
                }
            }

            val releases = state.document?.newestFirst.orEmpty()
            when {
                releases.isNotEmpty() -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(releases, key = { "${it.version}:${it.date}" }) { release ->
                        ReleaseNoteCard(release)
                    }
                }
                state.loading -> LoadingStateView(
                    stringResource(R.string.changelog_loading),
                    modifier = Modifier.fillMaxSize(),
                )
                state.error != null -> ErrorStateView(
                    message = stringResource(R.string.changelog_load_failed),
                    onRetry = { scope.launch { store.refresh() } },
                    modifier = Modifier.fillMaxSize(),
                )
                else -> EmptyStateView(
                    title = stringResource(R.string.changelog_empty_title),
                    message = stringResource(R.string.changelog_empty_message),
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

@Composable
private fun ReleaseNoteCard(release: ChangelogRelease) {
    val colors = PoracodeTheme.colors
    val shape = RoundedCornerShape(PoracodeRadius.contentSurface)
    val formattedDate = remember(release.date) {
        release.parsedLocalDate()
            ?.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM))
            ?: release.date
    }

    com.poracode.app.ui.components.PoracodeCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                "v${release.version.removePrefix("v")}",
                style = PoracodeTextStyles.monoSummary.copy(fontWeight = FontWeight.SemiBold),
                color = colors.foreground,
            )
            release.tagline?.let { tagline ->
                Text(
                    tagline,
                    style = PoracodeTextStyles.rowDescription,
                    color = colors.muted,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            } ?: Box(Modifier.weight(1f))
            Text(
                formattedDate,
                style = PoracodeTextStyles.monoMeta,
                color = colors.muted,
            )
        }
        Text(
            release.title,
            style = MaterialTheme.typography.titleMedium,
            color = colors.foreground,
        )
        if (release.summary.isNotBlank()) {
            Text(
                release.summary,
                style = MaterialTheme.typography.bodySmall,
                color = colors.muted,
            )
        }
        if (release.changes.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                release.changes.forEach { change ->
                    ReleaseChangeRow(change)
                }
            }
        }
    }
}

@Composable
private fun ReleaseChangeRow(change: ChangelogChange) {
    val colors = PoracodeTheme.colors
    val (badgeLabel, badgeColor) = when (change.kind) {
        ChangelogChange.Kind.Added -> stringResource(R.string.changelog_kind_added) to colors.success
        ChangelogChange.Kind.Improved -> stringResource(R.string.changelog_kind_improved) to colors.finishedTone
        ChangelogChange.Kind.Fixed -> stringResource(R.string.changelog_kind_fixed) to colors.warning
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            badgeLabel,
            style = PoracodeTextStyles.rowMeta.copy(fontWeight = FontWeight.SemiBold),
            color = badgeColor,
            modifier = Modifier
                .clip(RoundedCornerShape(4.dp))
                .background(badgeColor.copy(alpha = 0.14f))
                .padding(horizontal = 6.dp, vertical = 2.dp),
        )
        Text(
            change.text,
            style = MaterialTheme.typography.bodySmall,
            color = colors.foreground,
            modifier = Modifier.weight(1f),
        )
    }
}
