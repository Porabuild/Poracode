package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.richchat.FakeRichChatSessionGateway
import com.poracode.app.session.richchat.RichChatGatewayException
import com.poracode.app.session.richchat.RichChatHostLease
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.richchat.richLease
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The empty composer's resume action for a cut-off turn, held to the desktop
 * `threadResumeState.ts` rules: an unanswered plain-text message is sent again,
 * a turn the agent had started (or one that was more than typed text) is asked
 * to continue, a Stop leaves no action, and a failed send keeps it to retry.
 */
class RichChatResumePlanTest {
    @Test
    fun resendsTheLatestMessageWhenTheAgentNeverAnsweredIt() {
        val plan = RichChatResumePlanner.plan(
            listOf(
                typed("u1", "First"),
                item("a1", RichItemTypes.ASSISTANT_MESSAGE, streams = mapOf("assistant_text" to "Hi")),
                typed("u2", "Fix the build"),
                item("e1", RichItemTypes.ERROR),
            ),
        )

        assertEquals(RichChatResumePlan.Resend("Fix the build"), plan)
    }

    @Test
    fun continuesOnceTheAgentHadStartedAnswering() {
        val plan = RichChatResumePlanner.plan(
            listOf(
                typed("u1", "Fix the build"),
                item("r1", RichItemTypes.REASONING, payload = json("""{"summary":"Looking"}""")),
                item("t1", RichItemTypes.TOOL_CALL),
            ),
        )

        assertEquals(RichChatResumePlan.Continue, plan)
    }

    @Test
    fun continuesInsteadOfRebuildingAMessageThatWasMoreThanTypedText() {
        for (payload in listOf(
            """{"content":[{"kind":"text","text":"Look"},{"kind":"image","mimeType":"image/png","dataUrl":"","path":"/tmp/a.png"}]}""",
            """{"content":[{"kind":"skill","name":"review","invocation":"/review"}]}""",
            """{"content":[{"kind":"text","text":"Use"},{"kind":"thread","threadId":"t2","title":"Other"}]}""",
            """{"content":[{"kind":"text","text":"Scope"}],"questionAnswer":{"answers":[]}}""",
            """{"content":[{"kind":"text","text":"Pick"}],"replyForm":{"questions":[]}}""",
        )) {
            val plan = RichChatResumePlanner.plan(listOf(user("u1", payload)))
            assertEquals(payload, RichChatResumePlan.Continue, plan)
        }
    }

    @Test
    fun skipsVoiceTranscriptsAndSubAgentPromptsToFindTheUsersOwnMessage() {
        assertEquals(
            RichChatResumePlan.Resend("Fix the build"),
            RichChatResumePlanner.plan(
                listOf(
                    typed("u1", "Fix the build"),
                    user("v1", """{"content":[{"kind":"text","text":"um"}],"turnIndependent":true}"""),
                ),
            ),
        )
        assertEquals(
            RichChatResumePlan.Continue,
            RichChatResumePlanner.plan(
                listOf(
                    typed("u1", "Fix the build"),
                    item("t1", RichItemTypes.TOOL_CALL),
                    typed("c1", "Inspect the renderer").copy(parentItemId = "t1"),
                ),
            ),
        )
    }

    @Test
    fun anOpenedButEmptyReplyIsNotOutputUntilTextStreamsIn() {
        val emptyReply = item(
            "a1",
            RichItemTypes.ASSISTANT_MESSAGE,
            payload = json("""{"content":[{"kind":"text","text":"  "}]}"""),
        )
        val items = listOf(typed("u1", "Fix the build"), emptyReply, item("r1", RichItemTypes.REASONING))

        assertEquals(RichChatResumePlan.Resend("Fix the build"), RichChatResumePlanner.plan(items))
        val streamed = items.map {
            if (it.id == "a1") it.copy(streams = mapOf("assistant_text" to "Looking")) else it
        }
        assertEquals(RichChatResumePlan.Continue, RichChatResumePlanner.plan(streamed))
    }

