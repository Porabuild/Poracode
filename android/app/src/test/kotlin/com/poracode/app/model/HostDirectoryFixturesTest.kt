package com.poracode.app.model

import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HostDirectoryFixturesTest {
    @Test
    fun directoryBrowserPreservesOpaquePathsUnicodeDrivesAndTruncation() {
        val cases = readProjectFixture("project-browse-host-directory.json")["cases"]!!.jsonArray
        val results = cases.associate { entry ->
            val value = entry.jsonObject
            value["id"]!!.jsonPrimitive.content to RemoteJson.decodeFromJsonElement(
                BrowseHostDirectoryResult.serializer(),
                value["result"]!!,
            )
        }

        val home = results.getValue("empty-path-home-unicode-truncated")
        assertTrue(home.truncated)
        assertEquals(listOf(".config", "项目", "résumé.md"), home.entries.map { it.name })
        assertEquals(HostDirectoryEntryType.FILE, home.entries.last().type)

        val root = results.getValue("posix-root")
        assertNull(root.parentPath)
        assertFalse(root.truncated)

        val drives = results.getValue("windows-drive-pseudo-root")
        assertTrue(drives.isDrivePseudoRoot)
        assertEquals(listOf("C:\\", "D:\\"), drives.entries.map { it.path })

        assertEquals(
            "\\\\wsl.localhost\\Ubuntu-24.04\\home\\zoë\\项目",
            results.getValue("wsl-localhost-unc").path,
        )
        assertEquals(
            "\\\\wsl$\\Debian\\home\\dev\\repo",
            results.getValue("wsl-dollar-unc").path,
        )
    }

    @Test
    fun setupDetectionKeepsOmittedAndConcreteResults() {
        val cases = readProjectFixture("project-detect-setup-script.json")["cases"]!!.jsonArray
        val omitted = cases[0].jsonObject
        val omittedRequest = RemoteJson.decodeFromJsonElement(
            DetectSetupScriptRequest.serializer(),
            omitted["request"]!!,
        )
        val omittedResult = RemoteJson.decodeFromJsonElement(
            DetectSetupScriptResult.serializer(),
            omitted["result"]!!,
        )
        val concrete = cases[1].jsonObject
        val concreteRequest = RemoteJson.decodeFromJsonElement(
            DetectSetupScriptRequest.serializer(),
            concrete["request"]!!,
        )
        val concreteResult = RemoteJson.decodeFromJsonElement(
            DetectSetupScriptResult.serializer(),
            concrete["result"]!!,
        )

        assertTrue(omittedRequest.projectLocation is WslProjectLocation)
        assertNull(omittedResult.setupScript)
        assertTrue(concreteRequest.projectLocation is PosixProjectLocation)
        assertEquals("remote-host-1", concreteRequest.projectLocation.remoteServerId)
        assertEquals("pnpm install", concreteResult.setupScript)
    }
}
