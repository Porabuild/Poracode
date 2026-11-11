package com.poracode.app.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Home header (`MobilePageHeader variant="home"`): a centered title over the
 * page background with optional leading and trailing plain icon actions.
 */
@Composable
fun PoracodeHomeHeader(
    title: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    leading: @Composable RowScope.() -> Unit = {},
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Box(
        modifier
            .fillMaxWidth()
            .background(PoracodeTheme.colors.background)
            .statusBarsPadding()
            .height(PoracodeMetrics.headerHeight)
            .padding(horizontal = PoracodeMetrics.pageInline),
    ) {
        Row(
            Modifier.align(Alignment.CenterStart),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            content = leading,
        )
        Box(Modifier.align(Alignment.Center).semantics { heading() }) { title() }
        Row(
            Modifier.align(Alignment.CenterEnd),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            content = trailing,
        )
    }
}

/**
 * Inner-page header (`MobilePageHeader variant="page"`): a chevron back control
 * that carries the page title, or a back chevron followed by a title/subtitle
 * stack, plus trailing actions.
 */
@Composable
fun PoracodePageHeader(
    title: String,
    onBack: (() -> Unit)?,
    modifier: Modifier = Modifier,
    backLabel: String = stringResource(R.string.back),
    subtitle: (@Composable () -> Unit)? = null,
    onTitleClick: (() -> Unit)? = null,
    background: Color = PoracodeTheme.colors.background,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier
            .fillMaxWidth()
            .background(background)
            .statusBarsPadding()
            .height(PoracodeMetrics.headerHeight)
            .padding(start = PoracodeMetrics.pageInline - 8.dp, end = PoracodeMetrics.pageInline),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val stacked = subtitle != null || onTitleClick != null
        if (onBack != null) {
            HeaderBackButton(
                label = backLabel,
                title = title.takeUnless { stacked },
                onClick = onBack,
                modifier = if (stacked) Modifier else Modifier.weight(1f, fill = false),
            )
        } else {
            Spacer(Modifier.size(8.dp))
        }
        if (stacked || onBack == null) {
            HeaderTitleStack(
                title = title,
                subtitle = subtitle,
                onClick = onTitleClick,
                modifier = Modifier.weight(1f),
            )
        } else {
            Spacer(Modifier.weight(1f))
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            content = trailing,
        )
    }
}

/**
 * Slot-compatible replacement for the Material `TopAppBar` on inner pages: the
 * PWA's 48 dp header with a compact back control, a 14 sp semibold title, and
 * trailing actions, over the page background.
 */
@Composable
fun PoracodeTopAppBar(
    title: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {},
) {
    val colors = PoracodeTheme.colors
    Row(
        modifier
            .fillMaxWidth()
            .background(colors.background)
            .statusBarsPadding()
            .height(PoracodeMetrics.headerHeight)
            .padding(start = 2.dp, end = PoracodeMetrics.pageInline - 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.material3.LocalContentColor provides colors.foreground,
        ) {
            navigationIcon()
            Box(Modifier.weight(1f).padding(start = 4.dp)) {
                androidx.compose.runtime.CompositionLocalProvider(
                    androidx.compose.material3.LocalTextStyle provides PoracodeTextStyles.headerTitle.copy(
                        fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                    ),
                ) { title() }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(0.dp),
                verticalAlignment = Alignment.CenterVertically,
                content = actions,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HeaderBackButton(
    label: String,
    title: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier
            .height(PoracodeMetrics.tapTarget)
            .widthIn(min = PoracodeMetrics.tapTarget)
            .clip(RoundedCornerShape(8.dp))
            .background(if (pressed) colors.rowActive else Color.Transparent)
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClickLabel = label,
                onClick = onClick,
            )
            .padding(start = 12.dp, end = if (title != null) 10.dp else 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            PoracodeIcons.ArrowBack,
            contentDescription = label,
            modifier = Modifier.size(20.dp),
            tint = colors.foreground,
        )
        if (title != null) {
            Text(
                title,
                modifier = Modifier.semantics { heading() },
                style = PoracodeTextStyles.headerTitle.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold),
                color = colors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HeaderTitleStack(
    title: String,
    subtitle: (@Composable () -> Unit)?,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .then(
                if (onClick != null) {
                    Modifier.combinedClickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                        onClick = onClick,
                    )
                } else {
                    Modifier
                },
            )
            .offset(x = (-4).dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            title,
            modifier = Modifier.semantics { heading() },
            style = PoracodeTextStyles.headerTitle,
            color = PoracodeTheme.colors.foreground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        subtitle?.invoke()
    }
}
