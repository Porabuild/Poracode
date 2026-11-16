package com.poracode.app.ui.hosts

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
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
import com.poracode.app.ui.components.PoracodeBottomBar
import com.poracode.app.ui.components.PoracodeCircleButton
import com.poracode.app.ui.components.PoracodeHazeHost
import com.poracode.app.ui.components.PoracodeListRow
import com.poracode.app.ui.components.PoracodeTextField
import com.poracode.app.ui.components.PoracodeTopAppBar
import com.poracode.app.ui.components.rememberPredictiveBackModifier
import com.poracode.app.ui.onboarding.PairingScanScreen
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import com.poracode.app.ui.components.PoracodeAccentButton

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
    val backModifier = rememberPredictiveBackModifier(onBack = onBack)
    Scaffold(
        modifier = backModifier,
        topBar = {
            PoracodeTopAppBar(
                title = { Text(stringResource(R.string.home_connections)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            PoracodeIcons.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                        )
                    }
                },
            )
        },
    ) { padding ->
        PoracodeHazeHost { backdrop ->
        Box(Modifier.fillMaxSize().padding(padding)) {
        BoxWithConstraints(Modifier.fillMaxSize().then(backdrop)) {
            if (maxWidth >= 840.dp) {
                Row(Modifier.fillMaxSize()) {
                    HostList(
                        catalog, selectedDetail, { selectedDetail = it.connectionId }, selectHost,
                        { pendingRemoval = it }, { pendingRename = it }, onOpenProjects,
                        onOpenDesktopSettings, selectedConnectionState, actionsEnabled,
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
                    openDetails = false,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        PoracodeBottomBar(
            Modifier.align(Alignment.BottomCenter),
            trailing = {
                PoracodeCircleButton(
                    icon = PoracodeIcons.Add,
                    contentDescription = stringResource(R.string.hosts_add),
                    onClick = { showAdd = true },
                    enabled = actionsEnabled,
                )
            },
        )
        }
        }
    }
    pendingRemoval?.let { host ->
        val dependents = if (host.environment == null) {
            catalog.hosts.count { it.environment?.parentConnectionId == host.connectionId }
        } else {
            0
        }
        HostRemovalDialog(
            host = host,
            dependents = dependents,
            onConfirm = {
                pendingRemoval = null
                onRemove(host.connectionId)
            },
            onDismiss = { pendingRemoval = null },
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
    openDetails: Boolean,
    modifier: Modifier,
) {
    val colors = PoracodeTheme.colors
    LazyColumn(
        modifier.padding(12.dp),
        contentPadding = PaddingValues(bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
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
            val colors = PoracodeTheme.colors
            val details = listOf(
                hostModeLabel(host),
                when {
                    connectionState != null -> hostConnectionStateLabel(connectionState)
                    selected -> stringResource(R.string.hosts_selected)
                    secondary -> stringResource(R.string.hosts_kept_ready)
                    else -> stringResource(R.string.socket_idle)
                },
                host.httpBaseUrl,
            ).joinToString(" · ")
            var menuExpanded by remember { mutableStateOf(false) }
            PoracodeListRow(
                onClick = if (openDetails || !selected) {
                    { if (openDetails) onDetail(host) else onSelect(host.connectionId) }
                } else {
                    null
                },
                onLongClick = { menuExpanded = true },
                onLongClickLabel = stringResource(R.string.common_more_actions),
                selected = host.connectionId == selectedDetail &&
                    host.connectionId != catalog.selectedConnectionId,
            ) {
                Icon(
                    PoracodeIcons.Laptop,
                    contentDescription = null,
                    modifier = Modifier.size(15.dp),
                    tint = colors.muted,
                )
                Column(Modifier.weight(1f)) {
                    Text(
                        host.label,
                        style = MaterialTheme.typography.labelLarge.copy(
                            fontWeight = FontWeight.SemiBold,
                        ),
                        color = colors.foreground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(
                                    if (connectionState ==
                                        RemoteWebSocketClient.ConnectionState.Online
                                    ) {
                                        colors.success
                                    } else {
                                        colors.muted
                                    },
                                ),
                        )
                        Text(
                            details,
                            style = PoracodeTextStyles.rowDescription,
                            color = colors.muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                HostRowMenu(
                    expanded = menuExpanded,
                    onDismiss = { menuExpanded = false },
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
        Icon(PoracodeIcons.Computer, contentDescription = null)
        Text(host.label, style = MaterialTheme.typography.headlineSmall)
        Text(hostModeLabel(host), color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (host.environment != null) {
            Text(
                host.environment?.childDesktopId?.let {
                    stringResource(R.string.environments_child_label, it)
                } ?: stringResource(R.string.environments_child_unverified),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text(host.desktopId, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
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
        PoracodeAccentButton(onClick = onScan, enabled = !pairingBusy, modifier = Modifier.fillMaxWidth()) {
            Icon(PoracodeIcons.QrCodeScanner, contentDescription = null)
            Text(stringResource(R.string.pair_scan_card_title), Modifier.padding(start = 8.dp))
        }
        PoracodeTextField(
            link, { link = it }, label = { Text(stringResource(R.string.pairing_link_label)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            enabled = !pairingBusy,
            modifier = Modifier.fillMaxWidth(),
        )
        PoracodeTextField(
            endpoint, { endpoint = it },
            label = { Text(stringResource(R.string.server_base_url)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            enabled = !pairingBusy,
            modifier = Modifier.fillMaxWidth(),
        )
        PoracodeTextField(
            token, { token = it },
            label = { Text(stringResource(R.string.one_time_pairing_token)) },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            enabled = !pairingBusy,
            modifier = Modifier.fillMaxWidth(),
        )
        PoracodeAccentButton(
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
    expanded: Boolean,
    onDismiss: () -> Unit,
    host: HostRecord,
    selected: Boolean,
    onSelect: (ClientConnectionId) -> Unit,
    onRename: (HostRecord) -> Unit,
    onOpenProjects: (ClientConnectionId) -> Unit,
    onOpenDesktopSettings: (ClientConnectionId) -> Unit,
    onRemove: (HostRecord) -> Unit,
    enabled: Boolean,
) {
    Box {
        DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.hosts_rename)) },
                leadingIcon = { Icon(PoracodeIcons.Edit, contentDescription = null) },
                onClick = {
                    onDismiss()
                    onRename(host)
                },
                enabled = enabled,
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.projects_manage_title)) },
                leadingIcon = { Icon(PoracodeIcons.Folder, contentDescription = null) },
                onClick = {
                    onDismiss()
                    onOpenProjects(host.connectionId)
                },
                enabled = enabled,
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.hosts_desktop_settings)) },
                leadingIcon = { Icon(PoracodeIcons.Settings, contentDescription = null) },
                onClick = {
                    onDismiss()
                    onOpenDesktopSettings(host.connectionId)
                },
                enabled = enabled,
            )
            if (!selected) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.hosts_switch)) },
                    leadingIcon = { Icon(PoracodeIcons.Computer, contentDescription = null) },
                    onClick = {
                        onDismiss()
                        onSelect(host.connectionId)
                    },
                    enabled = enabled,
                )
            }
            DropdownMenuItem(
                text = { Text(stringResource(R.string.hosts_remove)) },
                leadingIcon = { Icon(PoracodeIcons.Delete, contentDescription = null) },
                onClick = {
                    onDismiss()
                    onRemove(host)
                },
                enabled = enabled,
            )
        }
    }
}
