package com.poracode.app.session.projects

import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectSettings
import com.poracode.app.model.RemoteClientException
import com.poracode.app.transport.ProjectRemoteGatewayProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GeneratedProjectSessionGatewayTest {
    @Test
    fun resolvesExactLeaseAndRejectsHostCollisionBeforeTransport() = runTest {
        val active = lease(connectionA, generation = 3)
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val remote = FakeProjectRemoteGateway()
        var providerCalls = 0
        val gateway = GeneratedProjectSessionGateway(
            session,
            ProjectRemoteGatewayProvider { captured ->
                providerCalls += 1
                assertEquals(active.key, captured.key)
                remote
            },
        )
        val good = ProjectIdentity(connectionA, "same-project")
        assertEquals(ProjectSettings(), gateway.projectSettings(active, good))

        val error = runCatching {
            gateway.projectSettings(active, ProjectIdentity(connectionB, "same-project"))
        }.exceptionOrNull() as ProjectGatewayException
        assertEquals("invalid_project_identity", error.code)
        assertEquals(1, providerCalls)
        assertEquals(listOf("same-project"), remote.settingsIds)
    }

    @Test
    fun staleHostAfterResponseNeverReturnsValue() = runTest {
        val hostA = lease(connectionA, generation = 3)
        val hostB = lease(connectionB, generation = 9)
        val session = MutableStateFlow<ProjectHostLease?>(hostA)
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val remote = FakeProjectRemoteGateway().apply {
            settingsHandler = {
                started.complete(Unit)
                release.await()
                ProjectSettings()
            }
        }
        val gateway = GeneratedProjectSessionGateway(
            session,
            ProjectRemoteGatewayProvider { remote },
        )

        val result = CompletableDeferred<Throwable?>()
        backgroundScope.launch {
            result.complete(
                runCatching {
                    gateway.projectSettings(hostA, ProjectIdentity(connectionA, "project"))
                }.exceptionOrNull(),
            )
        }
        runCurrent()
        started.await()
        session.value = hostB
        release.complete(Unit)

        val error = result.await() as ProjectGatewayException
        assertEquals("stale_lease", error.code)
    }

    @Test
    fun maps401And403MissingScopeWithoutPayloadOrTokenLeak() = runTest {
        val active = lease()
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val remote = FakeProjectRemoteGateway()
        val failures = ArrayDeque(
            listOf(
                RemoteClientException("access-secret payload", 401, "invalid_token"),
                RemoteClientException("scope detail", 403, "missing_scope"),
            ),
        )
        remote.settingsHandler = { throw failures.removeFirst() }
        val gateway = GeneratedProjectSessionGateway(
            session,
            ProjectRemoteGatewayProvider { remote },
        )

        val errors = (1..2).map {
            runCatching {
                gateway.projectSettings(active, ProjectIdentity(connectionA, "project"))
            }.exceptionOrNull() as ProjectGatewayException
        }

        assertEquals(listOf(401, 403), errors.map { it.statusCode })
        assertEquals(listOf("invalid_token", "missing_scope"), errors.map { it.code })
        errors.forEach {
            assertFalse(it.message.orEmpty().contains("secret"))
            assertFalse(it.message.orEmpty().contains("scope detail"))
        }
    }

    @Test
    fun ambiguousMutationFailsOnceAndReadFailureIsNotMarkedCommitted() = runTest {
        val active = lease()
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val remote = FakeProjectRemoteGateway().apply {
            commandHandler = {
                throw RemoteClientException("network payload", 0, "network")
            }
            settingsHandler = {
                throw RemoteClientException("network payload", 0, "network")
            }
        }
        val gateway = GeneratedProjectSessionGateway(
            session,
            ProjectRemoteGatewayProvider { remote },
        )

        val mutation = runCatching {
            gateway.projectCommand(active, com.poracode.app.model.RemoveProject("project"))
        }.exceptionOrNull() as ProjectGatewayException
        val read = runCatching {
            gateway.projectSettings(active, ProjectIdentity(connectionA, "project"))
        }.exceptionOrNull() as ProjectGatewayException

        assertTrue(mutation.requestMayHaveCommitted)
        assertFalse(read.requestMayHaveCommitted)
        assertEquals(1, remote.commandCalls)
        assertEquals(1, remote.settingsIds.size)
    }

    @Test
    fun cancellationAlwaysRethrowsUnchanged() = runTest {
        val active = lease()
        val session = MutableStateFlow<ProjectHostLease?>(active)
        val cancellation = CancellationException("background")
        val remote = FakeProjectRemoteGateway().apply {
            settingsHandler = { throw cancellation }
        }
        val gateway = GeneratedProjectSessionGateway(
            session,
            ProjectRemoteGatewayProvider { remote },
        )

        try {
            gateway.projectSettings(active, ProjectIdentity(connectionA, "project"))
            fail("Expected cancellation")
        } catch (error: CancellationException) {
            assertSame(cancellation, error)
        }
    }

    @Test
    fun scopeAndReadinessAreRecheckedBeforeProvider() = runTest {
        val active = lease(scopes = setOf("session:read"), ready = false)
        val session = MutableStateFlow<ProjectHostLease?>(active)
        var providerCalls = 0
        val gateway = GeneratedProjectSessionGateway(
            session,
            ProjectRemoteGatewayProvider {
                providerCalls += 1
                FakeProjectRemoteGateway()
            },
        )

        val error = runCatching {
            gateway.projectSettings(active, ProjectIdentity(connectionA, "project"))
        }.exceptionOrNull() as ProjectGatewayException
        assertEquals("session_not_ready", error.code)
        assertEquals(0, providerCalls)

        val noScope = active.copy(generation = 2, ready = true, scopes = setOf("session:read"))
        session.value = noScope
        val denied = runCatching {
            gateway.projectSettings(noScope, ProjectIdentity(connectionA, "project"))
        }.exceptionOrNull() as ProjectGatewayException
        assertEquals(403, denied.statusCode)
        assertEquals("missing_scope", denied.code)
        assertEquals(0, providerCalls)
    }
}
