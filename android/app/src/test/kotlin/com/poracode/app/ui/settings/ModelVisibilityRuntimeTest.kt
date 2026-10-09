package com.poracode.app.ui.settings

import com.poracode.app.model.*
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostUiCatalog
import com.poracode.app.storage.*
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteWebSocketClient
import com.poracode.app.transport.settings.SettingsRemoteApiClient
import com.poracode.app.transport.settings.SettingsRemoteGatewayFactory
import com.poracode.app.ui.home.HomeQuickComposeCatalog
import com.poracode.app.ui.richchat.RichChatComposerControlCatalog
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

/** Exercises the production app composition, credential gateway and settings JSON route. */
@OptIn(ExperimentalCoroutinesApi::class)
class ModelVisibilityRuntimeTest {
    @Test
    fun sharedSettingsRouteFeedsBothNativeCatalogsWithoutOpeningSettings() = runTest {
        val server = MockWebServer()
        server.enqueue(response("""{"provider":[],"provider-gui":["old"]}"""))
        server.start()
        val profile = profile(server.url("/prefix").toString())
        val state = MutableStateFlow(readyState(HOST_A, profile))
        val runtime = SettingsUiComposition(
            state, VisibilityRepository(profile), backgroundScope, StandardTestDispatcher(testScheduler),
            remoteFactory = SettingsRemoteGatewayFactory { endpoint, token ->
                SettingsRemoteApiClient(endpoint, token, OkHttpClient(), ForegroundNetworkGate())
            },
        )
        try {
            runCurrent()
            awaitSettingsRead(runtime)
            val request = requireNotNull(server.takeRequest(5, TimeUnit.SECONDS))
            assertEquals("GET", request.method)
            assertEquals("/prefix/api/settings", request.path)
            assertEquals("Bearer test-token", request.getHeader("Authorization"))
            assertBoth(listOf("latest", "old", "kept"), overrides(runtime))

            // Foreground refresh consumes a desktop edit, including literal exact ids.
            server.enqueue(response("""{"provider":["latest"]}"""))
            runtime.onForeground()
            runCurrent()
            awaitSettingsRead(runtime)
            assertBoth(listOf("old", "kept"), overrides(runtime))

            // Switching hosts cannot keep the first host's explicit show-all/list.
            server.enqueue(response("{}"))
            state.value = readyState(HOST_B, profile)
            runCurrent()
            awaitSettingsRead(runtime)
            assertBoth(listOf("latest", "kept"), overrides(runtime))
            assertEquals(3, server.requestCount)
        } finally {
            runtime.close()
            server.shutdown()
        }
    }

