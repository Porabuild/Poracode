package com.poracode.app.ui.advancedops

import com.poracode.app.protocol.advancedops.AdvancedOperation
import com.poracode.app.session.advancedops.AdvancedOpsFoundation
import com.poracode.app.session.advancedops.AdvancedOwnerSnapshotSource
import com.poracode.app.session.advancedops.GenerationOptions
import com.poracode.app.session.advancedops.ProjectEntryType
import com.poracode.app.session.advancedops.advancedState
import com.poracode.app.transport.advancedops.AdvancedOpsTransport
import com.poracode.app.transport.advancedops.AdvancedTransportException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.runCurrent
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AdvancedOpsControllerReachabilityTest {
    @Test
    fun `production controller reaches all seventeen typed operations`() = runTest {
        val source = AdvancedOwnerSnapshotSource(advancedState(), foreground = true)
        val calls = mutableListOf<AdvancedOperation>()
        val foundation = AdvancedOpsFoundation.create(
            source.state,
            AdvancedOpsTransport { operation, payload ->
                calls += operation
                response(operation, payload["absolutePath"]?.toString()?.trim('"'))
            },
        )
        val controller = AdvancedOpsController(source.state, this)
        controller.installFoundation(foundation)

        typedInputs().forEach { input ->
            controller.clearResult()
            controller.submit(input)
            if (controller.state.value.confirmation != null) controller.confirm()
            advanceUntilIdle()
            assertEquals("Failure for ${input.action}", null, controller.state.value.failure)
            assertNotNull("No typed result for ${input.action}", controller.state.value.output)
        }

        assertEquals(AdvancedOperation.entries, calls)
        assertEquals(17, calls.distinct().size)
        foundation.close()
    }

    @Test
    fun `destructive confirmation captures before delivery and scope gate blocks transport`() =
        runTest {
            val source = AdvancedOwnerSnapshotSource(advancedState(), foreground = true)
            val calls = mutableListOf<AdvancedOperation>()
            val foundation = AdvancedOpsFoundation.create(
                source.state,
                AdvancedOpsTransport { operation, _ ->
                    calls += operation
                    response(operation, "/workspace/one/a.txt")
                },
            )
            val controller = AdvancedOpsController(source.state, this)
            controller.installFoundation(foundation)
            controller.submit(AdvancedInput.DeleteEntry("a.txt"))
            assertTrue(calls.isEmpty())
            assertEquals("a.txt", controller.state.value.confirmation?.path)
            controller.confirm()
            advanceUntilIdle()
            assertEquals(listOf(AdvancedOperation.DeleteProjectEntry), calls)

            val deniedHost = source.state.value.host!!.copy(scopes = setOf("session:read"))
            val denied = MutableStateFlow(
                source.state.value.copy(
                    host = deniedHost,
                    project = source.state.value.project!!.copy(host = deniedHost),
                    location = source.state.value.location!!.copy(host = deniedHost),
                    thread = source.state.value.thread!!.copy(host = deniedHost),
                ),
            )
            val deniedController = AdvancedOpsController(denied, this)
            deniedController.installFoundation(foundation)
            deniedController.submit(AdvancedInput.CreateEntry("b", ProjectEntryType.File))
            assertEquals(AdvancedSafeFailure.MissingScope, deniedController.state.value.failure)
            assertEquals(1, calls.size)
            foundation.close()
        }

    @Test
    fun `production controller delivers once while busy and reconciles ambiguous confirmation`() =
        runTest {
            val source = AdvancedOwnerSnapshotSource(advancedState(), foreground = true)
            val calls = mutableListOf<AdvancedOperation>()
            val started = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            val serializedFoundation = AdvancedOpsFoundation.create(
                source.state,
                AdvancedOpsTransport { operation, _ ->
                    calls += operation
                    started.complete(Unit)
                    release.await()
                    JsonNull
                },
            )
            val controller = AdvancedOpsController(source.state, this)
            controller.installFoundation(serializedFoundation)
            val create = AdvancedInput.CreateEntry("only-once.txt", ProjectEntryType.File)
            controller.submit(create)
            runCurrent()
            controller.submit(create)
            release.complete(Unit)
            advanceUntilIdle()
            assertEquals(listOf(AdvancedOperation.CreateProjectEntry), calls)
            serializedFoundation.close()

            calls.clear()
            val ambiguousFoundation = AdvancedOpsFoundation.create(
                source.state,
                AdvancedOpsTransport { operation, _ ->
                    calls += operation
                    if (operation == AdvancedOperation.WriteExternalFile) {
                        throw AdvancedTransportException.unavailable()
                    }
                    response(operation, "/workspace/one/a.txt")
                },
            )
            controller.installFoundation(ambiguousFoundation)
            controller.submit(AdvancedInput.WriteExternal("/workspace/one/a.txt", "new", 1.0))
            assertTrue(calls.isEmpty())
            controller.confirm()
            advanceUntilIdle()
            assertEquals(
                listOf(AdvancedOperation.WriteExternalFile, AdvancedOperation.ReadExternalFile),
                calls,
            )
            assertTrue(
                (controller.state.value.output as AdvancedOutput.Mutation).outcome is
                    com.poracode.app.session.advancedops.AdvancedMutationOutcome.Reconciled,
            )
            ambiguousFoundation.close()
        }

    private fun typedInputs(): List<AdvancedInput> {
        val options = GenerationOptions("codex", model = "gpt", effort = "medium")
        return listOf(
            AdvancedInput.CreateCheckpoint("cp"),
            AdvancedInput.FinalizeCheckpoint("cp", "base"),
            AdvancedInput.Subscribe("parent"),
            AdvancedInput.Unsubscribe("parent"),
            AdvancedInput.StageInput("prompt", buildJsonArray { }),
            AdvancedInput.WorkflowRun("/run.json", null, true),
            AdvancedInput.WorkflowChat("thread-one", "/transcripts", "agent", false),
            AdvancedInput.ReadAbsolute("/workspace/one/a.txt"),
            AdvancedInput.ReadExternal("/workspace/one/a.txt"),
            AdvancedInput.WriteExternal("/workspace/one/a.txt", "new", 1.0),
            AdvancedInput.CreateEntry("new.txt", ProjectEntryType.File),
            AdvancedInput.RenameEntry("new.txt", "renamed.txt"),
            AdvancedInput.MoveEntry("renamed.txt", "archive"),
            AdvancedInput.DeleteEntry("archive/renamed.txt"),
            AdvancedInput.GenerateCommit(options),
            AdvancedInput.GenerateTitle("title prompt", options),
            AdvancedInput.GeneratePr("feature", "main", options),
        )
    }

    private fun response(operation: AdvancedOperation, path: String?) = when (operation) {
        AdvancedOperation.CreateFileCheckpoint,
        AdvancedOperation.FinalizeFileCheckpoint,
        -> buildJsonObject {
            putJsonObject("checkpoint") {
                put("threadId", "thread-one")
                put("checkpointItemId", "cp")
                put("ref", "refs/checkpoint")
                put("commit", "abc")
                put("capturedAt", "2026-08-12T00:00:00.000Z")
                putJsonArray("changedFiles") { }
            }
        }
        AdvancedOperation.SubagentSubscribe -> buildJsonObject { putJsonArray("history") { } }
        AdvancedOperation.WorkflowGetRun -> buildJsonObject { put("run", JsonNull) }
        AdvancedOperation.WorkflowAgentChat -> buildJsonObject { putJsonArray("events") { } }
        AdvancedOperation.ReadAbsoluteFile -> buildJsonObject { put("status", "missing") }
        AdvancedOperation.ReadExternalFile -> buildJsonObject {
            put("path", path ?: "/workspace/one/a.txt")
            put("status", "missing")
            put("modifiedAtMs", 1.0)
        }
        AdvancedOperation.WriteExternalFile -> buildJsonObject { put("modifiedAtMs", 2.0) }
        AdvancedOperation.GenerateCommitMessage -> buildJsonObject { put("message", "Commit") }
        AdvancedOperation.GenerateTitle -> buildJsonObject { put("title", "Title") }
        AdvancedOperation.GeneratePrSummary -> buildJsonObject {
            put("title", "PR")
            put("description", "Summary")
        }
        else -> JsonNull
    }
}
