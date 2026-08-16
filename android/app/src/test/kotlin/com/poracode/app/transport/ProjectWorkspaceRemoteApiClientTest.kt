package com.poracode.app.transport

import com.poracode.app.model.GitStatusDetail
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectSearchConfig
import com.poracode.app.model.RemoteJson
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectWorkspaceRemoteApiClientTest {
    @Test
    fun everyWorkspaceFixtureUsesCanonicalProcedureEnvelopeAndProjectsResult() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            val client = client(server)
            for (case in fixtureCases()) {
                server.enqueue(
                    MockResponse().setBody(
                        buildJsonObject { put("result", case.getValue("result")) }.toString(),
                    ),
                )
                val payload = case.getValue("payload").jsonObject
                val location = RemoteJson.decodeFromJsonElement(
                    ProjectLocation.serializer(),
                    payload.getValue("projectLocation"),
                )
                when (case.getValue("id").jsonPrimitive.content) {
                    "search-files-unicode-config" -> {
                        val config = RemoteJson.decodeFromJsonElement(
                            ProjectSearchConfig.serializer(),
                            payload.getValue("searchConfig"),
                        )
                        val result = client.searchProjectFiles(
                            location,
                            payload.string("query"),
                            payload.int("limit"),
                            config,
                        )
                        assertEquals(2048L, result.totalIndexed)
                        assertEquals("docs/résumé.md", result.entries.first().path)
                    }
                    "list-tree-root" -> {
                        val result = client.listProjectTree(
                            location,
                            payload.string("directoryPath"),
                        )
                        assertEquals(2, result.entries.size)
                        assertEquals(true, result.entries.first().hasChildren)
                    }
                    "search-tree-wsl" -> {
                        val result = client.searchProjectTree(
                            location,
                            payload.string("query"),
                            payload.int("limit"),
                            null,
                        )
                        assertEquals("src/组件.ts", result.entries.single().path)
                    }
                    "read-text-fractional-mtime" -> {
                        val result = client.readProjectFile(location, payload.string("path"))
                        assertEquals(1786543210.625, result.modifiedAtMs, 0.0)
                        assertEquals("# Poracode\n", result.content)
                    }
                    "read-previewable-binary" -> {
                        val result = client.readProjectFile(location, payload.string("path"))
                        assertEquals("JVBERi0xLjQK", result.contentBase64)
                        assertNull(result.content)
                    }
                    "write-text-fractional-mtime" -> {
                        val result = client.writeProjectFile(
                            location,
                            payload.string("path"),
                            payload.string("content"),
                            payload.double("baseModifiedAtMs"),
                        )
                        assertEquals(1786543212.875, result.modifiedAtMs, 0.0)
                    }
                    "git-status-full" -> {
                        val result = client.getGitStatus(location, GitStatusDetail.Full)
                        assertEquals("feature/native", result.branch)
                        assertEquals("src/old.ts", result.unstaged.single().oldPath)
                    }
                    "git-diff-file" -> {
                        val result = client.getGitDiff(
                            location,
                            payload.string("filePath"),
                            payload.boolean("staged"),
                        )
                        assertTrue(result.diff.contains("export const value"))
                    }
                    "git-diff-batch" -> {
                        val paths = payload.getValue("untrackedPaths").jsonArray.map {
                            it.jsonPrimitive.content
                        }
                        val result = client.getGitDiffBatch(location, paths)
                        assertTrue("src/new.ts" in result.staged)
                    }
                    "git-file-content" -> {
                        val result = client.getGitFileContent(
                            location,
                            payload.string("filePath"),
                            payload.boolean("staged"),
                        )
                        assertEquals("old\n", result.oldContent)
                        assertEquals("new\n", result.newContent)
                    }
                    "git-project-snapshot-empty-optionals" -> {
                        val result = client.gitProjectSnapshot(
                            location,
                            payload.boolean("includeGhCheck"),
                        )
                        assertNull(result.status)
                        assertNull(result.branches)
                        assertNull(result.worktrees)
                        assertNull(result.ghAvailable)
                    }
                    else -> error("Unhandled project workspace fixture")
                }

                val request = server.takeRequest()
                assertEquals("/base/api/git/call", request.requestUrl!!.encodedPath)
                assertEquals("Bearer access-secret", request.getHeader("Authorization"))
                val body = RemoteJson.parseToJsonElement(request.body.readUtf8()).jsonObject
                assertEquals(case.getValue("procedure"), body.getValue("procedure"))
                val sentPayload = body.getValue("payload").jsonObject
                assertEquals(payload.keys, sentPayload.keys)
                payload.forEach { (key, expected) ->
                    val actual = sentPayload.getValue(key)
                    if (key == "baseModifiedAtMs") {
                        assertEquals(
                            expected.jsonPrimitive.content.toDouble(),
                            actual.jsonPrimitive.content.toDouble(),
                            0.0,
                        )
                    } else {
                        assertEquals(expected, actual)
                    }
                }
            }
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun disconnectedFileWriteIsNeverRetried() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.start()
        try {
            val failed = runCatching {
                client(server).writeProjectFile(
                    location = com.poracode.app.model.PosixProjectLocation("/repo"),
                    path = "README.md",
                    content = "changed",
                    baseModifiedAtMs = 1.5,
                )
            }.isFailure
            assertTrue(failed)
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    private fun client(server: MockWebServer): ProjectWorkspaceRemoteApiClient =
        ProjectWorkspaceRemoteApiClient(
            endpoint = server.url("/base").toString(),
            accessToken = "access-secret",
            client = OkHttpClient(),
            networkGate = ForegroundNetworkGate(),
        )

    private fun fixtureCases(): List<JsonObject> {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/project-workspace.json")
            ?: error("Missing project-workspace fixture")
        return RemoteJson.parseToJsonElement(stream.bufferedReader().use { it.readText() })
            .jsonObject.getValue("cases").jsonArray.map { it.jsonObject }
    }
}

private fun JsonObject.string(key: String): String = getValue(key).jsonPrimitive.content

private fun JsonObject.int(key: String): Int = getValue(key).jsonPrimitive.content.toInt()

private fun JsonObject.double(key: String): Double = getValue(key).jsonPrimitive.content.toDouble()

private fun JsonObject.boolean(key: String): Boolean = getValue(key).jsonPrimitive.content.toBoolean()
