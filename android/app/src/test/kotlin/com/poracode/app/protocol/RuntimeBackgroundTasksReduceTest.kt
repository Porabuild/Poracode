package com.poracode.app.protocol

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.string
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `background_tasks.changed` parity with TS `runtimeEventReducer`
 * (replace / empty-drain / session.exited drain semantics) and zod
 * `backgroundTaskSchema` strictness. Golden fixture:
 * protocol/remote/v3/fixtures/runtime-events.json
 */
class RuntimeBackgroundTasksReduceTest {
    private fun readFixture(name: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture fixtures/$name")
        return stream.bufferedReader().readText()
    }

    private fun task(taskId: String, kind: String, description: String) = buildJsonObject {
        put("taskId", taskId)
        put("kind", kind)
        put("description", description)
    }

    private fun tasksArray(vararg tasks: Triple<String, String, String>): JsonArray =
        buildJsonArray {
            tasks.forEach { (taskId, kind, description) -> add(task(taskId, kind, description)) }
        }

    private fun event(tasks: JsonArray, extraTopLevel: Boolean = false): JsonObject =
        buildJsonObject {
            put("type", "background_tasks.changed")
            put("threadId", "t1")
            put("tasks", tasks)
            if (extraTopLevel) put("futureTopLevel", 1)
        }

    private fun reduce(
        event: JsonObject,
        domain: ThreadRuntimeDomainState,
        items: MutableList<PersistedRuntimeItem> = mutableListOf(),
    ): ThreadRuntimeDomainState = RuntimeEventReducer.applyBatch(
        events = listOf(RuntimeEventReducer.parseRuntimeEvent(event)!!),
        threadId = "t1",
        items = items,
        domain = domain,
        nowEpochMs = 1L,
    )

    @Test
    fun sharedFixtureEntryParsesWithExactPayloadPreserved() {
        val array = RemoteJson.parseToJsonElement(readFixture("runtime-events.json")) as JsonArray
        val entry = array
            .map { it.asObjectOrNull() }
            .single { it?.string("type") == "background_tasks.changed" }!!
        val parsed = RuntimeEventReducer.parseRuntimeEvent(entry)
        assertNotNull(parsed)
        assertEquals("thread-fixture-001", parsed!!.threadId)
        assertEquals(
            listOf(BackgroundTask("task-fixture-001", "command", "pnpm test")),
            parsed.tasks,
        )
        // Canonical variant carries the identical list (no reordering/loss).
        val canonical =
            parsed.canonical as RuntimeEventSchema.CanonicalRuntimeEvent.BackgroundTasksChanged
        assertEquals(parsed.tasks, canonical.tasks)
    }

