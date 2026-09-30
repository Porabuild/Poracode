package com.poracode.app.session.advancedops

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.protocol.advancedops.AdvancedOperation
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AdvancedControllersTest {
    @Test
    fun `delete move and overwrite capture exact confirmation before any mutation`() = runBlocking {
        val gateway = RecordingGateway()
        val controller = ExternalProjectFilesController(gateway)
        val owner = projectOwner()

        val overwrite = controller.requestOverwrite(owner, "/repo/a.txt", "secret body", 4.5)
            .confirmation
        val move = controller.requestMove(owner, "/repo/a.txt", "/repo/archive").confirmation
        val delete = controller.requestDelete(owner, "/repo/a.txt").confirmation
        assertTrue(gateway.mutations.isEmpty())
        assertEquals(DestructiveAction.Overwrite, overwrite.action)
        assertEquals("secret body", overwrite.call.payload.getValue("content").jsonPrimitive.content)
        assertEquals(DestructiveAction.Move, move.action)
        assertEquals("/repo/archive", move.call.payload.getValue("nextParentPath").jsonPrimitive.content)
        assertEquals(DestructiveAction.Delete, delete.action)

        assertTrue(controller.confirm(overwrite.id) is ConfirmedMutationResult.Completed)
        assertEquals(listOf(AdvancedOperation.WriteExternalFile), gateway.mutations)
        assertTrue(controller.confirm(overwrite.id) is ConfirmedMutationResult.Failed)
        assertEquals(1, gateway.mutations.size)
        controller.dismiss(move.id)
        controller.dismiss(delete.id)
    }

    @Test
    fun `newest generation wins even when older request finishes last`() = runBlocking {
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        val gateway = object : AdvancedOpsGateway {
            override suspend fun read(call: AdvancedCall) = JsonNull

            override suspend fun mutate(
                call: AdvancedCall,
                reconciliation: AdvancedCall?,
            ): AdvancedMutationOutcome {
                val prompt = call.payload["prompt"]?.jsonPrimitive?.content
                if (prompt == "first") {
                    firstStarted.complete(Unit)
                    releaseFirst.await()
                }
                return AdvancedMutationOutcome.Applied(
                    buildJsonObject { put("title", prompt ?: "generated") },
                )
            }
        }
        val controller = GenerationHelpersController(gateway)
        val owner = projectOwner()
        val options = GenerationOptions("codex")
        val first = async { controller.title(owner, "first", options) }
        firstStarted.await()
        val second = async { controller.title(owner, "second", options) }
        val secondResult = second.await()
        releaseFirst.complete(Unit)

        assertTrue(secondResult is AdvancedControllerResult.Success)
        assertEquals(
            "second",
            (secondResult as AdvancedControllerResult.Success).value.title,
        )
        assertEquals(AdvancedControllerResult.Stale, first.await())
    }

    @Test
    fun `workflow reads are latest wins`() = runBlocking {
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        var count = 0
        val gateway = object : AdvancedOpsGateway {
            override suspend fun read(call: AdvancedCall): kotlinx.serialization.json.JsonElement {
                count += 1
                if (count == 1) {
                    firstStarted.complete(Unit)
                    releaseFirst.await()
                }
                return buildJsonObject { put("run", JsonNull) }
            }

            override suspend fun mutate(call: AdvancedCall, reconciliation: AdvancedCall?) =
                AdvancedMutationOutcome.Unknown
        }
        val controller = WorkflowController(gateway)
        val owner = locationOwner()
        val first = async { controller.getRun(owner, "/repo/run.json") }
        firstStarted.await()
        val second = async { controller.getRun(owner, "/repo/run.json") }
        assertTrue(second.await() is AdvancedControllerResult.Success)
        releaseFirst.complete(Unit)
        assertEquals(AdvancedControllerResult.Stale, first.await())
    }

    @Test
    fun `controller close cancels in-flight workflow read`() = runBlocking {
        val started = CompletableDeferred<Unit>()
        val gateway = object : AdvancedOpsGateway {
            override suspend fun read(call: AdvancedCall): kotlinx.serialization.json.JsonElement {
                started.complete(Unit)
                awaitCancellation()
            }

            override suspend fun mutate(call: AdvancedCall, reconciliation: AdvancedCall?) =
                AdvancedMutationOutcome.Unknown
        }
        val controller = WorkflowController(gateway)
        val pending = async {
            runCatching {
                controller.getRun(locationOwner(), "/repo/run.json")
            }.exceptionOrNull()
        }
        started.await()
        controller.close()
        assertTrue(pending.await() is kotlinx.coroutines.CancellationException)
    }

    @Test
    fun `isolated production and tests remain under 500 lines`() {
        val roots = listOf(
            "src/main/kotlin/com/poracode/app/protocol/advancedops",
            "src/main/kotlin/com/poracode/app/transport/advancedops",
            "src/main/kotlin/com/poracode/app/session/advancedops",
            "src/test/kotlin/com/poracode/app/protocol/advancedops",
            "src/test/kotlin/com/poracode/app/transport/advancedops",
            "src/test/kotlin/com/poracode/app/session/advancedops",
        )
        roots.flatMap { File(it).walkTopDown().filter(File::isFile).toList() }.forEach { file ->
            assertTrue("${file.path} has ${file.readLines().size} lines", file.readLines().size < 500)
        }
    }

    private class RecordingGateway : AdvancedOpsGateway {
        val mutations = mutableListOf<AdvancedOperation>()

        override suspend fun read(call: AdvancedCall) = readResult(call)

        override suspend fun mutate(
            call: AdvancedCall,
            reconciliation: AdvancedCall?,
        ): AdvancedMutationOutcome {
            mutations += call.operation
            return when (call.operation) {
                AdvancedOperation.WriteExternalFile -> AdvancedMutationOutcome.Applied(
                    buildJsonObject { put("modifiedAtMs", 5.0) },
                )
                else -> AdvancedMutationOutcome.Applied(JsonNull)
            }
        }

        private fun readResult(call: AdvancedCall): JsonObject = buildJsonObject {
            put("path", call.payload["absolutePath"] ?: JsonNull)
            put("status", "missing")
            put("modifiedAtMs", 0.0)
        }
    }

    private fun projectOwner(): ProjectLocationAdvancedOwner {
        val host = host()
        return ProjectLocationAdvancedOwner(host, "project", 3, LOCATION, 5)
    }

    private fun locationOwner(): LocationAdvancedOwner = LocationAdvancedOwner(host(), LOCATION, 5)

    private fun host() = AdvancedHostLease(
        ClientConnectionId("00000000-0000-4000-8000-000000000010"),
        8,
        setOf("session:read", "session:operate", "projects:manage"),
        online = true,
        ready = true,
    )

    private companion object {
        val LOCATION = PosixProjectLocation("/repo")
    }
}
