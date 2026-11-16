package com.poracode.app.session.richchat

import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.protocol.BackgroundTask
import com.poracode.remote.v3.generated.RemoteBackgroundTaskStopAction
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Background-task metadata is session-scoped and lives outside the transcript.
 * The history snapshot carries the optional authoritative level; live frames
 * newer than the install are replayed so an older read cannot resurrect a
 * stale level, and `session.exited`/selection/host changes drain it.
 */
class RichChatBackgroundTaskMetadataTest {
    private fun task(
        taskId: String = "task-1",
        kind: String = "command",
        description: String = "Install deps",
        category: String? = null,
        command: String? = null,
        progress: String? = null,
    ): BackgroundTask = BackgroundTask(
        taskId = taskId,
        kind = kind,
        description = description,
        category = category,
        command = command,
        progress = progress,
    )

    private fun taskJson(taskId: String = "task-1", description: String = "Install deps"): JsonObject =
        buildJsonObject {
            put("taskId", taskId)
            put("kind", "command")
            put("description", description)
            put("category", "command")
            put("command", "pnpm test")
            put("startedAt", 1_770_000_000_000.0)
            put("lastProgressAt", 1_770_000_010_000.0)
            put("progress", "Server ready")
            put(
                "stopAction",
                buildJsonObject {
                    put("id", "background-task.stop.v1")
                    put("payload", buildJsonObject { put("token", "run-1") })
                },
            )
            put(
                "outputAction",
                buildJsonObject {
                    put("id", "background-task.output.v1")
                    put("payload", buildJsonObject { put("token", "run-1") })
                },
            )
        }

    private fun decodedTask(
        taskId: String = "task-1",
        description: String = "Install deps",
    ): BackgroundTask = BackgroundTask(
        taskId = taskId,
        kind = "command",
        description = description,
        startedAt = 1_770_000_000_000.0,
        lastProgressAt = 1_770_000_010_000.0,
        progress = "Server ready",
        stopAction = RemoteBackgroundTaskStopAction(
            "background-task.stop.v1",
            mapOf("token" to "run-1"),
        ),
        category = "command",
        command = "pnpm test",
        outputAction = RemoteBackgroundTaskStopAction(
            "background-task.output.v1",
            mapOf("token" to "run-1"),
        ),
    )

    private fun tasksEnvelope(
        vararg tasks: JsonObject,
        threadId: String = "thread-a",
        eventType: String = "background_tasks.changed",
    ): JsonObject = buildJsonObject {
        put("type", "thread-runtime-event")
        put("threadId", threadId)
        put(
            "event",
            buildJsonObject {
                put("type", eventType)
                put("threadId", threadId)
                put("tasks", buildJsonArray { tasks.forEach(::add) })
            },
        )
    }

    private fun hasTasks(
        taskIds: List<String> = listOf("task-1"),
        threadId: String = "thread-a",
    ): JsonObject = tasksEnvelope(
        *taskIds.map { taskJson(it) }.toTypedArray(),
        threadId = threadId,
    )

