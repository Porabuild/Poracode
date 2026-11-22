package com.poracode.app.ui.homenews

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeIconButton
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

private const val BUILT_IN_TIP_ID = "android-built-in-adaptive-tip"

/**
 * Quiet dismissible inline news & feature-discovery line backed by [HomeNewsStore]
 * (fetches/caches `news.json`, persists dismissed item IDs, opens Release Notes or HTTPS URLs).
 */
@Composable
internal fun HomeNewsBanner(
    onOpenReleaseNotes: () -> Unit,
    onOpenUrl: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val store = remember(context) { HomeNewsStore.create(context) }
    val state by store.state.collectAsStateWithLifecycle()
    LaunchedEffect(store) { store.refresh() }

    val remoteItem = state.activeItem
    val activeId = remoteItem?.id ?: BUILT_IN_TIP_ID
    if (remoteItem == null && BUILT_IN_TIP_ID in state.dismissedIds) return

    val colors = PoracodeTheme.colors
    val text = remoteItem?.text ?: stringResource(R.string.home_news_whats_new_tip)
    val onTap: () -> Unit = {
        when (val action = remoteItem?.action) {
            is HomeNewsAction.OpenUrl -> onOpenUrl?.invoke(action.url) ?: onOpenReleaseNotes()
            HomeNewsAction.OpenWhatsNew, is HomeNewsAction.OpenFeature, null -> onOpenReleaseNotes()
        }
    }

    PoracodeCard(
        modifier = modifier,
        contentPadding = PaddingValues(start = 12.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onTap),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                PoracodeIcons.AutoAwesome,
                contentDescription = null,
                modifier = Modifier.size(15.dp),
                tint = colors.accent,
            )
            Text(
                text,
                style = PoracodeTextStyles.rowDescription,
                color = colors.foreground,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            PoracodeIconButton(
                icon = PoracodeIcons.Close,
                contentDescription = stringResource(R.string.home_news_dismiss),
                onClick = { store.dismiss(activeId) },
                tint = colors.muted,
                iconSize = 14.dp,
            )
        }
    }
}
