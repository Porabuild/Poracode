package com.poracode.app.transport.ws

import kotlin.random.Random
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies [BrowserFramePeek] is an allocation-bounded, order-independent, decoy-resistant
 * top-level discriminator that recognizes exactly the three browser-mirror `"type"` values
 * without scanning/copying a large base64 payload.
 */
class BrowserFramePeekTest {
    @Test
    fun typeFirstRecognizesAllThreeVariants() {
        assertTrue(BrowserFramePeek.isBrowserMirror("""{"type":"browser-state","state":{"tabs":[],"activeTabId":null}}"""))
        assertTrue(
            BrowserFramePeek.isBrowserMirror(
                """{"type":"browser-frame","tabId":"t1","data":"AAAA","metadata":{"deviceWidth":1.0}}""",
            ),
        )
        assertTrue(
            BrowserFramePeek.isBrowserMirror(
                """{"type":"browser-mirror-status","status":{"status":"active","tabId":"t1"}}""",
            ),
        )
    }

    @Test
    fun typeLastAfterLargePayloadIsRecognizedWithoutCopyingIt() {
        // A large-ish base64-like payload before type: the peek must walk past it without
        // materializing it and still find the top-level type key at the end.
        val largePayload = buildString {
            repeat(40_000) { append(BASE64_ALPHABET[Random.nextInt(BASE64_ALPHABET.length)]) }
        }
        val frame = "{\"tabId\":\"t1\",\"data\":\"$largePayload\",\"type\":\"browser-frame\"}"
        assertTrue(BrowserFramePeek.isBrowserMirror(frame))
    }

    @Test
    fun nestedDecoyIsRejected() {
        // A type field buried inside a nested object must not be mistaken for the top level.
        assertFalse(
            BrowserFramePeek.isBrowserMirror(
                """{"state":{"type":"browser-frame"},"seq":7}""",
            ),
        )
        assertFalse(
            BrowserFramePeek.isBrowserMirror(
                """{"event":{"payload":{"type":"browser-mirror-status"}}}""",
            ),
        )
    }

    @Test
    fun escapedStringDecoyIsRejected() {
        // A decoy type/value buried inside a string value (with escaped quotes) must not
        // fool the scanner, whether the hosting string is a key value or a nested token.
        assertFalse(
            BrowserFramePeek.isBrowserMirror(
                """{"title":"\"type\":\"browser-frame\"","seq":3}""",
            ),
        )
        assertFalse(
            BrowserFramePeek.isBrowserMirror(
                """{"event":"a \"type\":\"browser-state\" b"}""",
            ),
        )
    }

    @Test
    fun topLevelTypeWithUnrecognizedValueIsRejected() {
        // The discriminator recognizes exactly the three browser-mirror variants; any other
        // top-level type value (event, terminal-output, resync-required) falls through.
        assertFalse(BrowserFramePeek.isBrowserMirror("""{"type":"event","seq":1}"""))
        assertFalse(BrowserFramePeek.isBrowserMirror("""{"type":"terminal-output"}"""))
        assertFalse(BrowserFramePeek.isBrowserMirror("""{"seq":5,"type":"resync-required"}"""))
    }

    @Test
    fun malformedJsonIsRejectedRatherThanCrashing() {
        assertFalse(BrowserFramePeek.isBrowserMirror("{type/browser-frame"))
        assertFalse(BrowserFramePeek.isBrowserMirror("""{"type":""""))
        assertFalse(BrowserFramePeek.isBrowserMirror(""))
        assertFalse(BrowserFramePeek.isBrowserMirror("not json at all"))
        // Truncated value string (no closing quote) never yields a literal.
        assertFalse(BrowserFramePeek.isBrowserMirror("""{"type":"browser-state"""))
    }

    @Test
    fun whitespaceBetweenKeySeparatorAndValueIsTolerated() {
        assertTrue(
            BrowserFramePeek.isBrowserMirror(
                "{ \"type\" :  \"browser-frame\" , \"data\":\"AAA\" }",
            ),
        )
    }

    @Test
    fun keysThatMerelyContainTypeSubstringAreRejected() {
        assertFalse(BrowserFramePeek.isBrowserMirror("""{"types":"browser-frame"}"""))
        assertFalse(BrowserFramePeek.isBrowserMirror("""{"meta_type":"browser-frame"}"""))
        assertFalse(BrowserFramePeek.isBrowserMirror("""{"typeId":"browser-frame"}"""))
    }

    private companion object {
        const val BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    }
}
