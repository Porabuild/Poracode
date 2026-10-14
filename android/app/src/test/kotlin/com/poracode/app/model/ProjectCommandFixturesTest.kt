package com.poracode.app.model

import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ProjectCommandFixturesTest {
    @Test
    fun decodesEveryCommandAndBothCloneSources() {
        val cases = readProjectFixture("project-command-requests.json")["cases"]!!.jsonArray
        val commands = cases.map { entry ->
            RemoteJson.decodeFromJsonElement(
                ProjectCommand.serializer(),
                entry.jsonObject["request"]!!,
            )
        }

        assertEquals(7, commands.size)
        assertTrue(commands[0] is AddExistingProject)
        assertTrue(commands[1] is CreateProject)
        assertTrue((commands[2] as CloneProject).source is CloneUrlSource)
        assertTrue((commands[3] as CloneProject).source is CloneGitHubSource)
        assertTrue(commands[4] is UpdateProject)
        assertTrue(commands[5] is RelocateProject)
        assertTrue(commands[6] is RemoveProject)
        assertEquals("/Users/zoë/Проекты/Poracode", (commands[0] as AddExistingProject).path)
        assertEquals(
            "\\\\wsl.localhost\\Ubuntu-24.04\\home\\dev\\projects",
            (commands[3] as CloneProject).parentPath,
        )
        assertFalse(commands[2].toString().contains("github.com/example"))
    }

    @Test
    fun preservesMissingNullAndExplicitPatchValues() {
        val fixture = readProjectFixture("project-update-semantics.json")
        val accepted = fixture["accepted"]!!.jsonArray.associate { entry ->
            val objectValue = entry.jsonObject
            val id = objectValue["id"]!!.jsonPrimitive.content
            id to RemoteJson.decodeFromJsonElement(
                ProjectCommand.serializer(),
                objectValue["request"]!!,
            ) as UpdateProject
        }

        assertEquals(ProjectPatch(), accepted.getValue("all-missing").patch)
        assertSame(PatchValue.Clear, accepted.getValue("scripts-null").patch.scripts)
        assertSame(
            PatchValue.Clear,
            accepted.getValue("search-settings-null").patch.searchSettings,
        )
        assertSame(
            PatchValue.Clear,
            accepted.getValue("worktree-location-null").patch.worktreeLocation,
        )
        assertSame(PatchValue.Clear, accepted.getValue("mcp-servers-null").patch.mcpServers)

        val scripts = accepted.getValue("scripts-value-empty-list").patch.scripts
        assertEquals(emptyList<ProjectAction>(), (scripts as PatchValue.Set).value.actions)
        val search = accepted.getValue("search-settings-value-empty-map").patch.searchSettings
        assertEquals(emptyMap<String, Boolean>(), (search as PatchValue.Set).value.exclude)
        val worktree = accepted.getValue("worktree-location-value-empty-map").patch.worktreeLocation
        assertEquals(ProjectWorktreeLocation(), (worktree as PatchValue.Set).value)
        val servers = accepted.getValue("mcp-servers-value-empty-list").patch.mcpServers
        assertEquals(emptyList<McpServer>(), (servers as PatchValue.Set).value)
        assertEquals(PatchValue.Set(false), accepted.getValue("disabled-value").patch.disabled)
    }

    @Test
    fun patchEncoderDoesNotCollapseTriState() {
        val patch = ProjectPatch(
            scripts = PatchValue.Clear,
            searchSettings = PatchValue.Set(ProjectSearchSettings(exclude = emptyMap())),
            worktreeLocation = PatchValue.Set(ProjectWorktreeLocation()),
            mcpServers = PatchValue.Set(emptyList()),
        )
        val encoded = RemoteJson.encodeToJsonElement(ProjectPatch.serializer(), patch).jsonObject

        assertFalse("name" in encoded)
        assertTrue(encoded["scripts"]!!.toString() == "null")
        assertEquals("{}", encoded["worktreeLocation"].toString())
        assertEquals("[]", encoded["mcpServers"].toString())
        assertEquals("{}", encoded["searchSettings"]!!.jsonObject["exclude"].toString())
    }

    @Test
    fun rejectsNullForNonNullablePatchFields() {
        val rejected = readProjectFixture("project-update-semantics.json")["rejected"]!!.jsonArray
        for (entry in rejected) {
            try {
                RemoteJson.decodeFromJsonElement(
                    ProjectCommand.serializer(),
                    entry.jsonObject["request"]!!,
                )
                fail("Expected ${entry.jsonObject["id"]} to be rejected")
            } catch (_: IllegalArgumentException) {
                // kotlinx.serialization errors derive from IllegalArgumentException.
            }
        }
    }
}
