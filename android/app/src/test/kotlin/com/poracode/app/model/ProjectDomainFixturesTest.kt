package com.poracode.app.model

import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectDomainFixturesTest {
    @Test
    fun commandResponsesPreserveLocationsAndAffectedProjectOptionality() {
        val cases = readProjectFixture("project-command-responses.json")["cases"]!!.jsonArray
        val withAffected = RemoteJson.decodeFromJsonElement(
            ProjectCommandResult.serializer(),
            cases[0].jsonObject["response"]!!,
        )
        val withoutAffected = RemoteJson.decodeFromJsonElement(
            ProjectCommandResult.serializer(),
            cases[1].jsonObject["response"]!!,
        )

        val windows = withAffected.projects[0].location as WindowsProjectLocation
        assertEquals("C:\\Users\\Zoë\\Projects\\Poracode", windows.path)
        assertEquals("location-host-windows", windows.remoteServerId)

        val posix = withAffected.projects[1]
        assertTrue(posix.location is PosixProjectLocation)
        assertEquals("東京 workspace", posix.name)
        assertEquals("codex", posix.lastDraftConfig?.agentKind)
        assertEquals("pnpm install", posix.scripts?.setupScript)
        assertEquals(true, posix.searchSettings?.exclude?.get("dist/**"))
        assertEquals(WorktreeStorageMode.GLOBAL, posix.worktreeLocation?.mode)
        assertEquals(posix.id, withAffected.project?.id)

        assertNull(withoutAffected.project)
        val wsl = withoutAffected.projects.single().location as WslProjectLocation
        assertEquals("Ubuntu-24.04", wsl.distro)
        assertEquals("/home/zoë/项目", wsl.linuxPath)
        assertEquals("\\\\wsl.localhost\\Ubuntu-24.04\\home\\zoë\\项目", wsl.uncPath)
        assertEquals(wsl.uncPath, wsl.path)
        val wire = RemoteJson.encodeToJsonElement(ProjectLocation.serializer(), wsl).jsonObject
        assertEquals("\"wsl\"", wire["kind"].toString())
        assertTrue("path" !in wire)
        assertEquals("\"/home/zoë/项目\"", wire["linuxPath"].toString())
    }

    @Test
    fun projectIdentityIncludesTheClientConnection() {
        val project = RemoteProject(
            id = "same-project-id",
            name = "Fixture",
            location = PosixProjectLocation("/srv/fixture"),
            createdAt = "2026-08-12T00:00:00.000Z",
        )
        val hostA = ClientConnectionId("00000000-0000-4000-8000-000000000001")
        val hostB = ClientConnectionId("00000000-0000-4000-8000-000000000002")

        assertNotEquals(project.identityOn(hostA), project.identityOn(hostB))
        assertEquals("same-project-id", project.identityOn(hostA).projectId)
    }

    @Test
    fun wslHelpersKeepLinuxDisplayAndUncHostPathsDistinct() {
        val location = WslProjectLocation(
            distro = "Ubuntu-24.04",
            linuxPath = "/home/dev/项目",
            uncPath = "\\\\wsl$\\Ubuntu-24.04\\home\\dev\\项目",
        )

        assertEquals("/home/dev/项目", location.displayPath())
        assertEquals("\\\\wsl$\\Ubuntu-24.04\\home\\dev\\项目", location.hostPath())
    }
}
