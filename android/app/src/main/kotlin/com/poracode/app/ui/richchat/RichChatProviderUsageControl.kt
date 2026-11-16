package com.poracode.app.ui.richchat

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.R
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.settings.SettingsInformationSlot
import com.poracode.app.ui.components.PoracodeSheet
import com.poracode.app.ui.components.PoracodeSheetAction
import com.poracode.app.ui.components.poracodeFloatingSurface
import com.poracode.app.ui.settings.SettingsUiComposition
import com.poracode.app.ui.settings.SettingsUiAccess
import com.poracode.app.ui.settings.SettingsUsageMeterRow
import com.poracode.app.ui.settings.localizedUsageStatus
import com.poracode.app.ui.settings.projectAgents
import com.poracode.app.ui.settings.SettingsUsagePresentation
import com.poracode.app.ui.settings.usageToneColor
import com.poracode.app.ui.settings.settingsFailureMessage
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.launch

/** Reuses the host-fenced settings projection; the composer creates no transport. */
@Composable
internal fun RichChatProviderUsageControl(
    composition: SettingsUiComposition,
    expectedConnectionId: String?,
    thread: RemoteThread?,
    agentLabel: String?,
    onOpenUsage: () -> Unit,
) {
    if (thread == null) return
    val lease by composition.hostLease.collectAsStateWithLifecycle()
    val information by composition.information.state.collectAsStateWithLifecycle()
    val access = SettingsUiAccess.from(lease)
    val current = lease?.takeIf { it.connectionId.value == expectedConnectionId && access.canRead }
    val entry = current?.key?.let(information.entries::get)
    val rows = remember(entry?.providerUsage) { projectAgents(null, entry?.providerUsage).usage }
    val row = RichChatProviderUsagePresentation.resolve(thread.agentKind, thread.agentInstanceId, rows)
    val failure = entry?.failures?.get(SettingsInformationSlot.ProviderUsage)
    val rings = RichChatProviderUsagePresentation.rings(row.takeIf { failure == null })
    val label = agentLabel ?: row?.displayName ?: thread.agentKind.substringBefore(':')
    val usageTitle = stringResource(R.string.settings_usage_title)
    var expanded by rememberSaveable(thread.id, current?.key) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val refresh: suspend () -> Unit = {
        if (current != null && composition.hostLease.value?.key == current.key) {
            composition.information.loadProviderUsage()
        }
    }
    LaunchedEffect(thread.id, current?.key) {
        refresh()
    }
    val colors = PoracodeTheme.colors
    Box(
        Modifier.size(28.dp)
            .poracodeFloatingSurface(shape = CircleShape)
            .clickable(role = Role.Button, onClick = { expanded = true })
            .semantics { contentDescription = "$label $usageTitle" },
        contentAlignment = Alignment.Center,
    ) {
        ProviderUsageRings(rings)
    }
    if (expanded) {
        PoracodeSheet(onDismissRequest = { expanded = false }, title = label) {
            Column(
                Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (SettingsInformationSlot.ProviderUsage in entry?.loading.orEmpty()) {
                    CircularProgressIndicator(Modifier.size(18.dp))
                } else if (failure != null) {
                    Text(settingsFailureMessage(failure), color = colors.danger)
                } else if (row == null) {
                    Text(stringResource(R.string.settings_usage_empty), color = colors.muted)
                } else if (row.status == "ok" && row.meters.isNotEmpty()) {
                    row.meters.forEach { SettingsUsageMeterRow(it, System.currentTimeMillis()) }
                } else {
                    Text(localizedUsageStatus(row.status), color = colors.muted)
                }
            }
            PoracodeSheetAction(
                label = stringResource(R.string.settings_refresh), icon = PoracodeIcons.Refresh,
                onClick = { scope.launch { refresh() } },
            )
            PoracodeSheetAction(
                label = usageTitle, icon = PoracodeIcons.OpenInBrowser,
                onClick = { expanded = false; onOpenUsage() },
            )
        }
    }
}

@Composable
private fun ProviderUsageRings(rings: RichChatUsageRings) {
    val normal = PoracodeTheme.colors.foreground
    val outerColor = usageToneColor(SettingsUsagePresentation.tone(rings.outerPercent))
    val innerColor = usageToneColor(SettingsUsagePresentation.tone(rings.innerPercent))
    val track = normal.copy(alpha = 0.18f)
    Canvas(Modifier.fillMaxSize().padding(5.dp)) {
        val stroke = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round)
        fun ring(percent: Double?, inset: Float, color: Color) {
            val origin = Offset(inset, inset)
            val diameter = Size(size.width - inset * 2, size.height - inset * 2)
            drawArc(track, 0f, 360f, false, origin, diameter, style = stroke)
            if (percent != null) {
                drawArc(color, -90f, percent.toFloat() * 3.6f, false, origin, diameter, style = stroke)
            }
        }
        ring(rings.outerPercent, stroke.width / 2, outerColor)
        if (rings.innerPercent != null) ring(rings.innerPercent, size.width * 0.2f, innerColor)
    }
}
