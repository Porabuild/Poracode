package com.poracode.app.ui.hosts

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HostSwitcherScreen(
    catalog: HostUiCatalog,
    onBack: () -> Unit,
    onSelect: (ClientConnectionId) -> Unit,
    onRemove: (ClientConnectionId) -> Unit,
    onPair: (AppSession.PairingInput) -> Unit,
) {
    var selectedDetail by remember(catalog.selectedConnectionId) {
        mutableStateOf(catalog.selectedConnectionId)
    }
    var showAdd by remember { mutableStateOf(false) }
    var pendingRemoval by remember { mutableStateOf<HostRecord?>(null) }
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
                    IconButton(onClick = { showAdd = true }) {
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
                        catalog, selectedDetail, { selectedDetail = it.connectionId }, onSelect,
                        { pendingRemoval = it }, { showAdd = true }, Modifier.width(360.dp),
                    )
                    HorizontalDivider(Modifier.fillMaxSize().width(1.dp))
                    if (showAdd) {
                        AddHostPanel(onPair, Modifier.weight(1f))
                    } else {
                        HostDetail(
                            catalog.hosts.firstOrNull { it.connectionId == selectedDetail },
                            selectedDetail == catalog.selectedConnectionId,
                            Modifier.weight(1f),
                        )
                    }
                }
            } else if (showAdd) {
                AddHostPanel(onPair, Modifier.fillMaxSize())
            } else {
                HostList(
                    catalog, selectedDetail, { selectedDetail = it.connectionId }, onSelect,
                    { pendingRemoval = it }, { showAdd = true }, Modifier.fillMaxSize(),
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
}

@Composable
private fun HostList(
    catalog: HostUiCatalog,
    selectedDetail: ClientConnectionId?,
    onDetail: (HostRecord) -> Unit,
    onSelect: (ClientConnectionId) -> Unit,
    onRemove: (HostRecord) -> Unit,
    onAdd: () -> Unit,
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
            Card(
                modifier = Modifier.fillMaxWidth().clickable { onDetail(host) },
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
                                selected -> stringResource(R.string.hosts_selected)
                                secondary -> stringResource(R.string.hosts_kept_ready)
                                else -> host.desktopId
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!selected) {
                        TextButton(onClick = { onSelect(host.connectionId) }) {
                            Text(stringResource(R.string.hosts_switch))
                        }
                    }
                    IconButton(onClick = { onRemove(host) }) {
                        Icon(Icons.Outlined.Delete, stringResource(R.string.hosts_remove))
                    }
                }
            }
        }
        item {
            TextButton(onClick = onAdd) {
                Icon(Icons.Outlined.Add, contentDescription = null)
                Text(stringResource(R.string.hosts_add), Modifier.padding(start = 8.dp))
            }
        }
    }
}

@Composable
private fun HostDetail(host: HostRecord?, selected: Boolean, modifier: Modifier) {
    Column(modifier.padding(32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (host == null) {
            Text(stringResource(R.string.hosts_choose_detail))
            return@Column
        }
        Icon(Icons.Outlined.Computer, contentDescription = null)
        Text(host.label, style = MaterialTheme.typography.headlineSmall)
        Text(host.desktopId, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(host.httpBaseUrl, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (selected) Text(stringResource(R.string.hosts_selected))
    }
}

@Composable
private fun AddHostPanel(
    onPair: (AppSession.PairingInput) -> Unit,
    modifier: Modifier,
) {
    var link by remember { mutableStateOf("") }
    var endpoint by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    Column(modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.hosts_add), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.hosts_add_description))
        OutlinedTextField(
            link, { link = it }, label = { Text(stringResource(R.string.pairing_link_label)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            endpoint, { endpoint = it },
            label = { Text(stringResource(R.string.server_base_url)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            token, { token = it },
            label = { Text(stringResource(R.string.one_time_pairing_token)) },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.weight(1f))
        Button(
            onClick = {
                onPair(AppSession.PairingInput(link, endpoint, token))
                link = ""
                token = ""
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.hosts_add_action)) }
    }
}
