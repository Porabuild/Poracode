package com.poracode.app.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ResyncCoordinatorTest {
    @Test
    fun gapBeginsRefreshAndBlocksLiveEvents() {
        val coord = ResyncCoordinator()
        assertTrue(coord.allowsLiveEvents)
        val action = coord.noteNeedsResync()
        assertEquals(ResyncCoordinator.Action.BeginRefresh, action)
        assertTrue(coord.pending)
        assertTrue(coord.inFlight)
        assertFalse(coord.allowsLiveEvents)
        assertEquals(ResyncCoordinator.Action.DropLiveEvent, coord.actionForLiveEvent())
    }

    @Test
    fun concurrentNeedsResyncIsSingleFlight() {
        val coord = ResyncCoordinator()
        assertEquals(ResyncCoordinator.Action.BeginRefresh, coord.noteNeedsResync())
        assertEquals(ResyncCoordinator.Action.AlreadyInFlight, coord.noteNeedsResync())
        assertTrue(coord.pending)
        assertEquals(0, coord.failureCount)
    }

    @Test
    fun historyFailureClearsStuckPendingForRecovery() {
        val coord = ResyncCoordinator()
        coord.noteNeedsResync()
        val failure = coord.noteFailure()
        assertEquals(ResyncCoordinator.Action.FailureRecover, failure)
        // Gate clears so we do not remain stuck pending forever.
        assertFalse(coord.pending)
        assertFalse(coord.inFlight)
        assertEquals(1, coord.failureCount)
        assertTrue(coord.allowsLiveEvents)
    }

    @Test
    fun successClearsGateAndReconnectsFromSeq() {
        val coord = ResyncCoordinator()
        coord.noteNeedsResync()
        val success = coord.noteSuccess(appliedSeq = 42)
        assertEquals(ResyncCoordinator.Action.Reconnect, success)
        assertEquals(42, coord.lastSuccessSeq)
        assertFalse(coord.pending)
        assertFalse(coord.inFlight)
        assertEquals(0, coord.failureCount)
        assertTrue(coord.allowsLiveEvents)
    }

    @Test
    fun successAfterFailureClearsPending() {
        val coord = ResyncCoordinator()
        coord.noteNeedsResync()
        coord.noteFailure()
        coord.noteNeedsResync()
        val success = coord.noteSuccess(appliedSeq = 7)
        assertEquals(ResyncCoordinator.Action.Reconnect, success)
        assertFalse(coord.pending)
    }

    @Test
    fun concurrentEventWhilePendingIsDropped() {
        val coord = ResyncCoordinator()
        coord.noteNeedsResync()
        assertEquals(ResyncCoordinator.Action.DropLiveEvent, coord.actionForLiveEvent())
    }

    @Test
    fun cancellationIsFailurePath() {
        val coord = ResyncCoordinator()
        coord.noteNeedsResync()
        // History cancel → noteFailure → recovery reconnect from 0 (caller side).
        assertEquals(ResyncCoordinator.Action.FailureRecover, coord.noteFailure())
        assertFalse(coord.pending)
    }
}

class SocketGenerationGateTest {
    @Test
    fun forceReconnectInvalidatesPriorCallbacks() {
        val gate = SocketGenerationGate()
        val gen1 = gate.invalidate()
        assertEquals(
            SocketGenerationGate.Decision.Proceed,
            gate.decision(gen1, SocketGenerationGate.CallbackKind.ReceiveFailure),
        )
        val gen2 = gate.beginForceReconnect()
        assertTrue(gen1 != gen2)
        assertEquals(
            SocketGenerationGate.Decision.IgnoreStale,
            gate.decision(gen1, SocketGenerationGate.CallbackKind.HealthTimeout),
        )
        assertEquals(
            SocketGenerationGate.Decision.Proceed,
            gate.decision(gen2, SocketGenerationGate.CallbackKind.ScheduleReconnectFire),
        )
    }

    @Test
    fun staleGenerationFramesIgnored() {
        val gate = SocketGenerationGate()
        val connectGen = gate.invalidate()
        gate.beginForceReconnect()
        assertEquals(
            SocketGenerationGate.Decision.IgnoreStale,
            gate.decision(connectGen, SocketGenerationGate.CallbackKind.ReceiveFailure),
        )
        assertEquals(
            SocketGenerationGate.Decision.IgnoreStale,
            gate.decision(connectGen, SocketGenerationGate.CallbackKind.Publish),
        )
    }

    @Test
    fun stopInvalidationDropsScheduleReconnectFire() {
        val gate = SocketGenerationGate()
        val scheduledGen = gate.generation
        gate.invalidate()
        assertEquals(
            SocketGenerationGate.Decision.IgnoreStale,
            gate.decision(scheduledGen, SocketGenerationGate.CallbackKind.ScheduleReconnectFire),
        )
    }
}