    @Test
    fun kindEnumAcceptsCommandAndOtherOnly() {
        assertNotNull(RuntimeEventReducer.parseRuntimeEvent(event(tasksArray(Triple("a", "command", "d")))))
        assertNotNull(RuntimeEventReducer.parseRuntimeEvent(event(tasksArray(Triple("a", "other", "d")))))
        assertNull(RuntimeEventReducer.parseRuntimeEvent(event(tasksArray(Triple("a", "watcher", "d")))))
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                event(
                    buildJsonArray {
                        add(
                            buildJsonObject {
                                put("taskId", "a")
                                put("kind", 1)
                                put("description", "d")
                            },
                        )
                    },
                ),
            ),
        )
    }

    @Test
    fun strictSchemaRejections() {
        // tasks key missing (required by the wire schema)
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "background_tasks.changed")
                    put("threadId", "t1")
                },
            ),
        )
        // tasks not an array
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "background_tasks.changed")
                    put("threadId", "t1")
                    put("tasks", "nope")
                },
            ),
        )
        // empty taskId (zod min(1))
        assertNull(RuntimeEventReducer.parseRuntimeEvent(event(tasksArray(Triple("", "command", "d")))))
        // missing description
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                event(
                    buildJsonArray {
                        add(
                            buildJsonObject {
                                put("taskId", "a")
                                put("kind", "command")
                            },
                        )
                    },
                ),
            ),
        )
        // non-object task entry
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                event(buildJsonArray { add(JsonPrimitive("task")) }),
            ),
        )
        // threadId missing
        assertNull(
            RuntimeEventReducer.parseRuntimeEvent(
                buildJsonObject {
                    put("type", "background_tasks.changed")
                    put("tasks", buildJsonArray {})
                },
            ),
        )
    }

    @Test
    fun unknownFieldsAreStrippedNotRejected() {
        val noisyTaskList = buildJsonArray {
            add(
                buildJsonObject {
                    put("taskId", "a")
                    put("kind", "other")
                    put("description", "d")
                    put("futureTaskField", true)
                },
            )
        }
        val parsed = RuntimeEventReducer.parseRuntimeEvent(event(noisyTaskList))
        assertNotNull(parsed)
        assertEquals(listOf(BackgroundTask("a", "other", "d")), parsed!!.tasks)
        assertNotNull(RuntimeEventReducer.parseRuntimeEvent(event(tasksArray(Triple("a", "other", "d")), extraTopLevel = true)))
    }

    @Test
    fun replaceEmptyDrainAndSessionExitedSemantics() {
        val a = BackgroundTask("a", "command", "d1")
        val b = BackgroundTask("b", "other", "d2")
        val both = listOf(a, b)
        var domain = ThreadRuntimeDomainState()
        assertEquals(null, domain.backgroundTasks)

        // Replace: null -> [a, b]
        domain = reduce(event(tasksArray(Triple("a", "command", "d1"), Triple("b", "other", "d2"))), domain)
        assertEquals(both, domain.backgroundTasks)

        // Identical list is a no-op.
        val before = domain
        domain = reduce(event(tasksArray(Triple("a", "command", "d1"), Triple("b", "other", "d2"))), domain)
        assertEquals(before, domain)

        // Replace shrinks [a, b] -> [a].
        domain = reduce(event(tasksArray(Triple("a", "command", "d1"))), domain)
        assertEquals(listOf(a), domain.backgroundTasks)

        // Empty list drains (key dropped).
        domain = reduce(event(buildJsonArray {}), domain)
        assertEquals(null, domain.backgroundTasks)

        // Empty list with no prior key is a no-op.
        val drained = domain
        domain = reduce(event(buildJsonArray {}), domain)
        assertEquals(drained, domain)

        // session.exited drains a live list; a second exit is a no-op.
        domain = reduce(event(tasksArray(Triple("a", "command", "d1"))), domain)
        assertEquals(listOf(a), domain.backgroundTasks)
        domain = RuntimeDomainReducer.apply(
            RuntimeEventReducer.RuntimeEvent(type = "session.exited", threadId = "t1"),
            "t1",
            domain,
            nowEpochMs = 1L,
        )
        assertEquals(null, domain.backgroundTasks)
        val exited = domain
        domain = RuntimeDomainReducer.apply(
            RuntimeEventReducer.RuntimeEvent(type = "session.exited", threadId = "t1"),
            "t1",
            domain,
            nowEpochMs = 1L,
        )
        assertEquals(exited, domain)
    }

    @Test
    fun reduceNeverTouchesItemsOrStructuralVersion() {
        val items = mutableListOf<PersistedRuntimeItem>()
        val domain = RuntimeEventReducer.applyBatch(
            events = listOf(
                RuntimeEventReducer.parseRuntimeEvent(event(tasksArray(Triple("a", "command", "d1"))))!!,
                RuntimeEventReducer.parseRuntimeEvent(event(buildJsonArray {}))!!,
                RuntimeEventReducer.RuntimeEvent(type = "session.exited", threadId = "t1"),
            ),
            threadId = "t1",
            items = items,
            domain = ThreadRuntimeDomainState(),
            nowEpochMs = 1L,
        )
        assertTrue(items.isEmpty())
        assertEquals(null, domain.backgroundTasks)
        assertEquals(0, domain.structuralVersion)
    }

    @Test
    fun eventSurvivesMixedBatchEnvelopeAndInvalidSiblingsAreSkipped() {
        val envelope = buildJsonObject {
            put("type", "thread-runtime-events")
            put("threadId", "t1")
            put(
                "events",
                buildJsonArray {
                    add(event(tasksArray(Triple("a", "command", "d1"))))
                    add(event(tasksArray(Triple("bad", "not_a_kind", "d"))))
                    add(
                        buildJsonObject {
                            put("type", "unicorn.spotted")
                            put("threadId", "t1")
                        },
                    )
                },
            )
        }
        val batches = RuntimeEventReducer.collectRuntimeEvents(envelope)
        assertEquals(1, batches.size)
        assertEquals(1, batches[0].events.size)
        assertEquals("background_tasks.changed", batches[0].events.single().type)
        assertEquals(listOf(BackgroundTask("a", "command", "d1")), batches[0].events.single().tasks)
    }
}
