package com.poracode.app.protocol.advancedops

import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.WindowsProjectLocation
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.model.RemoteClientException
import com.poracode.remote.v3.generated.RemoteContractMetadata
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AdvancedOpsContractTest {
    @Test
    fun `all 17 procedures exactly match committed metadata`() {
        assertEquals(17, AdvancedOperation.entries.size)
        assertEquals(17, AdvancedOperation.entries.map { it.wireName }.toSet().size)
        val metadata = RemoteContractMetadata.procedures.associateBy { it.name }

        AdvancedOperation.entries.forEach { operation ->
            val descriptor = metadata.getValue(operation.wireName)
            assertEquals(operation.scope, descriptor.scope)
            assertEquals(operation.owner.wireName, descriptor.owner)
            assertEquals(operation.resultKind.wireName, descriptor.resultKind)
            val body = Json.parseToJsonElement(
                AdvancedOpsContract.request(operation, payload(operation)),
            ).jsonObject
            assertEquals(operation.wireName, body.getValue("procedure").jsonPrimitive.content)
            assertTrue(body.getValue("payload") is JsonObject)
            val result = AdvancedOpsContract.result(operation, resultEnvelope(operation))
            if (operation.resultKind == AdvancedResultKind.Omitted) assertEquals(JsonNull, result)
        }

        val route = AdvancedOpsContract.route()
        assertEquals("POST", route.method)
        assertEquals("/api/git/call", route.path)
        assertEquals("bearer", route.auth)
        assertEquals("procedure-result", route.responseKind)
        assertEquals(200, route.expectedStatus)
    }

    @Test
    fun `only generators use exact five-minute timeout`() {
        AdvancedOperation.entries.forEach { operation ->
            val expected = if (operation.wireName.startsWith("generate")) 300_000L else 60_000L
            assertEquals(operation.wireName, expected, operation.timeoutMs)
        }
    }

    @Test
    fun `optional fields are omitted while nullable workflow result is preserved`() {
        val payload = AdvancedPayloads.workflowRun(POSIX, "/tmp/run.json", null, null)
        assertFalse(payload.containsKey("transcriptDir"))
        assertFalse(payload.containsKey("includeAgentChats"))
        val request = Json.parseToJsonElement(
            AdvancedOpsContract.request(AdvancedOperation.WorkflowGetRun, payload),
        ).jsonObject.getValue("payload").jsonObject
        assertFalse(request.containsKey("transcriptDir"))

        val parsed = AdvancedResultAdapters.workflowRun(
            AdvancedOpsContract.result(
                AdvancedOperation.WorkflowGetRun,
                """{"result":{"run":null}}""",
            ),
        )
        assertEquals(null, parsed.run)
        assertEquals(null, parsed.modifiedAtMs)

        assertThrows(RemoteClientException::class.java) {
            AdvancedOpsContract.request(
                AdvancedOperation.WorkflowGetRun,
                buildJsonObject {
                    put("location", POSIX.toAdvancedWireLocation())
                    put("manifestPath", "/tmp/run.json")
                    put("transcriptDir", JsonNull)
                },
            )
        }
        assertThrows(RemoteClientException::class.java) {
            AdvancedOpsContract.result(AdvancedOperation.StageThreadInput, """{"result":null}""")
        }
    }

    @Test
    fun `location adapter preserves POSIX Windows WSL and optional remote host identity`() {
        assertEquals(
            """{"kind":"posix","path":"/repo"}""",
            PosixProjectLocation("/repo").toAdvancedWireLocation().toString(),
        )
        assertEquals(
            """{"kind":"windows","path":"C:\\Repo","remoteServerId":"desk-a"}""",
            WindowsProjectLocation("C:\\Repo", "desk-a").toAdvancedWireLocation().toString(),
        )
        val wsl = WslProjectLocation(
            distro = "Ubuntu-24.04",
            linuxPath = "/home/me/Repo Ω",
            uncPath = "\\\\wsl.localhost\\Ubuntu-24.04\\home\\me\\Repo Ω",
            remoteServerId = "desk-b",
        ).toAdvancedWireLocation()
        assertEquals("wsl", wsl.getValue("kind").jsonPrimitive.content)
        assertEquals("/home/me/Repo Ω", wsl.getValue("linuxPath").jsonPrimitive.content)
        assertEquals(
            "\\\\wsl.localhost\\Ubuntu-24.04\\home\\me\\Repo Ω",
            wsl.getValue("uncPath").jsonPrimitive.content,
        )
    }

    private fun payload(operation: AdvancedOperation): JsonObject = when (operation) {
        AdvancedOperation.CreateFileCheckpoint -> AdvancedPayloads.checkpoint(POSIX, "t1", "c1")
        AdvancedOperation.FinalizeFileCheckpoint ->
            AdvancedPayloads.finalizeCheckpoint(POSIX, "t1", "c2", "c1")
        AdvancedOperation.SubagentSubscribe,
        AdvancedOperation.SubagentUnsubscribe,
        -> AdvancedPayloads.subscription("t1", "p1")
        AdvancedOperation.StageThreadInput -> AdvancedPayloads.stagedInput("t1", "hello", null)
        AdvancedOperation.WorkflowGetRun -> AdvancedPayloads.workflowRun(POSIX, "/run", null, true)
        AdvancedOperation.WorkflowAgentChat ->
            AdvancedPayloads.workflowChat(POSIX, "synthetic", "/transcripts", "a1", false)
        AdvancedOperation.ReadAbsoluteFile,
        AdvancedOperation.ReadExternalFile,
        -> AdvancedPayloads.externalRead(POSIX, "/tmp/a")
        AdvancedOperation.WriteExternalFile ->
            AdvancedPayloads.externalWrite(POSIX, "/tmp/a", "x", 1.0)
        AdvancedOperation.CreateProjectEntry ->
            AdvancedPayloads.projectEntry(POSIX, "dir/a", type = "file")
        AdvancedOperation.RenameProjectEntry ->
            AdvancedPayloads.projectEntry(POSIX, "dir/a", nextName = "b")
        AdvancedOperation.MoveProjectEntry ->
            AdvancedPayloads.projectEntry(POSIX, "dir/a", nextParentPath = "next")
        AdvancedOperation.DeleteProjectEntry -> AdvancedPayloads.projectEntry(POSIX, "dir/a")
        AdvancedOperation.GenerateCommitMessage -> generation()
        AdvancedOperation.GenerateTitle -> generation(prompt = "hello")
        AdvancedOperation.GeneratePrSummary -> generation(branch = "topic", baseBranch = "main")
    }

    private fun generation(
        prompt: String? = null,
        branch: String? = null,
        baseBranch: String? = null,
    ) = AdvancedPayloads.generation(
        POSIX,
        "codex",
        null,
        null,
        null,
        null,
        prompt,
        branch,
        baseBranch,
    )

    private fun resultEnvelope(operation: AdvancedOperation): String = when (operation) {
        AdvancedOperation.CreateFileCheckpoint -> envelope(
            """{
                "checkpoint": {
                    "capturedAt": "now",
                    "checkpointItemId": "c1",
                    "commit": "abc",
                    "ref": "refs/c1",
                    "threadId": "t1"
                }
            }""".trimIndent(),
        )
        AdvancedOperation.FinalizeFileCheckpoint -> envelope(
            """{
                "checkpoint": {
                    "baseCheckpointItemId": "c1",
                    "baseRef": "refs/c1",
                    "capturedAt": "now",
                    "changedFiles": [],
                    "checkpointItemId": "c2",
                    "commit": "def",
                    "ref": "refs/c2",
                    "threadId": "t1"
                }
            }""".trimIndent(),
        )
        AdvancedOperation.SubagentSubscribe -> envelope("""{"history":[]}""")
        AdvancedOperation.WorkflowGetRun -> envelope("""{"run":null}""")
        AdvancedOperation.WorkflowAgentChat -> envelope("""{"events":[]}""")
        AdvancedOperation.ReadAbsoluteFile -> envelope("""{"status":"missing"}""")
        AdvancedOperation.ReadExternalFile -> envelope(
            """{"path":"/tmp/a","status":"ready","modifiedAtMs":1.0,"content":"x"}""",
        )
        AdvancedOperation.WriteExternalFile -> envelope("""{"modifiedAtMs":2.0}""")
        AdvancedOperation.GenerateCommitMessage -> envelope("""{"message":"fix: a"}""")
        AdvancedOperation.GenerateTitle -> envelope("""{"title":"Fix a"}""")
        AdvancedOperation.GeneratePrSummary -> envelope(
            """{"title":"Fix a","description":"Body"}""",
        )
        else -> "{}"
    }

    private fun envelope(result: String) = """{"result":$result}"""

    private companion object {
        val POSIX = PosixProjectLocation("/repo")
    }
}
