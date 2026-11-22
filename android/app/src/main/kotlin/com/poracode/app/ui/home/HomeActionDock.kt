package com.poracode.app.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeBottomBar
import com.poracode.app.ui.components.PoracodeCircleButton
import com.poracode.app.ui.components.PoracodeFloatingPill
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeSheetDivider
import com.poracode.app.ui.components.poracodeFloatingSurface
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun HomeProjectFilterMenu(
    expanded: Boolean,
    options: List<HomeProjectFilterOption>,
    selectedProjects: Set<String>,
    onDismiss: () -> Unit,
    onSelectAll: () -> Unit,
    onToggle: (String) -> Unit,
    statusFilter: HomeThreadStatusFilter? = null,
    doneCount: Int = 0,
    onSelectStatus: ((HomeThreadStatusFilter) -> Unit)? = null,
) {
    if (!expanded) return
    val colors = PoracodeTheme.colors
    PoracodeSheet(
        onDismissRequest = onDismiss,
        title = stringResource(
            if (statusFilter != null) R.string.home_filter_threads else R.string.home_filter_by_project,
        ),
    ) {
        if (statusFilter != null && onSelectStatus != null) {
            HomeProjectFilterRow(
                label = stringResource(R.string.home_active_threads),
                selected = statusFilter == HomeThreadStatusFilter.Active,
                onClick = { onSelectStatus(HomeThreadStatusFilter.Active) },
            )
            HomeProjectFilterRow(
                label = stringResource(R.string.home_done_threads),
                selected = statusFilter == HomeThreadStatusFilter.Done,
                onClick = { onSelectStatus(HomeThreadStatusFilter.Done) },
                meta = {
                    Text(
                        doneCount.toString(),
                        style = PoracodeTextStyles.monoMeta.copy(fontSize = 11.sp),
                        color = colors.muted,
                        maxLines = 1,
                    )
                },
            )
            PoracodeSheetDivider()
        }
        HomeProjectFilterRow(
            label = stringResource(R.string.home_all_projects),
            selected = selectedProjects.isEmpty(),
            onClick = onSelectAll,
        )
        PoracodeSheetDivider()
        options.forEach { option ->
            val selected = selectedProjects.isEmpty() || option.id in selectedProjects
            HomeProjectFilterRow(
                label = option.project.name,
                selected = selected,
                onClick = { onToggle(option.id) },
                leading = {
                    Icon(
                        PoracodeIcons.Folder,
                        contentDescription = null,
                        modifier = Modifier.size(15.dp),
                        tint = colors.muted,
                    )
                },
                meta = {
                    Text(
                        option.hostName,
                        style = PoracodeTextStyles.rowDescription,
                        color = colors.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.widthIn(max = 120.dp),
                    )
                    Text(
                        option.threadCount.toString(),
                        style = PoracodeTextStyles.monoMeta.copy(fontSize = 11.sp),
                        color = colors.muted,
                        maxLines = 1,
                    )
                },
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HomeProjectFilterRow(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    leading: (@Composable () -> Unit)? = null,
    meta: (@Composable RowScope.() -> Unit)? = null,
) {
    val colors = PoracodeTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = PoracodeMetrics.tapTarget)
            .clip(RoundedCornerShape(PoracodeRadius.small))
            .background(if (pressed) colors.rowActive else androidx.compose.ui.graphics.Color.Transparent)
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                enabled = true,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics { this.selected = selected }
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        leading?.invoke()
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = colors.foreground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        meta?.invoke(this)
        if (selected) {
            Icon(
                PoracodeIcons.Check,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = colors.foreground,
            )
        }
    }
}

/**
 * The PWA's floating bottom row: search lower leading, the "Plan, ask, build…"
 * capsule in the middle, and More lower trailing. Search turns the capsule into
 * the query field so it stays thumb-reachable above the keyboard.
 */
@Composable
internal fun HomeActionDock(
    newThreadEnabled: Boolean,
    searchVisible: Boolean,
    searchText: String,
    onSearchTextChange: (String) -> Unit,
    onToggleSearch: () -> Unit,
    onNewThread: () -> Unit,
    onMore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val shape = RoundedCornerShape(PoracodeRadius.sheet)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(
                start = PoracodeMetrics.pageInline,
                end = PoracodeMetrics.pageInline,
                bottom = PoracodeMetrics.floatingBottom,
                top = 8.dp,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 560.dp)
                .height(52.dp)
                .poracodeFloatingSurface(shape = shape)
                .padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            com.poracode.app.ui.components.PoracodeIconButton(
                icon = if (searchVisible) PoracodeIcons.Close else PoracodeIcons.Search,
                contentDescription = stringResource(R.string.home_search_threads),
                onClick = onToggleSearch,
                tint = if (searchVisible) colors.foreground else colors.muted,
            )
            if (searchVisible) {
                HomeSearchField(
                    value = searchText,
                    onValueChange = onSearchTextChange,
                    modifier = Modifier.weight(1f),
                )
            } else {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .combinedClickable(
                            enabled = newThreadEnabled,
                            role = Role.Button,
                            onClick = onNewThread,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(38.dp)
                            .clip(RoundedCornerShape(PoracodeRadius.control))
                            .background(colors.fieldBackground)
                            .padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            stringResource(R.string.home_quick_compose_prompt),
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (newThreadEnabled) colors.muted else colors.muted.copy(alpha = 0.5f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            com.poracode.app.ui.components.PoracodeIconButton(
                icon = PoracodeIcons.MoreHoriz,
                contentDescription = stringResource(R.string.home_more),
                onClick = onMore,
                tint = colors.muted,
            )
        }
    }
}

@Composable
private fun HomeSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val focusRequester = remember { FocusRequester() }
    val label = stringResource(R.string.home_search_threads)
    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    Row(
        modifier
            .height(38.dp)
            .clip(RoundedCornerShape(PoracodeRadius.control))
            .background(colors.fieldBackground)
            .padding(horizontal = 12.dp)
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (value.isEmpty()) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.fieldPlaceholder,
                    maxLines = 1,
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = colors.foreground),
                cursorBrush = SolidColor(colors.foreground),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester),
            )
        }
    }
}
