package com.poracode.app.model

import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectRouteProjectionFixturesTest {
    @Test
    fun routeBodiesProjectIntoTheStableDomainModels() {
        val cases = readProjectFixture("project-route-projections.json")["cases"]!!.jsonArray
            .associateBy { it.jsonObject["id"]!!.jsonPrimitive.content }

        val command = RemoteJson.decodeFromJsonElement(
            ProjectCommand.serializer(),
            cases.getValue("project-command").jsonObject["body"]!!,
        )
        assertEquals(RemoveProject("project-remove"), command)

        val notesCase = cases.getValue("project-notes-write").jsonObject
        val notes = RemoteJson.decodeFromJsonElement(
            ProjectNotesWriteBody.serializer(),
            notesCase["body"]!!,
        )
        assertEquals(listOf("todo-route"), notes.todos.map { it.id })
        assertFalse("projectId" in notesCase["body"]!!.jsonObject)
        val encodedNotes = RemoteJson.encodeToJsonElement(
            ProjectNotesWriteBody.serializer(),
            notes,
        ).jsonObject
        assertTrue("doc" in encodedNotes)
        assertEquals("null", encodedNotes["doc"].toString())

        val procedure = cases.getValue("procedure-detect-setup-script").jsonObject
        val payload = procedure["body"]!!.jsonObject["payload"]!!
        val setup = RemoteJson.decodeFromJsonElement(DetectSetupScriptRequest.serializer(), payload)
        assertTrue(setup.projectLocation is WindowsProjectLocation)
        assertEquals("C:\\src\\fixture", setup.projectLocation.path)
    }

    @Test
    fun pathScopedProjectIdsRemainPercentEncodedOutsideBodies() {
        val cases = readProjectFixture("project-route-projections.json")["cases"]!!.jsonArray
            .map { it.jsonObject }
        val settings = cases.first { it["id"]!!.jsonPrimitive.content == "project-settings" }
        val notes = cases.first { it["id"]!!.jsonPrimitive.content == "project-notes-read" }

        assertEquals(
            "/api/projects/project%20settings%20%E6%9D%B1%E4%BA%AC/settings",
            settings["resolvedPath"]!!.jsonPrimitive.content,
        )
        assertEquals("/api/projects/project%20notes/notes", notes["resolvedPath"]!!.jsonPrimitive.content)
    }
}