    @Test
    fun aLongReplyWithoutItsMessageContinuesAndAnEmptyHistoryOffersNothing() {
        assertEquals(
            RichChatResumePlan.Continue,
            RichChatResumePlanner.plan(listOf(item("t1", RichItemTypes.COMMAND_EXECUTION))),
        )
        assertNull(RichChatResumePlanner.plan(emptyList()))
    }

    @Test
    fun onlyAnErrorOrRestartMarkerOffersTheAction() {
        val items = listOf(typed("u1", "Fix the build"))
        for (marker in listOf("error", "restart")) {
            assertEquals(
                RichChatResumePlan.Resend("Fix the build"),
                offer(thread(interruptedTurn = marker), items),
            )
        }
        // Stop clears the marker on the host, so an intentionally stopped turn
        // (no marker) and an unknown future marker never offer the action.
        assertNull(offer(thread(interruptedTurn = null), items))
        assertNull(offer(thread(interruptedTurn = "something-else"), items))
    }

    @Test
    fun typingAttachmentsActiveTurnsAndTerminalThreadsKeepTheNormalComposer() {
        val items = listOf(typed("u1", "Fix the build"))
        val row = thread(interruptedTurn = "error")

        assertNull(offer(row, items, composerEmpty = false))
        assertNull(offer(row, items, canSubmit = false))
        assertNull(offer(row, items, isTurnActive = true))
        for (status in listOf("launching", "working", "needs_approval", "needs_reply")) {
            assertNull(status, offer(row.copy(status = status), items))
        }
        assertNull(offer(row.copy(presentationMode = "terminal"), items))
        assertEquals(RichChatResumePlan.Resend("Fix the build"), offer(row.copy(status = "error"), items))
    }

    @Test
    fun resumeSendsThroughTheTypedSendPath() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val runtime = runtime(gateway)

        val resend = submitRichChatResume(
            runtime = runtime,
            plan = RichChatResumePlan.Resend("Fix the build"),
            continuePrompt = CONTINUE,
            configuration = ThreadConfig(model = "gpt-5"),
            activeRequest = null,
        )
        val resumed = submitRichChatResume(
            runtime = runtime,
            plan = RichChatResumePlan.Continue,
            continuePrompt = CONTINUE,
            configuration = ThreadConfig(model = "gpt-5"),
            activeRequest = null,
        )

