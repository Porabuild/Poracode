package com.poracode.app.ui.home

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectDraftConfig
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.HostPresentation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeThreadListPresentationTest {
    @Test
    fun `groups only threads owned by the same host project and worktree`() {
        val project = project("project", "Poracode")
        val connection = connection(1)
        val entries = HomeThreadListPresentation.entries(
            listOf(
                item(connection, "MacBook", project, thread("one", "One", "/repo/worktree")),
                item(connection, "MacBook", project, thread("two", "Two", "/repo/worktree")),
            ),
        )

        assertEquals(1, entries.size)
        val group = entries.single() as HomeThreadListEntry.Worktree
        assertEquals(listOf("one", "two"), group.threads.map { it.thread.id })
    }

    @Test
    fun `same worktree path does not merge across hosts or projects`() {
        val firstProject = project("first", "First")
        val secondProject = project("second", "Second")
        val entries = HomeThreadListPresentation.entries(
            listOf(
                item(connection(1), "MacBook", firstProject, thread("one", "One", "/shared/path")),
                item(connection(2), "Studio", firstProject, thread("two", "Two", "/shared/path")),
                item(connection(1), "MacBook", secondProject, thread("three", "Three", "/shared/path")),
            ),
        )

        assertEquals(3, entries.size)
        assertTrue(entries.all { it is HomeThreadListEntry.Thread })
    }

    @Test
    fun `filters by composite project and visible metadata`() {
        val connection = connection(1)
        val first = item(
            connection,
            "MacBook",
            project("first", "Poracode"),
            thread("one", "Compose redesign", "/repo/feature"),
        )
        val second = item(
            connection,
            "MacBook",
            project("second", "Docs"),
            thread("two", "Release notes", null),
        )

        assertEquals(
            listOf("one"),
            HomeThreadListPresentation.filter(listOf(first, second), "feature", emptySet())
                .map { it.thread.id },
        )
        assertEquals(
            listOf("two"),
            HomeThreadListPresentation.filter(
                listOf(first, second),
                "",
                setOf(HomeThreadListPresentation.projectIdentity(second)),
            ).map { it.thread.id },
        )
    }

    @Test
    fun `launch defaults prefer project draft then latest project thread`() {
        val draftProject = project(
            "draft",
            "Draft",
            ProjectDraftConfig(agentKind = "claude", model = "opus"),
        )
        val draftDefaults = HomeThreadListPresentation.launchDefaults(draftProject, emptyList())
        assertEquals("claude", draftDefaults?.agentKind)
        assertEquals("opus", draftDefaults?.config?.model)

        val project = project("project", "Poracode")
        val older = item(
            connection(1),
            "MacBook",
            project,
            thread("older", "Older", null, updatedAt = "2026-01-01T00:00:00Z"),
        )
        val latest = item(
            connection(1),
            "MacBook",
            project,
            thread(
                "latest",
                "Latest",
                null,
                updatedAt = "2026-02-01T00:00:00Z",
                config = ThreadConfig(model = "gpt-5"),
            ),
        )
        val defaults = HomeThreadListPresentation.launchDefaults(project, listOf(older, latest))

        assertEquals("codex", defaults?.agentKind)
        assertEquals("gpt-5", defaults?.config?.model)
    }

    private fun connection(value: Int) = ClientConnectionId(
        "00000000-0000-0000-0000-${value.toString().padStart(12, '0')}",
    )

    private fun project(
        id: String,
        name: String,
        draft: ProjectDraftConfig? = null,
    ) = RemoteProject(
        id = id,
        name = name,
        location = PosixProjectLocation("/repo/$id"),
        lastDraftConfig = draft,
        createdAt = "2026-01-01T00:00:00Z",
    )

    private fun thread(
        id: String,
        title: String,
        worktreePath: String?,
        updatedAt: String = "2026-01-01T00:00:00Z",
        config: ThreadConfig = ThreadConfig(),
    ) = RemoteThread(
        id = id,
        projectId = "project",
        title = title,
        agentKind = "codex",
        config = config,
        status = "idle",
        attention = "none",
        worktreePath = worktreePath,
        worktreeBranch = worktreePath?.let { "feature" },
        presentationMode = "gui",
        createdAt = updatedAt,
        updatedAt = updatedAt,
    )

    private fun item(
        connection: ClientConnectionId,
        hostName: String,
        project: RemoteProject,
        thread: RemoteThread,
    ) = HostPresentation.UnifiedThreadItem(connection, hostName, project, thread)
}
