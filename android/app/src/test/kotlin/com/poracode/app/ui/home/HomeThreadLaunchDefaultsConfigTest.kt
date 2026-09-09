package com.poracode.app.ui.home

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectDraftConfig
import com.poracode.app.model.RemoteExecutionEnvironment
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.HostPresentation
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * v9 config fidelity through the quick-compose launch defaults: the draft-config
 * rebuild in [HomeThreadListPresentation.launchDefaults] is field-by-field, so a
 * pinned `executionEnvironment` must be forwarded explicitly or it is dropped
 * before the first config-carrying mutation.
 */
class HomeThreadLaunchDefaultsConfigTest {
    private fun project(draft: ProjectDraftConfig?) = RemoteProject(
        id = "project-fixture-001",
        name = "Fixture project",
        location = PosixProjectLocation("/tmp/repo"),
        lastDraftConfig = draft,
        createdAt = "2026-01-01T00:00:00.000Z",
    )

    @Test
    fun draftConfigPinnedEnvironmentSurvivesLaunchDefaults() {
        val draft = ProjectDraftConfig(
            agentKind = "fixture-model",
            model = "fixture-model",
            effort = "medium",
            executionEnvironment = RemoteExecutionEnvironment("wsl", "Ubuntu-22.04"),
        )
        val defaults = HomeThreadListPresentation.launchDefaults(project(draft), emptyList())
        assertEquals(
            RemoteExecutionEnvironment("wsl", "Ubuntu-22.04"),
            defaults?.config?.executionEnvironment,
        )
    }

    @Test
    fun latestThreadConfigPassesThroughUnchangedWhenNoDraftExists() {
        val pinned = ThreadConfig(
            model = "fixture-model",
            effort = "medium",
            executionEnvironment = RemoteExecutionEnvironment("wsl", "Ubuntu-22.04"),
        )
        val thread = RemoteThread(
            id = "thread-fixture-001",
            projectId = "project-fixture-001",
            title = "Fixture thread",
            agentKind = "fixture-model",
            status = "idle",
            attention = "none",
            config = pinned,
            createdAt = "2026-01-01T00:00:00.000Z",
            updatedAt = "2026-01-02T00:00:00.000Z",
        )
        val item = HostPresentation.UnifiedThreadItem(
            connectionId = ClientConnectionId("10000000-0000-4000-8000-000000000001"),
            hostName = "Fixture Mac",
            project = project(null),
            thread = thread,
        )
        val defaults = HomeThreadListPresentation.launchDefaults(project(null), listOf(item))
        assertEquals(pinned, defaults?.config)
    }
}
