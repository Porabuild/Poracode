package com.poracode.app.ui.settings

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poracode.app.PoracodeApplication
import com.poracode.app.R
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import java.text.DateFormat
import java.util.Date

@Composable
internal fun DeviceDiagnosticsPane(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val manager = (context.applicationContext as? PoracodeApplication)?.diagnostics
    if (manager == null) {
        SettingsLoading(stringResource(R.string.diagnostics_empty))
        return
    }
    val enabled by manager.enabled.collectAsStateWithLifecycle()
    val reports by manager.reports.collectAsStateWithLifecycle()
    val colors = PoracodeTheme.colors

    LaunchedEffect(manager) { manager.reload() }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "toggle") {
            SettingsCard {
                SettingsSwitchRow(
                    label = stringResource(R.string.diagnostics_capture_toggle),
                    checked = enabled,
                    onChange = manager::setCaptureEnabled,
                    description = stringResource(R.string.diagnostics_capture_description),
                )
            }
        }
        if (reports.isNotEmpty()) {
            item(key = "actions") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton(
                        onClick = {
                            val share = Intent(Intent.ACTION_SEND).apply {
                                type = "application/json"
                                putExtra(Intent.EXTRA_SUBJECT, "Poracode Android Diagnostics")
                                putExtra(Intent.EXTRA_TEXT, manager.exportJson())
                            }
                            context.startActivity(Intent.createChooser(share, null))
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(stringResource(R.string.diagnostics_share))
                    }
                    OutlinedButton(
                        onClick = manager::deleteAll,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(stringResource(R.string.diagnostics_delete_all), color = colors.danger)
                    }
                }
            }
        }
        if (reports.isEmpty()) {
            item(key = "empty") {
                Text(
                    stringResource(R.string.diagnostics_empty),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.muted,
                )
            }
        } else {
            items(reports, key = { it.id }) { report ->
                PoracodeCard {
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(
                            "${report.kind.uppercase()} · v${report.appVersion} (${report.appBuild})",
                            style = PoracodeTextStyles.rowTitle,
                            color = colors.foreground,
                        )
                        Text(
                            DateFormat.getDateTimeInstance().format(Date(report.timestampEpochMs)),
                            style = PoracodeTextStyles.rowMeta,
                            color = colors.muted,
                        )
                        report.exceptionClass?.let {
                            Text(it, style = PoracodeTextStyles.rowDescription, color = colors.muted)
                        }
                        report.exitReason?.let { reason ->
                            Text("exitReason=$reason status=${report.exitStatus}", style = PoracodeTextStyles.rowMeta, color = colors.muted)
                        }
                    }
                }
            }
        }
    }
}
