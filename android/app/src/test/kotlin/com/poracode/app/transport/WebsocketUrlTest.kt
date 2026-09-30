package com.poracode.app.transport

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebsocketUrlTest {
    @Test
    fun includesLastSeenSeqZero() {
        val client = RemoteApiClient(
            endpoint = "https://relay.example/s/server-1",
            accessToken = "token",
        )
        val url = client.websocketUrl(
            ticket = "t",
            lastSeenSeq = 0,
            threadItemInterests = listOf("thread-1"),
        )
        assertTrue(url.startsWith("wss://relay.example/s/server-1/ws"))
        assertTrue(url.contains("ticket=t"))
        assertTrue(url.contains("lastSeenSeq=0"))
        assertTrue(url.contains("threadItemInterests="))
    }

    @Test
    fun omitsLastSeenSeqWhenNull() {
        val client = RemoteApiClient(
            endpoint = "https://host.example",
            accessToken = "token",
        )
        val url = client.websocketUrl(ticket = "abc", lastSeenSeq = null)
        assertTrue(url.contains("ticket=abc"))
        assertFalse(url.contains("lastSeenSeq"))
    }

    @Test
    fun preservesRelayBasePath() {
        val client = RemoteApiClient(
            endpoint = "https://relay.example/s/server-1/",
            accessToken = "token",
        )
        val url = client.websocketUrl(ticket = "x", lastSeenSeq = 42)
        assertTrue(url.contains("/s/server-1/ws"))
        assertTrue(url.contains("lastSeenSeq=42"))
    }
}
