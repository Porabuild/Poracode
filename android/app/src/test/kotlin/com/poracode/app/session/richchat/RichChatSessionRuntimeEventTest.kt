package com.poracode.app.session.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatSessionRuntimeEventTest {
    @Test
    fun canonicalEnvelopeAndPendingSteerApplyOnlyToSelectedThread() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(
            session,
            FakeRichChatSessionGateway(),
            scope = backgroundScope,
        )
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        val envelope = buildJsonObject {
            put("type", "thread-runtime-event")
            put("threadId", "thread-a")
            put(
                "event",
                buildJsonObject {
                    put("type", "content.delta")
                    put("threadId", "thread-a")
                    put("itemId", "assistant")
                    put("stream", "assistant_text")
                    put("delta", "hello")
                },
            )
        }
        assertTrue(runtime.applyServerEvent(43, envelope))
        assertEquals(null, runtime.chat.state.value.transcript)
        runtime.chat.installAuthoritativeSnapshot(
            selected,
            richSnapshot(
                items = listOf(
                    RichRuntimeItem(
                        "assistant",
                        RichItemTypes.ASSISTANT_MESSAGE,
                        RichItemState.STARTED,
                    ),
                ),
                seq = 42,
            ),
        )
        assertEquals(
            "hello",
            runtime.chat.state.value.transcript?.itemsById?.get("assistant")
                ?.streams
                ?.get("assistant_text"),
        )
        assertFalse(runtime.applyServerEvent(43, envelope))
        assertEquals(
            "hello",
            runtime.chat.state.value.transcript?.itemsById?.get("assistant")
                ?.streams
                ?.get("assistant_text"),
        )

        val stale = JsonFixture.pendingSteer("thread-b", "wrong")
        assertFalse(runtime.applyServerEvent(44, stale))
        assertEquals(null, runtime.chat.state.value.transcript?.pendingSteer)
        assertTrue(runtime.applyServerEvent(45, JsonFixture.pendingSteer("thread-a", "follow up")))
        assertEquals("follow up", runtime.chat.state.value.transcript?.pendingSteer?.prompt)
    }

    @Test
    fun liveContextMergesPatchesAndExplicitEmptyBreakdownReplacesIt() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(
            session,
            FakeRichChatSessionGateway(),
            scope = backgroundScope,
        )
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value

        assertTrue(
            runtime.applyServerEvent(
                11,
                contextEnvelope(used = 70, max = 100, breakdown = true),
            ),
        )
        assertNull(runtime.chat.state.value.transcript)
        runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 10))
        assertEquals(70L, runtime.chat.state.value.transcript?.contextUsage?.usedTokens)
        assertTrue(runtime.applyServerEvent(12, contextEnvelope(max = 200)))
        var context = runtime.chat.state.value.transcript?.contextUsage
        assertEquals(70L, context?.usedTokens)
        assertEquals(200L, context?.maxTokens)
        assertEquals(listOf("system"), context?.breakdown?.map { it.id })

        assertTrue(runtime.applyServerEvent(13, contextEnvelope(breakdown = false)))
        context = runtime.chat.state.value.transcript?.contextUsage
        assertTrue(context?.breakdown?.isEmpty() == true)
        assertFalse(runtime.applyServerEvent(13, contextEnvelope(used = 99, max = 100)))
        assertEquals(70L, runtime.chat.state.value.transcript?.contextUsage?.usedTokens)

        session.value = richLease(richConnectionB, generation = 2)
        assertFalse(runtime.applyServerEvent(14, contextEnvelope(used = 99, max = 100)))
        assertEquals(70L, runtime.chat.state.value.transcript?.contextUsage?.usedTokens)
    }

    @Test
    fun warningAndUsageSpentConsumeSequenceWithoutMutatingRichState() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val runtime = RichChatSessionRuntime(
            session,
            FakeRichChatSessionGateway(),
            scope = backgroundScope,
        )
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(selected, richSnapshot(seq = 20))
        val transcript = runtime.chat.state.value.transcript

        assertTrue(runtime.applyServerEvent(21, warningEnvelope()))
        assertSame(transcript, runtime.chat.state.value.transcript)
        assertTrue(runtime.applyServerEvent(22, usageSpentEnvelope()))
        assertSame(transcript, runtime.chat.state.value.transcript)
        assertNull(runtime.chat.state.value.transcript?.lastUsageSpent)
        assertFalse(runtime.applyServerEvent(22, usageSpentEnvelope()))
    }

    private object JsonFixture {
        fun pendingSteer(threadId: String, prompt: String) = buildJsonObject {
            put("type", "thread-pending-steer")
            put("threadId", threadId)
            put(
                "pending",
                buildJsonObject {
                    put("id", "steer-1")
                    put("prompt", prompt)
                    put("stagedAt", 1.0)
                },
            )
        }
    }

    private fun contextEnvelope(
        used: Int? = null,
        max: Int? = null,
        breakdown: Boolean? = null,
    ) = runtimeEnvelope(
        buildJsonObject {
            put("type", "context.updated")
            put(
                "usage",
                buildJsonObject {
                    used?.let { put("usedTokens", it) }
                    max?.let { put("maxTokens", it) }
                    breakdown?.let { include ->
                        put(
                            "breakdown",
                            kotlinx.serialization.json.buildJsonArray {
                                if (include) {
                                    add(
                                        buildJsonObject {
                                            put("id", "system")
                                            put("label", "System")
                                            put("tokens", 20)
                                        },
                                    )
                                }
                            },
                        )
                    }
                },
            )
        },
    )

    private fun warningEnvelope() = runtimeEnvelope(
        buildJsonObject {
            put("type", "warning")
            put("message", "Fixture warning")
        },
    )

    private fun usageSpentEnvelope() = runtimeEnvelope(
        buildJsonObject {
            put("type", "usage.spent")
            put(
                "usage",
                buildJsonObject {
                    put("counterKind", "per-call")
                    put("counter", 128)
                    put("scopeId", "provider-session")
                    put("epoch", 0)
                    put("sampleId", "usage-sample")
                },
            )
        },
    )

    private fun runtimeEnvelope(event: kotlinx.serialization.json.JsonObject) = buildJsonObject {
        put("type", "thread-runtime-event")
        put("threadId", "thread-a")
        put(
            "event",
            kotlinx.serialization.json.JsonObject(
                event + ("threadId" to kotlinx.serialization.json.JsonPrimitive("thread-a")),
            ),
        )
    }
}
