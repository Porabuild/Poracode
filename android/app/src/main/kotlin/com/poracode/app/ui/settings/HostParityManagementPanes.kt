package com.poracode.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.settings.HostParityClients
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

internal val LocalHostApiClientProvider =
    staticCompositionLocalOf<(suspend () -> RemoteApiClient?)?> { null }

@Composable
internal fun AcpRegistryManagementPane(
    api: RemoteApiClient? = null,
    modifier: Modifier = Modifier,
) {
    val provider = LocalHostApiClientProvider.current
    val scope = rememberCoroutineScope()
    var resolvedApi by remember(api) { mutableStateOf(api) }
    var loading by remember { mutableStateOf(false) }
    var items by remember { mutableStateOf<List<Triple<String, String, Boolean>>>(emptyList()) }

    fun refresh() {
        scope.launch {
            val client = resolvedApi ?: provider?.invoke()?.also { resolvedApi = it } ?: return@launch
            loading = true
            val res = runCatching { HostParityClients.listAcpRegistry(client) }.getOrNull()
            val rawAgents = (res?.get("result") as? JsonObject)?.get("agents") as? JsonArray
            items = rawAgents.orEmpty().mapNotNull { el ->
                val obj = el as? JsonObject ?: return@mapNotNull null
                val id = (obj["id"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
                val name = (obj["name"] as? JsonPrimitive)?.contentOrNull ?: id
                val installed = (obj["installed"] as? JsonPrimitive)?.booleanOrNull == true
                Triple(id, name, installed)
            }
            loading = false
        }
    }

    LaunchedEffect(api, provider) { refresh() }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (loading) item { CircularProgressIndicator() }
        items(items, key = { it.first }) { (id, name, installed) ->
            PoracodeCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(name, style = PoracodeTextStyles.rowTitle, modifier = Modifier.weight(1f))
                    if (installed) {
                        OutlinedButton(onClick = {
                            val c = resolvedApi ?: return@OutlinedButton
                            scope.launch { runCatching { HostParityClients.updateAcpRegistryAgent(id, c) }; refresh() }
                        }) { Text("Update") }
                        OutlinedButton(onClick = {
                            val c = resolvedApi ?: return@OutlinedButton
                            scope.launch { runCatching { HostParityClients.removeAcpRegistryAgent(id, c) }; refresh() }
                        }) { Text("Remove") }
                    } else {
                        FilledTonalButton(onClick = {
                            val c = resolvedApi ?: return@FilledTonalButton
                            scope.launch { runCatching { HostParityClients.installAcpRegistryAgent(id, c) }; refresh() }
                        }) { Text("Install") }
                    }
                }
            }
        }
    }
}

@Composable
internal fun HostPluginsManagementPane(
    api: RemoteApiClient? = null,
    projectId: String? = null,
    modifier: Modifier = Modifier,
) {
    val provider = LocalHostApiClientProvider.current
    val scope = rememberCoroutineScope()
    var resolvedApi by remember(api) { mutableStateOf(api) }
    var loading by remember { mutableStateOf(false) }
    var plugins by remember { mutableStateOf<List<Triple<String, String, Boolean>>>(emptyList()) }

    fun load() {
        scope.launch {
            val client = resolvedApi ?: provider?.invoke()?.also { resolvedApi = it } ?: return@launch
            loading = true
            val res = runCatching { HostParityClients.listPlugins(projectId, client) }.getOrNull()
            val arr = (res?.get("result") as? JsonObject)?.get("plugins") as? JsonArray
            plugins = arr.orEmpty().mapNotNull { el ->
                val obj = el as? JsonObject ?: return@mapNotNull null
                val id = (obj["id"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
                val name = (obj["name"] as? JsonPrimitive)?.contentOrNull ?: id
                val enabled = (obj["enabled"] as? JsonPrimitive)?.booleanOrNull ?: true
                Triple(id, name, enabled)
            }
            loading = false
        }
    }

    LaunchedEffect(api, provider, projectId) { load() }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            OutlinedButton(onClick = {
                val c = resolvedApi ?: return@OutlinedButton
                scope.launch { runCatching { HostParityClients.refreshPlugins(c) }; load() }
            }) { Text("Refresh plugins") }
        }
        if (loading) item { CircularProgressIndicator() }
        items(plugins, key = { it.first }) { (_, name, enabled) ->
            PoracodeCard {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(name, style = PoracodeTextStyles.rowTitle, modifier = Modifier.weight(1f))
                    Text(
                        if (enabled) "Enabled" else "Disabled",
                        style = PoracodeTextStyles.rowMeta,
                        color = PoracodeTheme.colors.muted,
                    )
                }
            }
        }
    }
}

@Composable
internal fun HostMemoryCatalogPane(
    api: RemoteApiClient? = null,
    projectId: String? = null,
    modifier: Modifier = Modifier,
) {
    val provider = LocalHostApiClientProvider.current
    val scope = rememberCoroutineScope()
    var resolvedApi by remember(api) { mutableStateOf(api) }
    var loading by remember { mutableStateOf(false) }
    var syncing by remember { mutableStateOf(false) }
    var entries by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }

    fun load() {
        scope.launch {
            val client = resolvedApi ?: provider?.invoke()?.also { resolvedApi = it } ?: return@launch
            loading = true
            val res = runCatching { HostParityClients.fetchMemoryCatalog(projectId, client) }.getOrNull()
            val arr = (res?.get("entries") as? JsonArray) ?: (res?.get("memories") as? JsonArray)
            entries = arr.orEmpty().mapNotNull { el ->
                val obj = el as? JsonObject ?: return@mapNotNull null
                val id = (obj["id"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
                val text = (obj["summary"] as? JsonPrimitive)?.contentOrNull
                    ?: (obj["content"] as? JsonPrimitive)?.contentOrNull
                    ?: (obj["title"] as? JsonPrimitive)?.contentOrNull
                    ?: id
                id to text
            }
            loading = false
        }
    }

    LaunchedEffect(api, provider, projectId) { load() }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            FilledTonalButton(
                onClick = {
                    val c = resolvedApi ?: return@FilledTonalButton
                    syncing = true
                    scope.launch {
                        runCatching { HostParityClients.runMemorySync(api = c) }
                        syncing = false
                        load()
                    }
                },
                enabled = !syncing && resolvedApi != null,
            ) {
                Text(if (syncing) "Syncing…" else "Sync across environments")
            }
        }
        if (loading) item { CircularProgressIndicator() }
        if (entries.isEmpty() && !loading) {
            item {
                Text(
                    "No learned memories yet.",
                    style = MaterialTheme.typography.bodySmall,
                    color = PoracodeTheme.colors.muted,
                )
            }
        }
        items(entries, key = { it.first }) { (_, summary) ->
            PoracodeCard {
                Text(summary, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
