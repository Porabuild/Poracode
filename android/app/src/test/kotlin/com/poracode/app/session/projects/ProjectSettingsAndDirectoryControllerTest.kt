package com.poracode.app.session.projects

import com.poracode.app.model.BrowseHostDirectoryResult
import com.poracode.app.model.HostDirectoryEntry
import com.poracode.app.model.HostDirectoryEntryType
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectSettings
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProjectSettingsAndDirectoryControllerTest {
    @Test
    fun settingsCacheUsesHostProjectIdentityAndInvalidatesOnlyChangedHost() = runTest {
        val hostA = lease(connectionA)
        val hostB = lease(connectionB)
        val session = MutableStateFlow<ProjectHostLease?>(hostA)
        val gateway = FakeProjectGateway()
        gateway.settingsHandler = { lease, _ ->
            if (lease.connectionId == connectionA) ProjectSettings(emptyList()) else ProjectSettings()
        }
        val controller = ProjectSettingsController(session, gateway)
        val identityA = ProjectIdentity(connectionA, "same-project")
        val identityB = ProjectIdentity(connectionB, "same-project")

        controller.load(identityA)
        session.value = hostB
        controller.load(identityB)

        assertEquals(emptyList<Nothing>(), controller.state.value.entries[identityA]?.settings?.mcpServers)
        assertNull(controller.state.value.entries[identityB]?.settings?.mcpServers)
        assertEquals(2, controller.state.value.entries.size)
        controller.onProjectsChanged(connectionA)
        assertTrue(identityA !in controller.state.value.entries)
        assertTrue(identityB in controller.state.value.entries)
    }

    @Test
    fun settingsInvalidationMakesInflightCallbackStale() = runTest {
        val active = lease()
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeProjectGateway()
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        gateway.settingsHandler = { _, _ ->
            started.complete(Unit)
            release.await()
            ProjectSettings(emptyList())
        }
        val controller = ProjectSettingsController(session, gateway)
        val identity = ProjectIdentity(connectionA, "project")

        val loading = async { controller.load(identity) }
        runCurrent()
        started.await()
        controller.onProjectsChanged(connectionA)
        release.complete(Unit)

        assertSame(ProjectOperationResult.Stale, loading.await())
        assertTrue(controller.state.value.entries.isEmpty())
    }

    @Test
    fun directoryClearsOldListingImmediatelyAndKeepsItClearedOnFailure() = runTest {
        val active = lease()
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val gateway = FakeProjectGateway()
        val drives = BrowseHostDirectoryResult(
            path = BrowseHostDirectoryResult.DRIVE_PSEUDO_ROOT,
            parentPath = null,
            homePath = "C:\\Users\\Zoë",
            entries = listOf(
                HostDirectoryEntry("系统", "C:\\", HostDirectoryEntryType.DIRECTORY),
                HostDirectoryEntry("D drive", "D:\\", HostDirectoryEntryType.DIRECTORY),
            ),
            truncated = false,
        )
        gateway.directoryHandler = { _, _ -> drives }
        val controller = HostDirectoryController(session, gateway)
        controller.navigate(BrowseHostDirectoryResult.DRIVE_PSEUDO_ROOT)
        val key = active.key
        assertEquals(listOf("系统", "D drive"), controller.state.value.sessions[key]?.listing
            ?.entries?.map { it.name })

        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        gateway.directoryHandler = { _, _ ->
            started.complete(Unit)
            release.await()
            throw ProjectGatewayException(500, "browse_failed", false)
        }
        val failing = async { controller.navigate("\\\\wsl$\\Ubuntu\\home\\zoë\\项目") }
        runCurrent()
        started.await()

        val loading = controller.state.value.sessions.getValue(key)
        assertNull(loading.listing)
        assertTrue(loading.loading)
        release.complete(Unit)
        val result = failing.await() as ProjectOperationResult.Failed

        assertTrue(result.failure is ProjectOperationFailure.Remote)
        val failed = controller.state.value.sessions.getValue(key)
        assertNull(failed.listing)
        assertEquals("\\\\wsl$\\Ubuntu\\home\\zoë\\项目", failed.requestedPath)
        assertTrue(!failed.loading)
        assertEquals(
            listOf(BrowseHostDirectoryResult.DRIVE_PSEUDO_ROOT, failed.requestedPath),
            gateway.directoryReads.map { it.second },
        )
    }

    @Test
    fun staleDirectoryResponseCannotReplaceNewHostNavigation() = runTest {
        val hostA = lease(connectionA, generation = 3)
        val hostB = lease(connectionB, generation = 8)
        val session = MutableStateFlow<ProjectHostLease?>(hostA)
        val gateway = FakeProjectGateway()
        val release = CompletableDeferred<Unit>()
        gateway.directoryHandler = { _, path ->
            release.await()
            BrowseHostDirectoryResult(path, null, path, emptyList(), false)
        }
        val controller = HostDirectoryController(session, gateway)

        val operation = async { controller.navigate("/old-host") }
        runCurrent()
        session.value = hostB
        release.complete(Unit)

        assertSame(ProjectOperationResult.Stale, operation.await())
        assertNull(controller.state.value.sessions[hostA.key]?.listing)
        assertTrue(hostB.key !in controller.state.value.sessions)
    }

    @Test
    fun onlineReadyAndManageCapabilityGateDirectoryAndSettings() = runTest {
        val gateway = FakeProjectGateway()
        val offline = lease(online = false)
        val session = MutableStateFlow<ProjectHostLease?>(offline)
        val directory = HostDirectoryController(session, gateway)
        val settings = ProjectSettingsController(session, gateway)

        val offlineResult = directory.navigate("/") as ProjectOperationResult.Failed
        assertSame(ProjectOperationFailure.Offline, offlineResult.failure)
        session.value = lease(scopes = setOf("session:read", "session:operate"))
        val denied = settings.load(ProjectIdentity(connectionA, "p"))
            as ProjectOperationResult.Failed

        assertTrue(denied.failure is ProjectOperationFailure.AuthorizationDenied)
        assertTrue(gateway.directoryReads.isEmpty())
        assertTrue(gateway.settingsReads.isEmpty())
    }
}
