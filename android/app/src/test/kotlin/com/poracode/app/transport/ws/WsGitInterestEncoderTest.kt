package com.poracode.app.transport.ws

import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.obj
import com.poracode.app.protocol.git.GitInterest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Wire parity for the `git-state-interests` client message: the three v3
 * variants and exact-empty clear must match
 * `protocol/remote/v3/fixtures/git-state-stream.json` exactly.
 */
class WsGitInterestEncoderTest {
    private fun fixture(): JsonObject {
        val stream = javaClass.classLoader!!.getResourceAsStream(
            "fixtures/git-state-stream.json",
        )!!
        val raw = stream.bufferedReader().use { it.readText() }
        return com.poracode.app.model.RemoteJson.parseToJsonElement(raw).asObjectOrNull()!!
    }

    @Test
    fun encodesAllThreeVariantsMatchingFixtureOrder() {
        val expected = fixture().obj("client")!!
        val expectedInterests = expected["interests"]!!.jsonArray

        val encoded = WsGitInterestEncoder.encode(
            listOf(
                GitInterest.Target(
                    projectId = "project-1",
                    worktreePath = "/repo/worktrees/native",
                    branch = "feature/native",
                    includePrDetails = true,
                ),
                GitInterest.PullRequest(
                    projectId = "project-1",
                    prNumber = 314,
                    branch = "feature/native",
                    includeReviewBundle = true,
                ),
                GitInterest.ProjectPullRequests(projectId = "project-1"),
            ),
        )

        assertEquals(expectedInterests.size, encoded.size)
        expectedInterests.forEachIndexed { index, expectedItem ->
            val actual = encoded[index] as JsonObject
            val expectedObj = expectedItem as JsonObject
            assertEquals("interest[$index] kind", expectedObj["kind"], actual["kind"])
            assertEquals("interest[$index] projectId", expectedObj["projectId"], actual["projectId"])
        }
        // Variant-specific fields round-trip.
        val target = encoded[0] as JsonObject
        assertEquals(JsonPrimitive("/repo/worktrees/native"), target["worktreePath"])
        assertEquals(JsonPrimitive(true), target["includePrDetails"])
        val pr = encoded[1] as JsonObject
        assertEquals(JsonPrimitive(314), pr["prNumber"])
        assertEquals(JsonPrimitive(true), pr["includeReviewBundle"])
    }

    @Test
    fun exactEmptyClearEncodesAsEmptyArray() {
        assertEquals(0, WsGitInterestEncoder.encode(emptyList()).size)
    }

    @Test
    fun signatureDetectsUnchangedVersusChanged() {
        val a = listOf(GitInterest.Target(projectId = "p", worktreePath = "/w", includePrDetails = true))
        assertEquals(WsGitInterestEncoder.signature(a), WsGitInterestEncoder.signature(a))
        val b = listOf(GitInterest.Target(projectId = "p", worktreePath = "/other", includePrDetails = true))
        assertTrue(WsGitInterestEncoder.signature(a) != WsGitInterestEncoder.signature(b))
    }
}
