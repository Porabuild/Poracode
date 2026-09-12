package com.poracode.app.ui.home

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HOME_PROJECT_ID
import com.poracode.app.model.HostRecord
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.HostPresentation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeProjectFilterPresentationTest {
    @Test
    fun optionsIncludeZeroThreadProjectsAndUseCollisionSafeHostOwnership() {
        val first = connection(1)
        val second = connection(2)
        val firstProject = project("shared", "Alpha")
        val secondProject = project("shared", "Beta")
        val options = HomeProjectFilterPresentation.options(
            hosts = listOf(host(first, "MacBook"), host(second, "Studio")),
            selectedConnectionId = first,
            selectedSnapshot = snapshot(
                projects = listOf(firstProject, project("disabled", "Hidden", disabled = true)),
                threads = listOf(
                    thread("visible", "shared"),
                    thread("archived", "shared", archived = true),
                    thread("terminal", "shared", presentationMode = "terminal"),
                ),
            ),
            hostSnapshots = mapOf(second to snapshot(projects = listOf(secondProject))),
        )

        assertEquals(listOf("Alpha", "Beta"), options.map { it.project.name })
        assertEquals(listOf(1, 0), options.map { it.threadCount })
        assertNotEquals(options[0].id, options[1].id)
        assertEquals(first, options[0].connectionId)
        assertEquals(second, options[1].connectionId)
        assertEquals(
            options[0].id,
            HomeThreadListPresentation.projectIdentity(
                HostPresentation.UnifiedThreadItem(
                    first,
                    "MacBook",
                    firstProject,
                    thread("identity", "shared"),
                ),
            ),
        )
    }

    @Test
    fun selectedSnapshotWinsOverCachedSelectedHostSnapshot() {
        val selected = connection(1)
        val options = HomeProjectFilterPresentation.options(
            hosts = listOf(host(selected, "MacBook")),
            selectedConnectionId = selected,
            selectedSnapshot = snapshot(projects = listOf(project("current", "Current"))),
            hostSnapshots = mapOf(
                selected to snapshot(projects = listOf(project("stale", "Stale"))),
            ),
        )

        assertEquals(listOf("Current"), options.map { it.project.name })
    }

    @Test
    fun projectExclusionsAreScopedToTheirOwningHost() {
        val first = connection(1)
        val second = connection(2)
        val options = HomeProjectFilterPresentation.options(
            hosts = listOf(host(first, "MacBook"), host(second, "Studio")),
            selectedConnectionId = first,
            selectedSnapshot = snapshot(projects = listOf(project("shared", "Alpha"))),
            hostSnapshots = mapOf(
                second to snapshot(projects = listOf(project("shared", "Beta"))),
            ),
            excludedProjectIds = mapOf(first.value to setOf("shared")),
        )

        assertEquals(listOf("Beta"), options.map { it.project.name })
        assertEquals(second, options.single().connectionId)
    }

    @Test
    fun resolverReadsOnlyTheOwningHostWhenRawIdsCollide() {
        val selected = connection(1)
        val secondary = connection(2)
        val selectedProject = project("shared", "Selected")
        val secondaryProject = project("shared", "Secondary")
        val selectedSnapshot = snapshot(projects = listOf(selectedProject))
        val hostSnapshots = mapOf(secondary to snapshot(projects = listOf(secondaryProject)))

        assertEquals(
            secondaryProject,
            HomeProjectFilterPresentation.resolveProject(
                connectionId = secondary,
                projectId = "shared",
                selectedConnectionId = selected,
                selectedSnapshot = selectedSnapshot,
                hostSnapshots = hostSnapshots,
            ),
        )
        assertNull(
            HomeProjectFilterPresentation.resolveProject(
                connectionId = secondary,
                projectId = "shared",
                selectedConnectionId = selected,
                selectedSnapshot = selectedSnapshot,
                hostSnapshots = emptyMap(),
            ),
        )
        assertEquals(
            selectedProject,
            HomeProjectFilterPresentation.resolveProject(
                connectionId = selected,
                projectId = "shared",
                selectedConnectionId = selected,
                selectedSnapshot = null,
                hostSnapshots = mapOf(selected to selectedSnapshot),
            ),
        )
    }

    @Test
    fun homeScopeIsAvailableOnlyToTheTerminalUtility() {
        assertEquals("__lightcode_home__", HOME_PROJECT_ID)
        val home = project(HOME_PROJECT_ID, "Home")

        assertTrue(HomeProjectUtility.Terminal.supports(home))
        assertFalse(HomeProjectUtility.Notes.supports(home))
        assertFalse(HomeProjectUtility.PullRequests.supports(home))
        assertFalse(HomeProjectUtility.GithubActions.supports(home))
        assertTrue(HomeProjectUtility.Terminal.clearsThreadSelection)
        assertFalse(HomeProjectUtility.Notes.clearsThreadSelection)
    }

    private fun connection(value: Int) = ClientConnectionId(
        "00000000-0000-0000-0000-${value.toString().padStart(12, '0')}",
    )

    private fun host(connectionId: ClientConnectionId, label: String) = HostRecord(
        connectionId = connectionId,
        desktopId = "desktop-${connectionId.value}",
        label = label,
        httpBaseUrl = "https://host.test",
        wsBaseUrl = "wss://host.test",
        appVersion = "1.0.0",
        pairedAtEpochMs = 1,
        protocolVersion = 3,
    )

    private fun project(id: String, name: String, disabled: Boolean? = null) = RemoteProject(
        id = id,
        name = name,
        location = PosixProjectLocation("/repo/$id"),
        disabled = disabled,
        createdAt = "2026-01-01T00:00:00Z",
    )

    private fun snapshot(
        projects: List<RemoteProject>,
        threads: List<RemoteThread> = emptyList(),
    ) = RemoteShellSnapshot(
        snapshotSeq = 1,
        projects = projects,
        threads = threads,
        updatedAt = "2026-01-01T00:00:00Z",
    )

    private fun thread(
        id: String,
        projectId: String,
        archived: Boolean? = null,
        presentationMode: String? = "gui",
    ) = RemoteThread(
        id = id,
        projectId = projectId,
        title = id,
        agentKind = "codex",
        status = "idle",
        attention = "none",
        archived = archived,
        presentationMode = presentationMode,
        createdAt = "2026-01-01T00:00:00Z",
        updatedAt = "2026-01-01T00:00:00Z",
    )
}
