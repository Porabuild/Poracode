package com.poracode.app.ui.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.ui.richchat.RichChatProviderUsagePresentation
import com.poracode.app.ui.richchat.RichChatUsageRings
import com.poracode.app.ui.settings.SettingsProviderUsageRow
import com.poracode.app.ui.settings.SettingsUiAccess
import com.poracode.app.ui.settings.SettingsUiComposition
import com.poracode.app.ui.settings.SettingsUsagePresentation
import com.poracode.app.ui.settings.projectAgents
import com.poracode.app.ui.settings.usageToneColor
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * Live provider quota ring rail in the split sidebar footer, mirroring iOS
 * `HomeSidebarUsageRail`. Reuses the selected host's [SettingsUiComposition].
 */
@Composable
internal fun HomeSidebarUsageRail(
    composition: SettingsUiComposition,
    expectedConnectionId: String?,
    onOpenUsage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val lease by composition.hostLease.collectAsStateWithLifecycle()
    val information by composition.information.state.collectAsStateWithLifecycle()
    val access = SettingsUiAccess.from(lease)
    val current = lease?.takeIf { it.connectionId.value == expectedConnectionId && access.canRead }
    val entry = current?.key?.let(information.entries::get)
    val rows = remember(entry?.providerUsage) {
        projectAgents(null, entry?.providerUsage).usage.filter {
            it.status == "ok" && it.meters.isNotEmpty()
        }
    }

    LaunchedEffect(current?.key) {
        if (current != null && composition.hostLease.value?.key == current.key) {
            composition.information.loadProviderUsage()
        }
    }

    if (rows.isEmpty()) return
    val colors = PoracodeTheme.colors
    val usageLabel = stringResource(R.string.settings_usage_title)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(42.dp)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .clickable(role = Role.Button, onClick = onOpenUsage)
                .padding(horizontal = 6.dp, vertical = 8.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                usageLabel,
                style = PoracodeTextStyles.rowDescription.copy(fontWeight = FontWeight.SemiBold),
                color = colors.muted,
                maxLines = 1,
            )
        }
        Row(
            modifier = Modifier
                .weight(1f)
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            rows.forEach { row ->
                SidebarUsageRingItem(
                    row = row,
                    onClick = onOpenUsage,
                )
            }
        }
    }
}

@Composable
private fun SidebarUsageRingItem(
    row: SettingsProviderUsageRow,
    onClick: () -> Unit,
) {
    val rings = RichChatProviderUsagePresentation.rings(row)
    val outerPercent = rings.outerPercent ?: row.meters.firstOrNull { it.usedPercent.isFinite() }?.usedPercent
    val effectiveRings = RichChatUsageRings(outerPercent, rings.innerPercent)
    val label = SettingsUsagePresentation.providerLabel(row.providerId)
    val summary = row.meters.joinToString(", ") {
        "${it.label} ${SettingsUsagePresentation.windowValue(it)}"
    }
    val colors = PoracodeTheme.colors
    Box(
        modifier = Modifier
            .size(38.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = "$label: $summary" },
        contentAlignment = Alignment.Center,
    ) {
        SidebarUsageCanvas(effectiveRings)
        Text(
            providerInitial(label),
            style = PoracodeTextStyles.rowMeta.copy(
                fontSize = 8.sp,
                lineHeight = 9.sp,
                fontWeight = FontWeight.SemiBold,
            ),
            color = colors.foreground,
        )
    }
}

@Composable
private fun SidebarUsageCanvas(rings: RichChatUsageRings) {
    val track = PoracodeTheme.colors.muted.copy(alpha = 0.22f)
    val outerColor = usageToneColor(SettingsUsagePresentation.tone(rings.outerPercent))
    val innerColor = usageToneColor(SettingsUsagePresentation.tone(rings.innerPercent))
    Canvas(Modifier.fillMaxSize().padding(3.dp)) {
        val stroke = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
        fun drawRing(percent: Double?, inset: Float, color: Color) {
            val origin = Offset(inset, inset)
            val diameter = Size(size.width - inset * 2f, size.height - inset * 2f)
            drawArc(track, 0f, 360f, false, origin, diameter, style = stroke)
            if (percent != null && percent.isFinite()) {
                val clamped = percent.coerceIn(0.0, 100.0).toFloat()
                drawArc(color, -90f, clamped * 3.6f, false, origin, diameter, style = stroke)
            }
        }
        drawRing(rings.outerPercent, stroke.width / 2f, outerColor)
        if (rings.innerPercent != null) {
            drawRing(rings.innerPercent, stroke.width * 2.1f, innerColor)
        }
    }
}
