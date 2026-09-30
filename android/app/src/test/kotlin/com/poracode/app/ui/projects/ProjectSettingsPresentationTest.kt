package com.poracode.app.ui.projects

import com.poracode.app.model.ProjectAction
import com.poracode.app.model.ProjectSearchSettings
import com.poracode.app.model.ProjectWorktreeLocation
import com.poracode.app.model.WorktreeStorageMode
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.model.settings.HostSettingsSnapshot
import com.poracode.app.model.HOME_PROJECT_ID
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.session.projects.CatalogProject
import com.poracode.app.session.projects.HostProjectCatalog
import com.poracode.app.session.projects.ProjectCatalogState
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.session.projects.ProjectSessionKey
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectSettingsPresentationTest {
    @Test
    fun worktreeChoicePreservesWireMeaning() {
        assertEquals(ProjectWorktreeChoice.DesktopDefault, null.choice())
        assertEquals(
            ProjectWorktreeChoice.Custom,
            ProjectWorktreeLocation(WorktreeStorageMode.GLOBAL, "/worktrees").choice(),
        )
        assertEquals(
            ProjectWorktreeChoice.ProjectRelative,
            ProjectWorktreeLocation(WorktreeStorageMode.PROJECT_RELATIVE).choice(),
        )
        assertEquals(
            ProjectWorktreeChoice.Custom,
            ProjectWorktreeLocation(basePath = "/legacy").choice(),
        )
        assertNull(normalizedSetting(" \n "))
        assertEquals("pnpm test", normalizedSetting(" pnpm test "))
    }

    @Test
    fun actionsTrimUserFieldsWithoutChangingStableIdentity() {
        val action = ProjectAction("stable", " Test ", " pnpm test ", " terminal ").normalized()

        assertEquals("stable", action.id)
        assertEquals("Test", action.name)
        assertEquals("pnpm test", action.command)
        assertEquals("terminal", action.icon)
    }

    @Test
    fun searchRowsKeepGitLockedAndRepresentInheritedOverrides() {
        val rows = ProjectSearchSettingsPresentation.rows(
            baseline = ProjectSearchSettingsPresentation.baseline(emptyMap()),
            overrides = mapOf("**/dist" to false, "generated/**" to true),
        )

        assertEquals(ProjectSearchSettingsPresentation.LOCKED_PATTERN, rows.first().pattern)
        assertTrue(rows.first().locked)
        assertFalse(rows.any { it.pattern == "**/dist" })
        assertFalse(rows.single { it.pattern == "generated/**" }.inherited)
        assertTrue(rows.single { it.pattern == "**/build" }.inherited)
        assertNull(ProjectSearchSettings(null, emptyMap()).normalized())
    }

    @Test
    fun inheritedSettingsProjectOnlyTheRedactedSearchAndWorktreeDefaults() {
        val snapshot = HostSettingsSnapshot(buildJsonObject {
            put("settings", buildJsonObject {
                put("worktreeStorageMode", "project-relative")
                put("worktreeBasePath", "/posix")
                put("wslWorktreeBasePath", "/wsl")
                put("searchUseIgnoreFiles", false)
                put("searchExclude", buildJsonObject { put("generated/**", true) })
            })
        })

        val owner = com.poracode.app.model.ClientConnectionId(
            "00000000-0000-4000-8000-000000000001",
        )
        val inherited = ProjectInheritedSettings.from(owner, snapshot)

        assertEquals("project-relative", inherited.worktreeStorageMode)
        assertEquals(owner, inherited.connectionId)
        assertEquals("/posix", inherited.basePath(PosixProjectLocation("/repo")))
        assertEquals(
            "/wsl",
            inherited.basePath(WslProjectLocation("Ubuntu", "/repo", "\\\\wsl$\\repo")),
        )
        assertFalse(inherited.searchUseIgnoreFiles)
        assertEquals(true, inherited.searchExclude["generated/**"])
    }

    @Test
    fun syntheticHomeIsNotAProjectManagementDestination() {
        val owner = com.poracode.app.model.ClientConnectionId(
            "00000000-0000-4000-8000-000000000001",
        )
        val home = com.poracode.app.model.RemoteProject(
            id = HOME_PROJECT_ID,
            name = "Home",
            location = PosixProjectLocation("/home"),
            createdAt = "2026-01-01T00:00:00Z",
        )
        val project = home.copy(id = "project", name = "Project")

        val visible = listOf(home, project).map {
            CatalogProject(ProjectIdentity(owner, it.id), it)
        }.manageableProjects()

        assertEquals(listOf("project"), visible.map { it.project.id })
    }

    @Test
    fun cachedCatalogIsDisplayOnlyUntilTheReplacementLeaseBecomesReady() {
        val owner = com.poracode.app.model.ClientConnectionId(
            "00000000-0000-4000-8000-000000000001",
        )
        val stale = HostProjectCatalog(ProjectSessionKey(owner, 1))
        val state = ProjectCatalogState(mapOf(owner to stale))
        val offline = ProjectHostLease(owner, 2, emptySet(), online = false, ready = false)
        val ready = offline.copy(online = true, ready = true)

        assertEquals(stale, state.displayCatalog(offline))
        assertNull(state.displayCatalog(ready))
    }
}
