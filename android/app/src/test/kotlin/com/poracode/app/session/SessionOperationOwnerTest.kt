package com.poracode.app.session

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionOperationOwnerTest {
    @Test
    fun concurrentBeginsProduceDistinctEpochs() {
        repeat(32) { round ->
            val owner = SessionOperationOwner()
            val n = 64
            val seen = ConcurrentHashMap.newKeySet<Int>()
            val pool = Executors.newFixedThreadPool(8)
            val start = CountDownLatch(1)
            val latch = CountDownLatch(n)
            repeat(n) {
                pool.execute {
                    start.await()
                    seen.add(owner.begin(SessionOperationOwner.Kind.Pair).epoch)
                    latch.countDown()
                }
            }
            start.countDown()
            assertTrue("round $round", latch.await(10, TimeUnit.SECONDS))
            pool.shutdown()
            assertEquals("round $round", n, seen.size)
            assertEquals("round $round", n, owner.epoch)
        }
    }

    @Test
    fun staleTokenIsNotCurrentAfterReplacementBegin() {
        val owner = SessionOperationOwner()
        val first = owner.begin(SessionOperationOwner.Kind.Bootstrap)
        val second = owner.begin(SessionOperationOwner.Kind.Pair)
        assertFalse(owner.isCurrent(first))
        assertTrue(owner.isCurrent(second))
        val bumped = AtomicInteger(owner.bumpSocketIdentity())
        assertEquals(owner.socketIdentity, bumped.get())
        assertFalse(owner.isCurrentSocket(0))
    }

    @Test
    fun tenThousandBeginsHaveUniqueEpochsAndExactKind() {
        val owner = SessionOperationOwner()
        val n = 10_000
        val kinds = arrayOf(
            SessionOperationOwner.Kind.Pair,
            SessionOperationOwner.Kind.Unpair,
            SessionOperationOwner.Kind.Bootstrap,
            SessionOperationOwner.Kind.HostSwap,
            SessionOperationOwner.Kind.LiveStart,
        )
        val recorded = ConcurrentLinkedQueue<Pair<SessionOperationOwner.Kind, SessionOperationOwner.Token>>()
        val pool = Executors.newFixedThreadPool(16)
        val start = CountDownLatch(1)
        val done = CountDownLatch(n)
        repeat(n) { i ->
            val kind = kinds[i % kinds.size]
            pool.execute {
                start.await()
                recorded.add(kind to owner.begin(kind))
                done.countDown()
            }
        }
        start.countDown()
        assertTrue(done.await(30, TimeUnit.SECONDS))
        pool.shutdown()
        assertEquals(n, recorded.size)
        val epochs = recorded.map { it.second.epoch }.toSet()
        assertEquals(n, epochs.size)
        assertEquals(n, owner.epoch)
        for ((requested, token) in recorded) {
            assertEquals(requested, token.kind)
            assertTrue(token.epoch in 1..n)
        }
        val current = recorded.map { it.second }.single { owner.isCurrent(it) }
        assertEquals(n, current.epoch)
        recorded.map { it.second }.filter { it.epoch != n }.forEach {
            assertFalse(owner.isCurrent(it))
        }
    }

    @Test
    fun concurrentWritersNeverTearIdentitySnapshot() {
        val owner = SessionOperationOwner()
        // ConcurrentHashMap forbids null values; closed thread id is "".
        val idByThreadGen = ConcurrentHashMap<Int, String>()
        idByThreadGen[0] = ""
        val tokens = ConcurrentLinkedQueue<SessionOperationOwner.Token>()
        val pool = Executors.newFixedThreadPool(12)
        val start = CountDownLatch(1)
        val ops = 4_000
        val done = CountDownLatch(ops)
        repeat(ops) { i ->
            pool.execute {
                start.await()
                when (i % 7) {
                    0 -> tokens.add(owner.begin(SessionOperationOwner.Kind.Pair))
                    1 -> tokens.add(owner.begin(SessionOperationOwner.Kind.Unpair))
                    2 -> {
                        val gen = owner.beginOpenThread("alpha")
                        idByThreadGen[gen] = "alpha"
                        tokens.add(owner.capture())
                    }
                    3 -> {
                        val gen = owner.beginOpenThread("beta")
                        idByThreadGen[gen] = "beta"
                        tokens.add(owner.capture())
                    }
                    4 -> {
                        val gen = owner.closeThread()
                        idByThreadGen[gen] = ""
                        tokens.add(owner.capture())
                    }
                    5 -> {
                        val gen = owner.invalidateThread()
                        idByThreadGen[gen] = ""
                        tokens.add(owner.capture())
                    }
                    else -> {
                        owner.bumpSessionGeneration()
                        owner.bumpApiIdentity()
                        owner.bumpSocketIdentity()
                        tokens.add(owner.capture())
                    }
                }
                done.countDown()
            }
        }
        start.countDown()
        assertTrue(done.await(30, TimeUnit.SECONDS))
        pool.shutdown()
        assertTrue(tokens.isNotEmpty())
        for (token in tokens) {
            assertTrue(
                "missing thread gen ${token.threadGeneration}",
                idByThreadGen.containsKey(token.threadGeneration),
            )
            assertEquals(
                "torn openThreadId at gen ${token.threadGeneration}",
                idByThreadGen[token.threadGeneration],
                token.openThreadId.orEmpty(),
            )
        }
    }

    @Test
    fun staleAndCurrentDecisionsUnderMixedContention() {
        val owner = SessionOperationOwner()
        val first = owner.begin(SessionOperationOwner.Kind.Bootstrap)
        val n = 2_048
        val begins = ConcurrentLinkedQueue<SessionOperationOwner.Token>()
        val pool = Executors.newFixedThreadPool(16)
        val start = CountDownLatch(1)
        val done = CountDownLatch(n)
        repeat(n) { i ->
            pool.execute {
                start.await()
                when (i % 4) {
                    0 -> begins.add(owner.begin(SessionOperationOwner.Kind.Pair))
                    1 -> begins.add(owner.begin(SessionOperationOwner.Kind.Unpair))
                    2 -> owner.bumpSocketIdentity()
                    else -> owner.bumpApiIdentity()
                }
                done.countDown()
            }
        }
        start.countDown()
        assertTrue(done.await(30, TimeUnit.SECONDS))
        pool.shutdown()
        assertFalse(owner.isCurrent(first))
        val beginTokens = begins.toList()
        val beginCount = beginTokens.size
        assertTrue(beginCount > 0)
        assertEquals(1 + beginCount, owner.epoch)
        assertEquals(beginCount, beginTokens.map { it.epoch }.toSet().size)
        val latest = beginTokens.maxBy { it.epoch }
        assertTrue(owner.isCurrent(latest))
        assertEquals(latest.kind, owner.kind)
        beginTokens.filter { it.epoch != latest.epoch }.forEach {
            assertFalse(owner.isCurrent(it))
            assertNotEquals(it.epoch, owner.epoch)
        }
        assertTrue(owner.isCurrentSocket(owner.socketIdentity))
        assertTrue(owner.isCurrentApi(owner.apiIdentity))
        assertFalse(owner.isCurrentSocket(-1))
        assertFalse(owner.isCurrentApi(-1))
        assertFalse(owner.isCurrentSession(-1))
        assertTrue(owner.isCurrentSession(owner.sessionGeneration))
        assertTrue(owner.isCurrentThread(owner.threadGeneration, owner.openThreadId))
        assertFalse(owner.isCurrentThread(owner.threadGeneration + 1, owner.openThreadId))
    }
}