        assertTrue(resend is RichChatOperationResult.Success)
        assertTrue(resumed is RichChatOperationResult.Success)
        assertEquals(listOf("send", "send"), gateway.calls.filter { it == "send" })
        assertEquals(listOf("Fix the build", CONTINUE), gateway.sentPrompts.map { it.first })
        assertEquals(
            listOf("Fix the build", CONTINUE),
            gateway.sentPrompts.map { (_, segments) ->
                val text = (segments as JsonArray).single() as JsonObject
                assertEquals("text", (text["kind"] as JsonPrimitive).content)
                (text["content"] as JsonPrimitive).content
            },
        )
    }

    @Test
    fun aFailedResumeKeepsTheActionAndASuccessfulSendHidesItUntilTheHostRestatesTheRow() = runTest {
        val gateway = FakeRichChatSessionGateway()
        gateway.unitHandler = { name ->
            if (name == "send") throw RichChatGatewayException(500, "send_failed", false)
        }
        val runtime = runtime(gateway)
        val items = listOf(typed("u1", "Fix the build"))
        val row = thread(interruptedTurn = "error")

        val failed = submitRichChatResume(
            runtime = runtime,
            plan = RichChatResumePlan.Resend("Fix the build"),
            continuePrompt = CONTINUE,
            configuration = ThreadConfig(model = "gpt-5"),
            activeRequest = null,
        )
        assertTrue(failed is RichChatOperationResult.Failed)
        // The failure reaches the thread's status banner like a typed send's.
        assertNotNull(runtime.chat.state.value.failure)
        val afterFailure = RichChatResumePlanner.suppressionAfterSubmit(failed, row, previous = null)
        assertNull(afterFailure)
        assertEquals(
            RichChatResumePlan.Resend("Fix the build"),
            offer(row, items, suppressedRow = afterFailure),
        )

        gateway.unitHandler = {}
        val sent = submitRichChatResume(
            runtime = runtime,
            plan = RichChatResumePlan.Resend("Fix the build"),
            continuePrompt = CONTINUE,
            configuration = ThreadConfig(model = "gpt-5"),
            activeRequest = null,
        )
        val afterSend = RichChatResumePlanner.suppressionAfterSubmit(sent, row, afterFailure)
        assertSame(row, afterSend)
        assertNull(offer(row, items, suppressedRow = afterSend))
        // The host's next statement replaces the row (a turn that failed again
        // re-arms the marker), which lifts the suppression.
        val restated = row.copy(updatedAt = "2026-10-29T00:05:00Z")
        assertEquals(
            RichChatResumePlan.Resend("Fix the build"),
            offer(restated, items, suppressedRow = afterSend),
        )
    }

    @Test
    fun aRestoredSnapshotRowStillOffersTheAction() {
        val restored = RemoteJson.decodeFromString(
            RemoteThread.serializer(),
            """
            {
              "id": "t1", "projectId": "p1", "title": "Thread", "agentKind": "agent",
              "status": "inactive", "attention": "none", "presentationMode": "gui",
              "createdAt": "2026-10-29T00:00:00Z", "updatedAt": "2026-10-29T00:00:00Z",
              "interruptedTurn": "restart"
            }
            """.trimIndent(),
        )

        assertEquals(
            RichChatResumePlan.Resend("Fix the build"),
            offer(restored, listOf(typed("u1", "Fix the build"))),
        )
    }

    private fun offer(
        thread: RemoteThread,
        items: List<RichRuntimeItem>,
        composerEmpty: Boolean = true,
        canSubmit: Boolean = true,
        isTurnActive: Boolean = false,
        suppressedRow: RemoteThread? = null,
    ) = RichChatResumePlanner.offer(
        thread = thread,
        items = items,
        composerEmpty = composerEmpty,
        canSubmit = canSubmit,
        isTurnActive = isTurnActive,
        suppressedRow = suppressedRow,
    )

    private fun TestScope.runtime(gateway: FakeRichChatSessionGateway): RichChatSessionRuntime {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        return RichChatSessionRuntime(session, gateway, scope = backgroundScope)
            .also { it.selectThread("thread-a") }
    }

    private fun thread(interruptedTurn: String?) = RemoteThread(
        id = "thread-a",
        projectId = "p1",
        title = "Thread",
        agentKind = "agent",
        status = "inactive",
        attention = "none",
        presentationMode = "gui",
        createdAt = "2026-10-29T00:00:00Z",
        updatedAt = "2026-10-29T00:00:00Z",
        interruptedTurn = interruptedTurn,
    )

    private fun typed(id: String, text: String): RichRuntimeItem =
        user(id, """{"content":[{"kind":"text","text":${JsonPrimitive(text)}}]}""")

    private fun user(id: String, payload: String): RichRuntimeItem =
        item(id, RichItemTypes.USER_MESSAGE, payload = json(payload))

    private fun item(
        id: String,
        type: String,
        payload: JsonElement? = null,
        streams: Map<String, String> = emptyMap(),
    ) = RichRuntimeItem(
        id = id,
        type = type,
        state = RichItemState.COMPLETED,
        payload = payload,
        streams = streams,
    )

    private fun json(value: String): JsonElement = RemoteJson.parseToJsonElement(value)

    private companion object {
        const val CONTINUE = "Continue from where you left off."
    }
}