    @Test
    fun failedSettingsReadAndReconnectKeepDefaultsUntilFreshOverrideArrives() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(500).setBody("{}"))
        server.start()
        val profile = profile(server.url("/").toString())
        val state = MutableStateFlow(readyState(HOST_A, profile))
        val runtime = SettingsUiComposition(
            state, VisibilityRepository(profile), backgroundScope, StandardTestDispatcher(testScheduler),
            remoteFactory = SettingsRemoteGatewayFactory { endpoint, token ->
                SettingsRemoteApiClient(endpoint, token, OkHttpClient(), ForegroundNetworkGate())
            },
        )
        try {
            runCurrent()
            awaitSettingsRead(runtime)
            assertNull(overrides(runtime))
            assertBoth(listOf("latest", "kept"), overrides(runtime))
            state.value = state.value.copy(socketState = RemoteWebSocketClient.ConnectionState.Reconnecting)
            runCurrent()
            server.enqueue(response("""{"provider":[]}"""))
            state.value = state.value.copy(socketState = RemoteWebSocketClient.ConnectionState.Online)
            runCurrent()
            awaitSettingsRead(runtime)
            assertBoth(listOf("latest", "old", "kept"), overrides(runtime))
            assertEquals(2, server.requestCount)
        } finally {
            runtime.close()
            server.shutdown()
        }
    }

    @Test
    fun lateOldHostSettingsCannotReplaceTheNewHostsVisibility() = runTest {
        val oldRead = CompletableDeferred<com.poracode.app.model.settings.HostSettingsSnapshot>()
        var calls = 0
        val remote = com.poracode.app.session.settings.FakeSettingsRemoteGateway().apply {
            readHandler = {
                calls += 1
                if (calls == 1) oldRead.await() else
                    com.poracode.app.model.settings.HostSettingsSnapshot(json("""{"settings":{"hiddenModels":{"provider":[]}}}"""))
            }
        }
        val profile = profile("https://host.example.test")
        val state = MutableStateFlow(readyState(HOST_A, profile))
        val runtime = SettingsUiComposition(
            state, VisibilityRepository(profile), backgroundScope, StandardTestDispatcher(testScheduler),
            remoteFactory = SettingsRemoteGatewayFactory { _, _ -> remote },
        )
        try {
            runCurrent()
            runtime.controller.refreshModelVisibility()
            runCurrent()
            assertEquals(1, calls) // Home entry shares the active read.
            state.value = readyState(HOST_B, profile)
            runCurrent()
            assertBoth(listOf("latest", "old", "kept"), overrides(runtime))
            oldRead.complete(com.poracode.app.model.settings.HostSettingsSnapshot(
                json("""{"settings":{"hiddenModels":{"provider":["latest","old"]}}}"""),
            ))
            runCurrent()
            assertBoth(listOf("latest", "old", "kept"), overrides(runtime))
            assertEquals(2, calls)
        } finally {
            runtime.close()
        }
    }

    @Test
    fun onlySelectedDeclaredGuiVariantUsesScopedKeyWithPlainFallback() {
        val plain = json("""{"provider":[],"provider-gui":["latest","old"]}""")
        assertBoth(listOf("latest", "old", "kept"), plain)
        assertBoth(listOf("latest", "kept"), json("""{"provider-gui":[]}"""))
        val variant = status(runtimeLabel = "ACP", variantMode = "gui")
        assertBoth(listOf("latest", "old", "kept"), json("""{"provider":["old"],"provider-acp":[]}"""), variant)
        assertBoth(listOf("old", "kept"), json("""{"provider":[],"provider-acp":["latest"]}"""), variant)
        assertBoth(listOf("latest", "old", "kept"), json("""{"provider":[]}"""), variant)
        assertBoth(listOf("latest", "kept"), json("""{"provider-acp":[]}"""), status("ACP", "terminal"))
        assertBoth(listOf("latest", "kept"), json("""{"provider-acp":[]}"""), status("Other", "gui"))
        val terminal = HomeQuickComposeCatalog(
            variant, ThreadPresentationMode.Terminal, ThreadConfig(model = "kept"),
            json("""{"provider":["old"],"provider-acp":[]}"""),
        )
        assertEquals(listOf("latest", "kept"), terminal.models.map { it.id })
    }

    private suspend fun awaitSettingsRead(runtime: SettingsUiComposition) {
        runtime.information.state.first { state ->
            val entry = runtime.hostLease.value?.let { state.entries[it.key] }
            entry != null && entry.loading.isEmpty() && (entry.settings != null || entry.failures.isNotEmpty())
        }
    }

    private fun overrides(runtime: SettingsUiComposition): JsonObject? =
        runtime.hostLease.value?.let { runtime.information.state.value.entries[it.key] }
            ?.settings?.settings?.get("hiddenModels") as? JsonObject

    private fun assertBoth(expected: List<String>, hidden: JsonObject?, agent: AgentStatusEntry = status()) {
        val configuration = ThreadConfig(model = "kept")
        assertEquals(expected, HomeQuickComposeCatalog(agent, ThreadPresentationMode.Gui, configuration, hidden).models.map { it.id })
        assertEquals(expected, RichChatComposerControlCatalog(agent, configuration, userHiddenModels = hidden).models.map { it.id })
    }

    private fun status(runtimeLabel: String? = null, variantMode: String? = null): AgentStatusEntry {
        val capabilities = json("""{"models":[{"id":"latest","label":"Latest"},{"id":"old","label":"Old"},{"id":"kept","label":"Kept"}],"defaultHiddenModels":["old"]}""")
        val raw = buildJsonObject {
            put("capabilities", JsonObject(capabilities + buildJsonObject {
                runtimeLabel?.let { put("presentationCapabilities", buildJsonObject {
                    put("gui", JsonObject(capabilities + ("runtimeLabel" to JsonPrimitive(it))))
                }) }
            }))
            variantMode?.let { put("runtimeVariants", buildJsonObject {
                put("acp", buildJsonObject { put("presentationMode", it); put("capabilities", capabilities) })
            }) }
        }
        return AgentStatusEntry("provider|posix|", "provider", "Provider", true, null, "authenticated", "posix", "", raw)
    }

    private fun response(hidden: String): MockResponse {
        // Start from the existing full settings contract, as an installed host returns it.
        val fixture = javaClass.classLoader!!.getResourceAsStream("fixtures/native-settings.json")!!
            .bufferedReader().use { json(it.readText()) }.getValue("settingsResponse").jsonObject
        val settings = fixture.getValue("settings").jsonObject
        val body = JsonObject(fixture + ("settings" to JsonObject(settings + ("hiddenModels" to json(hidden)))))
        return MockResponse().setBody(body.toString())
    }
    private fun json(value: String) = Json.parseToJsonElement(value).jsonObject
    private fun profile(endpoint: String) = ConnectionProfile(
        desktopId = "visibility-test", label = "Host", httpBaseUrl = endpoint, wsBaseUrl = "ws://localhost",
        appVersion = "1", scopes = listOf("session:read", "session:operate"), pairedAtEpochMs = 10,
        protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
    )
    private fun readyState(id: ClientConnectionId, profile: ConnectionProfile) = AppSession.UiState(
        phase = AppSession.Phase.Ready, profile = profile,
        socketState = RemoteWebSocketClient.ConnectionState.Online,
        hostCatalog = HostUiCatalog(hosts = listOf(HostRecord(id, profile)), selectedConnectionId = id, lru = listOf(id)),
    )
    private companion object {
        val HOST_A = ClientConnectionId("10000000-0000-4000-8000-000000000001")
        val HOST_B = ClientConnectionId("20000000-0000-4000-8000-000000000002")
    }
}

