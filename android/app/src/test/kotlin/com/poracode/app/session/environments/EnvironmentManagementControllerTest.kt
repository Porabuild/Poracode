package com.poracode.app.session.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentHostReference
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteEnvironmentCreateRequest
import com.poracode.app.model.RemoteEnvironmentProjection
import com.poracode.app.storage.HostCatalog
import com.poracode.app.storage.HostCatalogCredentialRepository
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostRegistryStore
import com.poracode.app.storage.InMemoryHostVault
import com.poracode.app.storage.LegacyHostImport
import com.poracode.app.storage.LegacyHostSource
import com.poracode.app.storage.LegacySourceBytes
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.environments.CatalogEnvironmentAuthorityFactory
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Capability and scope gating for the bound-host environment controller: actions
 * are disabled without the capability or scopes (no blanket authority throw, no
 * dial), and an environment host is management-only — it can never pair a
 * second proxied hop.
 */
class EnvironmentManagementControllerTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun accessRequiresTheDocumentedScopeCombinations() {
        val read = EnvironmentManagementController.accessFor(listOf("session:read"))
        assertTrue(read.canRead)
        assertFalse(read.canUse)
        assertFalse(read.canManage)

        val use = EnvironmentManagementController.accessFor(
            listOf("session:read", "session:operate", "ports:forward"),
        )
        assertTrue(use.canUse)
        assertFalse(use.canManage)

        val manage = EnvironmentManagementController.accessFor(
            listOf("projects:manage", "session:operate", "ports:forward"),
        )
        assertFalse(manage.canRead)
        assertTrue(manage.canUse)
        assertTrue(manage.canManage)
    }

    @Test
    fun missingCapabilityHidesTheFeatureAndNeverDials() = runTest {
        val fixture = fixture("capability")
        val controller = fixture.controller(this)
        fixture.addDirect(listOf("session:read"), sshEnvironmentsVersions = emptyList())

        controller.bind(fixture.parent())
        controller.refresh()

        assertFalse(controller.state.value.capabilityAvailable)
        assertEquals(EnvironmentManagementController.LoadState.Idle, controller.state.value.loadState)
    }

    @Test
    fun readOnlyHostCannotMutateAndReportsTheMissingScope() = runTest {
        val fixture = fixture("read-only")
        fixture.addDirect(
            scopes = listOf("session:read"),
            sshEnvironmentsVersions = listOf(1),
        )
        val controller = fixture.controller(this)
        controller.bind(fixture.parent())

        controller.create(RemoteEnvironmentCreateRequest(label = "Box", target = "host"))

        assertEquals(
            "missing_scope",
            controller.state.value.actionError?.code,
        )
        assertTrue(controller.state.value.environments.isEmpty())
    }

    @Test
    fun environmentHostIsManagementOnlyForPairing() = runTest {
        val fixture = fixture("nested")
        fixture.addDirect(
            scopes = listOf("projects:manage", "session:operate", "ports:forward", "session:read"),
            sshEnvironmentsVersions = listOf(1),
        )
        fixture.addEnvironment()
        val controller = fixture.controller(this)
        val environmentRecord = requireNotNull(
            fixture.catalog.snapshot().hosts.firstOrNull { it.isEnvironment },
        )
        controller.bind(environmentRecord)

        assertFalse(controller.state.value.directParent)
        controller.pairDevice(projection())

        assertEquals(
            "environment_nested_parent_unsupported",
            controller.state.value.actionError?.code,
        )
    }

    private fun projection(): RemoteEnvironmentProjection = RemoteEnvironmentProjection(
        environmentId = "11111111-1111-4111-8111-111111111111",
        revision = 1,
        label = "Box",
        target = "host",
        trust = com.poracode.app.model.RemoteEnvironmentTrust(state = "unknown"),
        runtime = com.poracode.app.model.RemoteEnvironmentRuntime(hash = "a".repeat(64)),
        credential = "none",
        desired = "enabled",
        state = "disconnected",
    )

    private fun fixture(name: String): Fixture {
        val directory = temporary.newFolder(name)
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(directory, "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
            clock = { 10_000L },
        )
        return Fixture(catalog)
    }

    private inner class Fixture(val catalog: HostCatalog) {
        suspend fun parent(): HostRecord =
            requireNotNull(catalog.snapshot().hosts.firstOrNull { !it.isEnvironment })

        fun controller(scope: TestScope): EnvironmentManagementController {
            val repository = HostCatalogCredentialRepository(catalog)
            val factory = CatalogEnvironmentAuthorityFactory(
                parentRecord = { id -> catalog.snapshot().document.host(id) },
                parentToken = { id -> catalog.token(id) },
            )
            return EnvironmentManagementController(
                repository = repository,
                pairingCoordinator = EnvironmentPairingCoordinator(
                    repository = repository,
                    authorityFactory = factory,
                    ioDispatcher = Dispatchers.IO,
                ),
                scope = scope.backgroundScope,
                ioDispatcher = Dispatchers.IO,
            )
        }

        suspend fun addDirect(scopes: List<String>, sshEnvironmentsVersions: List<Int>) {
            val record = HostRecord(
                connectionId = ClientConnectionId("00000000-0000-0000-0000-000000000001"),
                desktopId = "parent-desktop",
                label = "Parent",
                httpBaseUrl = "https://parent.test/",
                wsBaseUrl = "wss://parent.test/",
                appVersion = "12.0.0",
                scopes = scopes,
                pairedAtEpochMs = 1,
                protocolVersion = 12,
                sshEnvironmentsVersions = sshEnvironmentsVersions,
            )
            catalog.add(record, "parent-token", catalog.begin(HostOperationKind.Add))
        }

        suspend fun addEnvironment() {
            val environmentId = "11111111-1111-4111-8111-111111111111"
            val record = HostRecord(
                connectionId = ClientConnectionId("00000000-0000-0000-0000-000000000002"),
                desktopId = "child-desktop",
                label = "Environment",
                httpBaseUrl = "https://parent.test/api/environments/$environmentId/proxy",
                wsBaseUrl = "wss://parent.test/api/environments/$environmentId/proxy",
                appVersion = "12.0.0",
                scopes = listOf("projects:manage", "session:operate", "ports:forward"),
                pairedAtEpochMs = 1,
                protocolVersion = 12,
                environment = EnvironmentHostReference(
                    parentConnectionId = ClientConnectionId("00000000-0000-0000-0000-000000000001"),
                    environmentId = environmentId,
                    childDesktopId = "child-desktop",
                ),
            )
            catalog.add(record, "child-token", catalog.begin(HostOperationKind.Add))
        }
    }

    private object EmptyLegacySource : LegacyHostSource {
        override fun readRaw(): LegacySourceBytes = LegacySourceBytes()
        override suspend fun decodeV2(bytes: ByteArray): SessionCredentials? = null
        override suspend fun decodeV1(profile: ByteArray, token: ByteArray): SessionCredentials? = null
        override suspend fun clearIfUnchanged(
            fingerprint: String,
            sourceKind: LegacyHostImport.SourceKind,
        ): Boolean = true
    }
}
