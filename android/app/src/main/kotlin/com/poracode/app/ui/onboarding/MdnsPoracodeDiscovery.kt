package com.poracode.app.ui.onboarding

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * mDNS pairing discovery (V5 plan item P4). The desktop advertises
 * `_poracode._tcp.local` only for TLS-configured lan/tailnet binds, and the
 * TXT record carries the leaf-certificate fingerprint for pin-on-first-connect.
 * Discovery only ever FINDS an endpoint — the one-time pairing credential is
 * still required, and manual entry stays available beside it.
 */

/** One discovered desktop, as the pairing form consumes it. */
data class DiscoveredPoracodeHost(
    val serviceName: String,
    val desktopId: String?,
    val host: String?,
    val port: Int?,
    val tlsFingerprint: String?,
)

/**
 * Pure TXT-record decoding shared by the discovery callbacks and the JVM
 * tests: attributes arrive as raw bytes keyed by name.
 */
object PoracodeServiceRecords {
    const val SERVICE_TYPE: String = "_poracode._tcp."

    fun desktopId(attributes: Map<String, ByteArray>): String? =
        text(attributes["id"])

    fun tlsFingerprint(attributes: Map<String, ByteArray>): String? =
        text(attributes["fp"])?.takeIf { it.startsWith("sha256:") }?.substringAfter("sha256:")

    fun endpoint(host: String?, port: Int?): String? {
        val trimmedHost = host?.trim().takeUnless { it.isNullOrEmpty() } ?: return null
        if (port == null || port <= 0 || port > 65535) return null
        return "https://$trimmedHost:$port"
    }

    private fun text(raw: ByteArray?): String? =
        raw?.toString(Charsets.UTF_8)?.trim()?.takeIf { it.isNotEmpty() }
}

/**
 * Thin NsdManager coordinator. The JVM test suite cannot run NsdManager, so
 * every decision lives in [PoracodeServiceRecords] and the state model here is
 * a straight projection of the platform callbacks.
 */
class PoracodeNsdDiscovery(context: Context) {
    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as? NsdManager
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mutableHosts = MutableStateFlow<List<DiscoveredPoracodeHost>>(emptyList())
    private val mutableScanning = MutableStateFlow(false)

    /** Deduplicated by service name; newest record wins. */
    val hosts: StateFlow<List<DiscoveredPoracodeHost>> = mutableHosts.asStateFlow()
    val scanning: StateFlow<Boolean> = mutableScanning.asStateFlow()

    private var discoveryListener: NsdManager.DiscoveryListener? = null

    fun start() {
        val manager = nsdManager ?: return
        if (mutableScanning.value || discoveryListener != null) return
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {
                mutableScanning.value = true
            }

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                mutableScanning.value = false
                discoveryListener = null
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                mutableScanning.value = false
                discoveryListener = null
            }

            override fun onDiscoveryStopped(serviceType: String) {
                mutableScanning.value = false
                discoveryListener = null
            }

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                resolve(serviceInfo)
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                mutableHosts.value = mutableHosts.value.filterNot {
                    it.serviceName == serviceInfo.serviceName
                }
            }
        }
        discoveryListener = listener
        try {
            manager.discoverServices(PoracodeServiceRecords.SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        } catch (_: Exception) {
            mutableScanning.value = false
            discoveryListener = null
        }
    }

    fun stop() {
        val manager = nsdManager ?: return
        val listener = discoveryListener ?: run {
            mutableHosts.value = emptyList()
            return
        }
        discoveryListener = null
        try {
            manager.stopServiceDiscovery(listener)
        } catch (_: Exception) {
            mutableScanning.value = false
        }
        mutableHosts.value = emptyList()
    }

    private fun resolve(serviceInfo: NsdServiceInfo) {
        val manager = nsdManager ?: return
        try {
            manager.resolveService(
                serviceInfo,
                object : NsdManager.ResolveListener {
                    override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) = Unit

                    override fun onServiceResolved(info: NsdServiceInfo) {
                        val attributes: Map<String, ByteArray> = info.attributes
                        val resolved = DiscoveredPoracodeHost(
                            serviceName = info.serviceName,
                            desktopId = PoracodeServiceRecords.desktopId(attributes),
                            host = info.host?.hostAddress,
                            port = info.port,
                            tlsFingerprint = PoracodeServiceRecords.tlsFingerprint(attributes),
                        )
                        val next = mutableHosts.value
                            .filterNot { it.serviceName == resolved.serviceName } + resolved
                        mutableHosts.value = next.sortedBy { it.serviceName }
                    }
                },
            )
        } catch (_: Exception) {
            // Resolution is best effort; the entry stays whatever it was.
        }
    }
}

/** Remembers a discovery session for the lifetime of the hosting screen. */
@Composable
internal fun rememberPoracodeDiscovery(): PoracodeNsdDiscovery? {
    val context = androidx.compose.ui.platform.LocalContext.current
    val discovery = remember {
        runCatching { PoracodeNsdDiscovery(context) }.getOrNull()
    }
    DisposableEffect(discovery) {
        onDispose { discovery?.stop() }
    }
    return discovery
}

/**
 * The discoverability affordance inside the Other-ways sheet: scanning for
 * nearby hosts is explicit (an Android NsdManager browse wakes the local
 * network stack), and manual entry stays right below.
 */
@Composable
internal fun NearbyHostsSection(
    hosts: List<DiscoveredPoracodeHost>,
    scanning: Boolean,
    enabled: Boolean,
    onToggleScan: () -> Unit,
    onSelect: (DiscoveredPoracodeHost) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Outlined.Wifi,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                stringResource(R.string.discover_hosts_title),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier
                    .weight(1f)
                    .semantics { heading() },
            )
            TextButton(
                onClick = onToggleScan,
                enabled = enabled,
                modifier = Modifier.padding(start = 6.dp),
            ) {
                Text(
                    stringResource(
                        if (scanning) R.string.discover_hosts_stop else R.string.discover_hosts_start,
                    ),
                )
            }
        }
        if (hosts.isEmpty()) {
            Text(
                stringResource(
                    if (scanning) R.string.discover_hosts_searching else R.string.discover_hosts_empty,
                ),
                style = MaterialTheme.typography.bodySmall,
                color = OnboardingMuted,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                for (host in hosts) {
                    TextButton(
                        onClick = { onSelect(host) },
                        enabled = enabled,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(
                                Icons.Outlined.Dns,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(0.dp),
                            ) {
                                Text(
                                    host.serviceName,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                val endpoint = PoracodeServiceRecords.endpoint(host.host, host.port)
                                if (endpoint != null) {
                                    Text(
                                        endpoint,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = OnboardingMuted,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
