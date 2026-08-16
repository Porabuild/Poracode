package com.poracode.app.session.richchat

import com.poracode.app.chat.RichImagePolicy
import com.poracode.app.transport.richchat.AttachmentUploadBody
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RichCheckpointAndMediaControllerTest {
    @Test
    fun checkpointFixtureCollectionsInstallAuthoritatively() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, "thread-rich", 1),
        )
        val gateway = FakeRichChatSessionGateway()
        val fixture = Json.parseToJsonElement(fixture("checkpoint-turn-sequences.json")).jsonObject
        fun checkpoints(name: String) = fixture.getValue("listResult").jsonObject
            .getValue(name).jsonArray.map { com.poracode.app.chat.RichSnapshotMapping.decodeCheckpoint(it)!! }
        gateway.checkpointCollection = RichCheckpointCollection(
            checkpoints("checkpoints"),
            checkpoints("turns"),
        )
        val controller = RichCheckpointController(
            session,
            selection,
            gateway,
            ForegroundOperationRegistry(),
        )

        val result = controller.refresh(fixture.getValue("listRequest").jsonObject)

        assertTrue(result is RichChatOperationResult.Success)
        assertEquals(2, controller.state.value.checkpoints.size)
        assertEquals(2, controller.state.value.turns.size)
        assertTrue(controller.state.value.turns.all { it.isTurn })
    }

    @Test
    fun ambiguousRestoreIsIssuedOnceAndForcesRefresh() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, "thread-a", 1),
        )
        val gateway = FakeRichChatSessionGateway()
        gateway.unitHandler = { name ->
            if (name == "checkpoint-restore") {
                throw RichChatGatewayException(null, "outcome_unknown", true)
            }
        }
        val controller = RichCheckpointController(
            session,
            selection,
            gateway,
            ForegroundOperationRegistry(),
        )
        val payload = JsonObject(mapOf("threadId" to kotlinx.serialization.json.JsonPrimitive("thread-a")))

        val result = controller.restore(payload) as RichChatOperationResult.Failed

        assertTrue((result.failure as RichChatOperationFailure.Remote).requestMayHaveCommitted)
        assertEquals(1, gateway.calls.count { it == "checkpoint-restore" })
        assertTrue(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun attachmentLimitsGateBeforeTransportAndRuntimeImageIsThreadOwned() = runTest {
        val host = richLease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(
            RichChatThreadLease(host, "thread-fixture-001", 1),
        )
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatMediaController(
            session,
            selection,
            gateway,
            ForegroundOperationRegistry(),
        )
        val oneByte = AttachmentUploadBody.streaming(1) { it.writeByte(1) }

        val invalid = controller.uploadAttachment("x".repeat(256), "text/plain", oneByte)

        assertTrue(invalid is RichChatOperationResult.Failed)
        assertFalse("upload" in gateway.calls)

        val imageFixture = Json.parseToJsonElement(fixture("image-ref.json"))
        val ref = RichImagePolicy.decodeRemoteRef(imageFixture)!!
        assertTrue(controller.runtimeImagePlan(ref) is RichChatOperationResult.Success)
        assertEquals(1, gateway.calls.count { it == "runtime-image" })

        selection.value = RichChatThreadLease(host, "other-thread", 2)
        assertTrue(controller.runtimeImagePlan(ref) is RichChatOperationResult.Failed)
        assertEquals(1, gateway.calls.count { it == "runtime-image" })
    }
}
