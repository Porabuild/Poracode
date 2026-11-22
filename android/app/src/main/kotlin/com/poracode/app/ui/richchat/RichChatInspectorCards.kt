package com.poracode.app.ui.richchat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichContextUsage
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.hostPath
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Collapsible Thread Info card built on the unified [PoracodeCard] surface.
 */
@Composable
internal fun RichChatThreadInfoCard(
    thread: RemoteThread?,
    projectName: String?,
    projectLocation: ProjectLocation?,
    gitSummary: RemoteGitSummary?,
    modifier: Modifier = Modifier,
) {
    val resolvedPath = projectLocation?.hostPath()?.takeIf(String::isNotBlank)
    val resolvedBranch = gitSummary?.branch?.takeIf(String::isNotBlank)
        ?: thread?.worktreeBranch?.takeIf(String::isNotBlank)
    val rows = buildList {
        projectName?.takeIf(String::isNotBlank)?.let {
            add(stringResource(R.string.inspector_thread_workspace) to it)
        }
        resolvedPath?.let {
            add(stringResource(R.string.inspector_thread_path) to it)
        }
        thread?.worktreePath?.takeIf(String::isNotBlank)?.let {
            add(stringResource(R.string.inspector_thread_worktree) to it)
        }
        resolvedBranch?.let {
            add(stringResource(R.string.inspector_thread_branch) to it)
        }
        thread?.sessionRef?.providerSessionId?.takeIf(String::isNotBlank)?.let {
            add(stringResource(R.string.inspector_thread_session_id) to it)
        }
    }
    if (rows.isEmpty()) return

    val colors = PoracodeTheme.colors
    var expanded by rememberSaveable(thread?.id) { mutableStateOf(true) }
    val collapsedSummary = resolvedBranch ?: projectName

    PoracodeCard(modifier = modifier) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = { expanded = !expanded }),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                PoracodeIcons.Folder,
                contentDescription = null,
                modifier = Modifier.size(15.dp),
                tint = colors.muted,
            )
            Text(
                stringResource(R.string.inspector_tab_info),
                style = PoracodeTextStyles.sheetTitle,
                color = colors.foreground,
                maxLines = 1,
            )
            Spacer(Modifier.weight(1f))
            if (!expanded && !collapsedSummary.isNullOrBlank()) {
                Text(
                    collapsedSummary,
                    style = PoracodeTextStyles.monoMeta,
                    color = colors.muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Icon(
                if (expanded) PoracodeIcons.ExpandMore else PoracodeIcons.KeyboardArrowRight,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = colors.muted,
            )
        }

        AnimatedVisibility(visible = expanded) {
            SelectionContainer {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    rows.forEach { (label, value) ->
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                label,
                                style = PoracodeTextStyles.rowMeta,
                                color = colors.muted,
                            )
                            Text(
                                value,
                                style = PoracodeTextStyles.rowDescription.copy(fontWeight = FontWeight.Medium),
                                color = colors.foreground,
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Unified Context Window card for the inspector Info tab — replaces the stock
 * Material FilterChip + OutlinedCard with the same [PoracodeCard] visual grammar.
 */
@Composable
internal fun RichChatContextWindowCard(
    usage: RichContextUsage?,
    modifier: Modifier = Modifier,
) {
    val summary = RuntimeContextUsageLogic.summarize(usage) ?: return
    val colors = PoracodeTheme.colors
    val percent = summary.percent?.coerceIn(0, 100)
    val barColor = when (summary.indicatorTone) {
        RuntimeContextTone.Danger -> colors.danger
        RuntimeContextTone.Warning -> colors.warning
        RuntimeContextTone.Normal, RuntimeContextTone.Unknown -> colors.foreground
    }
    PoracodeCard(
        modifier = modifier,
        title = stringResource(R.string.runtime_context_usage),
        icon = PoracodeIcons.DataUsage,
        trailing = {
            if (percent != null) {
                Text(
                    stringResource(R.string.runtime_context_percent, percent),
                    style = PoracodeTextStyles.monoMeta.copy(fontWeight = FontWeight.SemiBold),
                    color = barColor,
                )
            }
        },
    ) {
        if (percent != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(CircleShape)
                    .background(colors.default),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth((percent / 100f).coerceIn(0.02f, 1f))
                        .height(4.dp)
                        .clip(CircleShape)
                        .background(barColor),
                )
            }
        }
        val usedText = summary.usedTokens?.let { "%,d".format(it) }
            ?: stringResource(R.string.runtime_context_unknown)
        val maxText = "%,d".format(summary.maxTokens)
        Text(
            stringResource(R.string.runtime_context_used_and_limit, usedText, maxText),
            style = PoracodeTextStyles.monoMeta,
            color = colors.muted,
        )
        summary.breakdown.forEach { entry ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    entry.providerLabel ?: stringResource(R.string.runtime_context_used),
                    style = PoracodeTextStyles.rowDescription,
                    color = colors.muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    "%,d".format(entry.tokens),
                    style = PoracodeTextStyles.monoMeta,
                    color = colors.muted,
                )
            }
        }
    }
}

/**
 * Horizontal thumbnail gallery of images present in the loaded thread history.
 */
@Composable
internal fun RichChatMediaGalleryCard(
    images: List<RichImageSource>,
    runtime: RichChatSessionRuntime,
    modifier: Modifier = Modifier,
) {
    if (images.isEmpty()) return
    val colors = PoracodeTheme.colors
    PoracodeCard(
        modifier = modifier,
        title = stringResource(R.string.inspector_media_gallery),
        icon = PoracodeIcons.Image,
        trailing = {
            Text(
                images.size.toString(),
                style = PoracodeTextStyles.monoMeta,
                color = colors.muted,
            )
        },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            images.take(24).forEach { source ->
                Box(
                    modifier = Modifier
                        .width(124.dp)
                        .height(84.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(colors.background)
                        .border(1.dp, colors.hairlineSoft, RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    RichRemoteImage(
                        source = source,
                        runtime = runtime,
                        modifier = Modifier.size(124.dp, 84.dp),
                    )
                }
            }
        }
    }
}