    @Test
    fun liveMetadataLandsOutsideTheTranscriptProjection() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 1))
        val transcript = runtime.chat.state.value.transcript

        assertTrue(runtime.applyServerEvent(2, hasTasks()))

        assertEquals(
            listOf(decodedTask()),
            runtime.chat.state.value.backgroundTasks,
        )
        assertEquals("live change advances the background watermark",
            2, runtime.chat.state.value.backgroundTaskSequence)
        assertSame("task progress must not invalidate the timeline", transcript,
            runtime.chat.state.value.transcript)
        assertEquals(
            "metadata never bumps the transcript structural version",
            transcript?.structuralVersion,
            runtime.chat.state.value.transcript?.structuralVersion,
        )
    }

    @Test
    fun sameConnectionReconnectDrainsMetadataAndFencesOutput() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val gateway = FakeRichChatSessionGateway()
        gateway.sessionActionIds = listOf("background-task.output.v1", "background-task.stop.v1")
        gateway.sessionActionInvokeHandler = { _, _ ->
            buildJsonObject {
                put("output", "tail")
                put("totalBytes", 42.0)
                put("truncated", false)
            }
        }
        val runtime = RichChatSessionRuntime(session, gateway, scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(
            selected,
            richSnapshot(seq = 1).copy(
                backgroundTasksPresent = true,
                backgroundTasks = listOf(decodedTask()),
            ),
        )
        runtime.sessionActions.refreshInventory()
        assertTrue(runtime.backgroundTasks.readOutput(decodedTask()) is RichChatOperationResult.Success)
        assertNotNull(runtime.backgroundTasks.output.value.key)
        assertEquals(1, runtime.chat.state.value.backgroundTaskSequence)

        // Reconnect keeps the connection id but bumps the lease generation.
        session.value = richLease(generation = 2)
        runtime.reconcileSession()
        assertNull(runtime.chat.state.value.backgroundTasks)
        assertNull(runtime.chat.state.value.backgroundTaskSequence)
        assertNull(runtime.chat.selection.value)
        assertNull("a lease replacement resets selected-detail output",
            runtime.backgroundTasks.output.value.key)
    }

    @Test
    fun replaceEmptyAndSessionExitFollowTheGeneratedReduceMachine() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 1))

        assertTrue(runtime.applyServerEvent(2, hasTasks(listOf("task-1", "task-2"))))
        assertEquals(listOf("task-1", "task-2"),
            runtime.chat.state.value.backgroundTasks?.map { it.taskId })
        assertEquals(2, runtime.chat.state.value.backgroundTaskSequence)

        assertTrue(runtime.applyServerEvent(3, hasTasks(listOf("task-2"))))
        assertEquals(listOf("task-2"), runtime.chat.state.value.backgroundTasks?.map { it.taskId })

        assertTrue(runtime.applyServerEvent(4, tasksEnvelope(eventType = "background_tasks.changed")))
        assertNull("empty level drains the metadata", runtime.chat.state.value.backgroundTasks)
        assertEquals(4, runtime.chat.state.value.backgroundTaskSequence)

        assertTrue(runtime.applyServerEvent(5, hasTasks(listOf("task-1"))))
        val exit = buildJsonObject {
            put("type", "thread-runtime-event")
            put("threadId", "thread-a")
            put(
                "event",
                buildJsonObject {
                    put("type", "session.exited")
                    put("threadId", "thread-a")
                    put("reason", "done")
                },
            )
        }
        assertTrue(runtime.applyServerEvent(6, exit))
        assertNull("background work dies with the session", runtime.chat.state.value.backgroundTasks)
        assertEquals("session.exited advances the background watermark",
            6, runtime.chat.state.value.backgroundTaskSequence)
    }

    @Test
    fun malformedTaskListNeverPublishesPartialMetadata() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 1))

        val malformed = buildJsonObject {
            put("type", "thread-runtime-event")
            put("threadId", "thread-a")
            put(
                "event",
                buildJsonObject {
                    put("type", "background_tasks.changed")
                    put("threadId", "thread-a")
                    put(
                        "tasks",
                        buildJsonArray {
                            add(taskJson("task-1"))
                            add(buildJsonObject {
                                put("taskId", "")
                                put("kind", "command")
                                put("description", "bad")
                            })
                        },
                    )
                },
            )
        }
        assertFalse(runtime.applyServerEvent(2, malformed))
        assertNull(runtime.chat.state.value.backgroundTasks)
        assertNull("a malformed list never advances the watermark",
            runtime.chat.state.value.backgroundTaskSequence)
    }

    @Test
    fun newerBufferedMetadataSurvivesAnOlderSnapshotInstall() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value

        // No transcript yet: the frame is buffered for the in-flight read and
        // the metadata level is already projected.
        assertTrue(runtime.applyServerEvent(5, hasTasks(listOf("task-1"))))
        assertEquals(listOf("task-1"), runtime.chat.state.value.backgroundTasks?.map { it.taskId })

        // The snapshot was built before seq 5 and reports no tasks; replay of
        // the newer frame must restore the live level.
        assertTrue(runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 4)))
        assertEquals(listOf("task-1"), runtime.chat.state.value.backgroundTasks?.map { it.taskId })
        assertEquals(5, runtime.chat.state.value.backgroundTaskSequence)
    }

    @Test
    fun staleSnapshotNeverResurrectsAnOlderTaskLevel() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 1))
        assertTrue(runtime.applyServerEvent(5, hasTasks(listOf("task-1"))))
        assertEquals(listOf("task-1"), runtime.chat.state.value.backgroundTasks?.map { it.taskId })

        // The response was composed before seq 5 and still carries an older
        // level; installing it must not resurrect that task.
        val stale = richSnapshot(seq = 4).copy(
            backgroundTasksPresent = true,
            backgroundTasks = listOf(task(taskId = "task-old", description = "Old work")),
        )
        assertTrue(runtime.chat.installAuthoritativeSnapshot(selected, stale))
        assertEquals(
            listOf("task-1"),
            runtime.chat.state.value.backgroundTasks?.map { it.taskId },
        )
        assertEquals("the background watermark survives the stale snapshot",
            5, runtime.chat.state.value.backgroundTaskSequence)
    }

    @Test
    fun explicitEmptySnapshotDrainsAndOmissionPreservesKnownLevel() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 1))
        assertTrue(runtime.applyServerEvent(2, hasTasks(listOf("task-1"))))
        assertEquals(listOf("task-1"), runtime.chat.state.value.backgroundTasks?.map { it.taskId })

        // An old host omits the optional field entirely: retain the same-owner
        // live level instead of guessing a drain.
        assertTrue(runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 5)))
        assertEquals(
            "omitted field preserves the known same-owner level",
            listOf("task-1"),
            runtime.chat.state.value.backgroundTasks?.map { it.taskId },
        )
        assertEquals(2, runtime.chat.state.value.backgroundTaskSequence)

        // A present, valid empty array is authoritative: it drains.
        val explicitEmpty = richSnapshot(seq = 6).copy(
            backgroundTasksPresent = true,
            backgroundTasks = emptyList(),
        )
        assertTrue(runtime.chat.installAuthoritativeSnapshot(selected, explicitEmpty))
        assertNull(runtime.chat.state.value.backgroundTasks)
        assertEquals("the explicit empty snapshot advances the watermark",
            6, runtime.chat.state.value.backgroundTaskSequence)
    }

    @Test
    fun unrelatedNewerEventDoesNotBlockAuthoritativeDrain() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 1))
        assertTrue(runtime.applyServerEvent(5, hasTasks(listOf("task-1"))))

        // A newer text/warning event is accepted but carries no background
        // change; it must not raise the background watermark.
        val warning = buildJsonObject {
            put("type", "thread-runtime-event")
            put("threadId", "thread-a")
            put(
                "event",
                buildJsonObject {
                    put("type", "warning")
                    put("threadId", "thread-a")
                    put("message", "heads up")
                },
            )
        }
        assertTrue(runtime.applyServerEvent(10, warning))
        assertEquals(5, runtime.chat.state.value.backgroundTaskSequence)

        // Snapshot seq 9 is older than the warning seq 10 but newer than the
        // background watermark, so its explicit empty roster is authoritative.
        val authoritativeDrain = richSnapshot(seq = 9).copy(
            backgroundTasksPresent = true,
            backgroundTasks = emptyList(),
        )
        assertTrue(runtime.chat.installAuthoritativeSnapshot(selected, authoritativeDrain))
        assertNull(runtime.chat.state.value.backgroundTasks)
        assertEquals(9, runtime.chat.state.value.backgroundTaskSequence)
    }

    @Test
    fun newerSuppliedSnapshotReplacesLiveLevel() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 1))
        assertTrue(runtime.applyServerEvent(2, hasTasks(listOf("task-1"))))

        val newer = richSnapshot(seq = 3).copy(
            backgroundTasksPresent = true,
            backgroundTasks = listOf(task(taskId = "task-2", description = "Watch logs", kind = "other")),
        )
        assertTrue(runtime.chat.installAuthoritativeSnapshot(selected, newer))
        assertEquals(listOf("task-2"), runtime.chat.state.value.backgroundTasks?.map { it.taskId })
        assertEquals("a supplied newer roster advances the watermark",
            3, runtime.chat.state.value.backgroundTaskSequence)
    }

    @Test
    fun hostAndSelectionChangesDrainMetadata() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 1))
        assertTrue(runtime.applyServerEvent(2, hasTasks()))
        assertEquals(1, runtime.chat.state.value.backgroundTasks?.size)
        assertEquals(2, runtime.chat.state.value.backgroundTaskSequence)

        session.value = richLease(richConnectionB, generation = 2)
        runtime.reconcileSession()
        assertNull(runtime.chat.state.value.backgroundTasks)
        assertNull(runtime.chat.state.value.backgroundTaskSequence)
        assertNull(runtime.chat.selection.value)

        val reselected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        assertTrue(
            runtime.chat.installAuthoritativeSnapshot(
                reselected,
                richSnapshot(lease = reselected.host, threadId = "thread-a", seq = 1),
            ),
        )
        assertTrue(runtime.applyServerEvent(2, hasTasks()))
        assertEquals(2, runtime.chat.state.value.backgroundTaskSequence)
        runtime.selectThread("thread-b")
        assertNull("a new selection starts from an empty metadata level",
            runtime.chat.state.value.backgroundTasks)
        assertNull(runtime.chat.state.value.backgroundTaskSequence)
    }

    @Test
    fun historyMapperTracksPresenceAndRejectsInvalidOrNullLevels() {
        val mapped = RichChatHistoryMapper.snapshot(
            richConnectionA,
            remoteSnapshot(buildJsonArray { add(taskJson()) }, present = true),
        )
        assertEquals(listOf(decodedTask()), mapped.backgroundTasks)
        assertTrue(mapped.backgroundTasksPresent)

        val absent = RichChatHistoryMapper.snapshot(
            richConnectionA,
            remoteSnapshot(null, present = false),
        )
        assertNull("old host omission has no level and preserves the owner's", absent.backgroundTasks)
        assertFalse(absent.backgroundTasksPresent)

        val explicitEmpty = RichChatHistoryMapper.snapshot(
            richConnectionA,
            remoteSnapshot(buildJsonArray {}, present = true),
        )
        assertTrue("an explicit [] stays present so it can drain", explicitEmpty.backgroundTasksPresent)
        assertEquals(emptyList<BackgroundTask>(), explicitEmpty.backgroundTasks)

        val malformed = buildJsonArray {
            add(buildJsonObject { put("taskId", "task-1"); put("kind", "watcher"); put("description", "x") })
        }
        val malformedFailure = runCatching {
            RichChatHistoryMapper.snapshot(richConnectionA, remoteSnapshot(malformed, present = true))
        }.exceptionOrNull()
        assertTrue(malformedFailure is RichChatGatewayException)
        assertEquals("invalid_response", (malformedFailure as RichChatGatewayException).code)

        // Optional-NONnullable: present with a JSON null is a contract failure,
        // never an implicit drain.
        val nullFailure = runCatching {
            RichChatHistoryMapper.snapshot(richConnectionA, remoteSnapshot(null, present = true))
        }.exceptionOrNull()
        assertTrue(nullFailure is RichChatGatewayException)
        assertEquals("invalid_response", (nullFailure as RichChatGatewayException).code)
    }

    @Test
    fun bufferedNewerMetadataReplaysAndOlderThanWatermarkIsFenced() {
        val snapshot = richSnapshot(seq = 10)
        val newer = RichChatLiveFrameBuffer()
        newer.buffer(
            RichChatLiveFrame(
                sequence = 11,
                events = emptyList(),
                backgroundTaskChanges = listOf(
                    RichChatBackgroundTaskChange(
                        "background_tasks.changed",
                        listOf(task(taskId = "buffered")),
                    ),
                ),
            ),
        )
        val replayed = newer.replayAfterSnapshot(
            snapshot,
            baseBackgroundTasks = null,
            baseBackgroundTaskSequence = 10,
        )
        assertEquals(listOf("buffered"), replayed.backgroundTasks?.map { it.taskId })
        assertEquals(11, replayed.backgroundTaskSequence)

        // A roster event older than the carried watermark (e.g. an event that
        // arrived after an accepted thread-exit drain) must not resurrect it.
        val older = RichChatLiveFrameBuffer()
        older.buffer(
            RichChatLiveFrame(
                sequence = 15,
                events = emptyList(),
                backgroundTaskChanges = listOf(
                    RichChatBackgroundTaskChange(
                        "background_tasks.changed",
                        listOf(task(taskId = "stale")),
                    ),
                ),
            ),
        )
        val fenced = older.replayAfterSnapshot(
            snapshot,
            baseBackgroundTasks = null,
            baseBackgroundTaskSequence = 20,
        )
        assertNull("only background changes newer than the watermark replay",
            fenced.backgroundTasks)
        assertEquals(20, fenced.backgroundTaskSequence)
    }

    @Test
    fun bufferedRecoveryAccountingIncludesMetadata() {
        val empty = RichChatLiveFrame(sequence = 1, events = emptyList())
        val withMetadata = RichChatLiveFrame(
            sequence = 1,
            events = emptyList(),
            backgroundTaskChanges = listOf(
                RichChatBackgroundTaskChange(
                    "background_tasks.changed",
                    listOf(task(progress = "Server ready")),
                ),
            ),
        )
        assertTrue(
            "retained bytes must account for buffered metadata",
            withMetadata.estimatedRecoveryBytes() > empty.estimatedRecoveryBytes(),
        )
    }

    @Test
    fun changesFoldInFrameOrderIncludingExitThenReplace() {
        var level = applyBackgroundTaskChanges(
            null,
            listOf(
                RichChatBackgroundTaskChange("session.exited"),
                RichChatBackgroundTaskChange(
                    "background_tasks.changed",
                    listOf(task(taskId = "after-exit")),
                ),
            ),
        )
        assertEquals(listOf("after-exit"), level?.map { it.taskId })
        level = applyBackgroundTaskChanges(
            level,
            listOf(RichChatBackgroundTaskChange("background_tasks.changed", emptyList())),
        )
        assertNull(level)
    }

    private fun remoteSnapshot(tasks: JsonArray?, present: Boolean = tasks != null) = RemoteThreadSnapshot(
        snapshotSeq = 3,
        thread = RemoteThread(
            id = "thread-a",
            projectId = "project-1",
            title = "Thread",
            agentKind = "claude",
            status = "idle",
            attention = "none",
            createdAt = "2026-08-12T00:00:00.000Z",
            updatedAt = "2026-08-12T00:00:00.000Z",
        ),
        backgroundTasks = tasks,
        backgroundTasksPresent = present,
        updatedAt = "2026-08-12T00:00:00.000Z",
    )

    @Test
    fun mapperOutputMatchesTheProtocolFixtureShape() {
        val raw = """
            {"taskId":"task-fixture-001","kind":"command","description":"pnpm test",
             "startedAt":1770000000000,"category":"command","command":"pnpm test",
             "outputAction":{"id":"background-task.output.v1","payload":{"token":"run-fixture-001"}}}
        """.trimIndent()
        // The fixture entry is one task OBJECT; wrap it in the history array.
        val entry = RemoteJson.parseToJsonElement(raw) as JsonObject
        val array = buildJsonArray { add(entry) }
        val mapped = RichChatHistoryMapper.snapshot(
            richConnectionA,
            remoteSnapshot(array, present = true),
        )
        val parsed = mapped.backgroundTasks!!.single()
        assertEquals("task-fixture-001", parsed.taskId)
        assertEquals("background-task.output.v1", parsed.outputAction!!.id)
        assertEquals("run-fixture-001", parsed.outputAction!!.payload["token"])
    }
}