private class VisibilityRepository(private val profile: ConnectionProfile) : MultiHostCredentialRepository {
    override suspend fun credentialsFor(id: ClientConnectionId) = SessionCredentials(profile, "test-token")
    override suspend fun catalogSnapshot() = HostCatalogSnapshot(HostRegistryDocument(), false)
    override suspend fun loadOutcome() = SessionCredentialLoadOutcome.Empty
    override fun beginDurableOperation(kind: DurableOperationToken.Kind) = DurableOperationToken(1, kind)
    override suspend fun commit(profile: ConnectionProfile, accessToken: String, owning: DurableOperationToken) = CredentialMutationOutcome.RejectedBeforeApply
    override suspend fun clear(owning: DurableOperationToken) = CredentialMutationOutcome.RejectedBeforeApply
    override fun beginHostOperation(kind: HostOperationKind) = HostOperationReceipt(1, kind)
    override suspend fun selectHost(id: ClientConnectionId, owning: HostOperationReceipt) = HostMutationResult.RejectedBeforeApply
    override suspend fun removeHost(id: ClientConnectionId, owning: HostOperationReceipt) = HostMutationResult.RejectedBeforeApply
    override fun hasPendingClearMarker() = false
    override fun hasV2DocumentForTests() = false
    override fun rawV2BytesForTests(): ByteArray? = null
    override fun hasLegacyMaterialForTests() = false
}
