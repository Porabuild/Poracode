package com.poracode.app.ui.hosts

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostRecord
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostUiCatalog
import com.poracode.app.storage.HostCatalog
import com.poracode.app.ui.onboarding.PairingScanScreen
import com.poracode.app.transport.RemoteWebSocketClient

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HostSwitcherScreen(
    catalog: HostUiCatalog,
    onBack: () -> Unit,
    onSelect: (ClientConnectionId) -> Unit,
    onRemove: (ClientConnectionId) -> Unit,
    onRename: (ClientConnectionId, String) -> Unit,
    onOpenProjects: (ClientConnectionId) -> Unit,
    onOpenDesktopSettings: (ClientConnectionId) -> Unit,
    onPair: (AppSession.PairingInput) -> Unit,
    selectedConnectionState: RemoteWebSocketClient.ConnectionState,
    pairingBusy: Boolean,
    navigationBusy: Boolean,
) {
    var selectedDetail by remember(catalog.selectedConnectionId) {
        mutableStateOf(catalog.selectedConnectionId)
    }
    var showAdd by remember { mutableStateOf(false) }
    var showScanner by remember { mutableStateOf(false) }
    var pendingRemoval by remember { mutableStateOf<HostRecord?>(null) }
    var pendingRename by remember { mutableStateOf<HostRecord?>(null) }
    var switchingTo by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(catalog.selectedConnectionId, catalog.hosts, switchingTo) {
        val target = switchingTo ?: return@LaunchedEffect
        if (catalog.selectedConnectionId?.value == target ||
            catalog.hosts.none { it.connectionId.value == target }
        ) {
            switchingTo = null
        }
    }
    val actionsEnabled = !pairingBusy && !navigationBusy && switchingTo == null
    val selectHost: (ClientConnectionId) -> Unit = { id ->
        if (actionsEnabled) {
            switchingTo = id.value
            onSelect(id)
        }
    }
    if (showScanner) {
        PairingScanScreen(
            onDismiss = { showScanner = false },
            onUseLinkInstead = {
                showScanner = false
                showAdd = true
            },
            onPairingLinkScanned = { link ->
                showScanner = false
                if (!pairingBusy) onPair(AppSession.PairingInput(link, "", ""))
            },
        )
        return
    }
    BackHandler(onBack = onBack)
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.hosts_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { showAdd = true }, enabled = actionsEnabled) {
                        Icon(Icons.Outlined.Add, stringResource(R.string.hosts_add))
                    }
                },
            )
        },
    ) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            if (maxWidth >= 840.dp) {
                Row(Modifier.fillMaxSize()) {
                    HostList(
                        catalog, selectedDetail, { selectedDetail = it.connectionId }, selectHost,
                        { pendingRemoval = it }, { pendingRename = it }, onOpenProjects,
                        onOpenDesktopSettings, selectedConnectionState, actionsEnabled,
                        { showAdd = true },
                        openDetails = true,
                        modifier = Modifier.width(360.dp),
                    )
                    HorizontalDivider(Modifier.fillMaxSize().width(1.dp))
                    if (showAdd) {
                        AddHostPanel(
                            onPair, { showScanner = true }, pairingBusy, Modifier.weight(1f),
                        )
                    } else {
                        HostDetail(
                            catalog.hosts.firstOrNull { it.connectionId == selectedDetail },
                            selectedDetail == catalog.selectedConnectionId,
                            if (selectedDetail == catalog.selectedConnectionId) {
                                selectedConnectionState
                            } else {
                                catalog.connectionStates[selectedDetail]
                            },
                            Modifier.weight(1f),
                        )
                    }
                }
            } else if (showAdd) {
                AddHostPanel(
                    onPair, { showScanner = true }, pairingBusy, Modifier.fillMaxSize(),
                )
            } else {
                HostList(
                    catalog, selectedDetail, { selectedDetail = it.connectionId }, selectHost,
                    { pendingRemoval = it }, { pendingRename = it }, onOpenProjects,
                    onOpenDesktopSettings, selectedConnectionState, actionsEnabled,
                    { showAdd = true },
                    openDetails = false,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
    pendingRemoval?.let { host ->
        AlertDialog(
            onDismissRequest = { pendingRemoval = null },
            title = { Text(stringResource(R.string.hosts_remove_confirm_title, host.label)) },
            text = { Text(stringResource(R.string.hosts_remove_confirm_message)) },
            confirmButton = {
                Button(onClick = {
                    pendingRemoval = null
                    onRemove(host.connectionId)
                }) { Text(stringResource(R.string.hosts_remove_action)) }
            },
            dismissButton = {
                TextButton(onClick = { pendingRemoval = null }) {
                    Text(stringResource(R.string.cancel_pair_button))
                }
            },
        )
    }
    pendingRename?.let { host ->
        RenameHostDialog(
            host = host,
            onDismiss = { pendingRename = null },
            onRename = { label ->
                pendingRename = null
                onRename(host.connectionId, label)
            },
        )
    }
}

@Composable
private fun HostList(
    catalog: HostUiCatalog,
    selectedDetail: ClientConnectionId?,
    onDetail: (HostRecord) -> Unit,
    onSelect: (ClientConnectionId) -> Unit,
    onRemove: (HostRecord) -> Unit,
    onRename: (HostRecord) -> Unit,
    onOpenProjects: (ClientConnectionId) -> Unit,
    onOpenDesktopSettings: (ClientConnectionId) -> Unit,
    selectedConnectionState: RemoteWebSocketClient.ConnectionState,
    actionsEnabled: Boolean,
    onAdd: () -> Unit,
    openDetails: Boolean,
    modifier: Modifier,
) {
    LazyColumn(modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (catalog.hosts.isEmpty()) {
            item { Text(stringResource(R.string.hosts_empty)) }
        }
        items(catalog.hosts, key = { it.connectionId.value }) { host ->
            val selected = host.connectionId == catalog.selectedConnectionId
            val secondary = catalog.lru.firstOrNull { it != catalog.selectedConnectionId } ==
                host.connectionId
            val connectionState = if (selected) {
                selectedConnectionState
            } else {
                catalog.connectionStates[host.connectionId]
            }
            Card(
                modifier = Modifier.fillMaxWidth().then(
                    if (openDetails || !selected) {
                        Modifier.clickable {
                            if (openDetails) onDetail(host) else onSelect(host.connectionId)
                        }
                    } else {
                        Modifier
                    },
                ),
                colors = CardDefaults.cardColors(
                    containerColor = if (host.connectionId == selectedDetail) {
                        MaterialTheme.colorScheme.secondaryContainer
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                ),
            ) {
                Row(
                    Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Outlined.Computer, contentDescription = null)
                    Column(Modifier.weight(1f)) {
                        Text(host.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            when {
                                connectionState != null -> hostConnectionStateLabel(connectionState)
                                selected -> stringResource(R.string.hosts_selected)
                                secondary -> stringResource(R.string.hosts_kept_ready)
                                else -> stringResource(R.string.socket_idle)
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            host.httpBaseUrl,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    HostRowMenu(
                        host = host,
                        selected = selected,
                        onSelect = onSelect,
                        onRename = onRename,
                        onOpenProjects = onOpenProjects,
                        onOpenDesktopSettings = onOpenDesktopSettings,
                        onRemove = onRemove,
                        enabled = actionsEnabled,
                    )
                }
            }
        }
        item {
            TextButton(onClick = onAdd, enabled = actionsEnabled) {
                Icon(Icons.Outlined.Add, contentDescription = null)
                Text(stringResource(R.string.hosts_add), Modifier.padding(start = 8.dp))
            }
        }
    }
}

@Composable
private fun HostDetail(
    host: HostRecord?,
    selected: Boolean,
    connectionState: RemoteWebSocketClient.ConnectionState?,
    modifier: Modifier,
) {
    Column(modifier.padding(32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (host == null) {
            Text(stringResource(R.string.hosts_choose_detail))
            return@Column
        }
        Icon(Icons.Outlined.Computer, contentDescription = null)
        Text(host.label, style = MaterialTheme.typography.headlineSmall)
        Text(host.desktopId, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(host.httpBaseUrl, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (connectionState != null) {
            Text(hostConnectionStateLabel(connectionState))
        } else if (selected) {
            Text(
                stringResource(R.string.hosts_selected),
            )
        }
    }
}

@Composable
private fun AddHostPanel(
    onPair: (AppSession.PairingInput) -> Unit,
    onScan: () -> Unit,
    pairingBusy: Boolean,
    modifier: Modifier,
) {
    var link by remember { mutableStateOf("") }
    var endpoint by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    Column(
        modifier.padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.hosts_add), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.hosts_add_description))
        Button(onClick = onScan, enabled = !pairingBusy, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.QrCodeScanner, contentDescription = null)
            Text(stringResource(R.string.pair_scan_card_title), Modifier.padding(start = 8.dp))
        }
        OutlinedTextField(
            link, { link = it }, label = { Text(stringResource(R.string.pairing_link_label)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            enabled = !pairingBusy,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            endpoint, { endpoint = it },
            label = { Text(stringResource(R.string.server_base_url)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            enabled = !pairingBusy,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            token, { token = it },
            label = { Text(stringResource(R.string.one_time_pairing_token)) },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            enabled = !pairingBusy,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                onPair(AppSession.PairingInput(link, endpoint, token))
            },
            enabled = !pairingBusy && (
                link.isNotBlank() || (endpoint.isNotBlank() && token.isNotBlank())
            ),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.hosts_add_action)) }
    }
}

@Composable
private fun HostRowMenu(
    host: HostRecord,
    selected: Boolean,
    onSelect: (ClientConnectionId) -> Unit,
    onRename: (HostRecord) -> Unit,
    onOpenProjects: (ClientConnectionId) -> Unit,
    onOpenDesktopSettings: (ClientConnectionId) -> Unit,
    onRemove: (HostRecord) -> Unit,
    enabled: Boolean,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }, enabled = enabled) {
            Icon(Icons.Outlined.MoreVert, stringResource(R.string.hosts_more_actions, host.label))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.hosts_rename)) },
                leadingIcon = { Icon(Icons.Outlined.Edit, contentDescription = null) },
                onClick = {
                    expanded = false
                    onRename(host)
                },
                enabled = enabled,
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.projects_manage_title)) },
                leadingIcon = { Icon(Icons.Outlined.Folder, contentDescription = null) },
                onClick = {
                    expanded = false
                    onOpenProjects(host.connectionId)
                },
                enabled = enabled,
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.hosts_desktop_settings)) },
                leadingIcon = { Icon(Icons.Outlined.Settings, contentDescription = null) },
                onClick = {
                    expanded = false
                    onOpenDesktopSettings(host.connectionId)
                },
                enabled = enabled,
            )
            if (!selected) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.hosts_switch)) },
                    leadingIcon = { Icon(Icons.Outlined.Computer, contentDescription = null) },
                    onClick = {
                        expanded = false
                        onSelect(host.connectionId)
                    },
                    enabled = enabled,
                )
            }
            DropdownMenuItem(
                text = { Text(stringResource(R.string.hosts_remove)) },
                leadingIcon = { Icon(Icons.Outlined.Delete, contentDescription = null) },
                onClick = {
                    expanded = false
                    onRemove(host)
                },
                enabled = enabled,
            )
        }
    }
}

@Composable
private fun RenameHostDialog(
    host: HostRecord,
    onDismiss: () -> Unit,
    onRename: (String) -> Unit,
) {
    var label by remember(host.connectionId) { mutableStateOf(host.label) }
    val normalized = label.trim()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.hosts_rename_title)) },
        text = {
            OutlinedTextField(
                value = label,
                onValueChange = { if (it.length <= HostCatalog.MAX_HOST_LABEL_LENGTH) label = it },
                label = { Text(stringResource(R.string.hosts_name_label)) },
                singleLine = true,
            )
        },
        confirmButton = {
            Button(
                onClick = { onRename(normalized) },
                enabled = normalized.isNotEmpty() && normalized != host.label,
            ) { Text(stringResource(R.string.hosts_rename_action)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel_pair_button))
            }
        },
    )
}
