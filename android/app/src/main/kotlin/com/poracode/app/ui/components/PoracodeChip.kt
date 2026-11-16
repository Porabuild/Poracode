package com.poracode.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poracode.app.ui.home.providerInitial
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * The PWA quiet chip (`poracode-chip`): no fill or border at rest, a pressed
 * wash, a 12 sp label, and an optional leading slot plus chevron. The 32 dp
 * visual row sits inside a 40 dp touch target.
 */
@Composable
fun PoracodeChip(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null,
    showChevron: Boolean = true,
    enabled: Boolean = true,
    contentDescription: String? = null,
) {
    val colors = PoracodeTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val contentAlpha = if (enabled) 0.85f else 0.5f
    Box(
        modifier
            .heightIn(min = 40.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (pressed && enabled) colors.rowActive else Color.Transparent)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics { contentDescription?.let { this.contentDescription = it } },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier
                .height(32.dp)
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            leading?.invoke()
            Text(
                label,
                modifier = Modifier.widthIn(max = 160.dp),
                style = PoracodeTextStyles.rowTitle.copy(fontWeight = FontWeight.Medium),
                color = (if (enabled) colors.foreground else colors.muted).copy(alpha = contentAlpha),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (showChevron) {
                Icon(
                    PoracodeIcons.ExpandMore,
                    contentDescription = null,
                    modifier = Modifier.size(12.dp),
                    tint = colors.muted.copy(alpha = if (enabled) 1f else 0.5f),
                )
            }
        }
    }
}

/** The 14 dp provider-initial tile shared by composer model controls and chips. */
@Composable
fun ProviderInitialTile(
    providerLabel: String,
    modifier: Modifier = Modifier,
    tileSize: Dp = 14.dp,
) {
    val colors = PoracodeTheme.colors
    Box(
        modifier
            .size(tileSize)
            .border(
                1.dp,
                colors.foreground.copy(alpha = 0.34f),
                RoundedCornerShape(4.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            providerInitial(providerLabel),
            style = PoracodeTextStyles.rowMeta.copy(fontSize = 7.sp, lineHeight = 8.sp),
            color = colors.foreground,
        )
    }
}
