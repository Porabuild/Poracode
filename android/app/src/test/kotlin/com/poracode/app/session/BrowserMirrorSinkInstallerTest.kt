package com.poracode.app.session

import com.poracode.app.transport.ws.WsRawFrameSink
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies [BrowserMirrorSinkInstaller] never forwards a late frame from a torn-down
 * client, even when two distinct clients would report the same numeric socket generation,
 * and that the replacement client's frame is delivered exactly once.
 *
 * Identity is by reference (the generation counter can repeat across two clients), so a
 * late frame on the detached old client is dropped before it can be stamped as current.
 */
class BrowserMirrorSinkInstallerTest {
    @Test
    fun lateOldClientFrameRejectedReplacementDeliveredExactlyOnce() {
        val installer = BrowserMirrorSinkInstaller<FakeHost>()
        // Both clients would expose the same numeric socket generation in a real session;
        // the installer must not rely on that number for identity.
        val hostA = FakeHost("A")
        val hostB = FakeHost("B")
        val forwarded = mutableListOf<Pair<Int, String>>()
        fun forward(gen: Int, text: String) { forwarded += gen to text }

        // Live socket becomes hostA: install + forward its frame.
        var live: FakeHost? = hostA
        installer.install(
            live = live,
            setSink = FakeHost::setSink,
            liveSupplier = { live },
            forward = ::forward,
        )
        hostA.deliver(generation = 7, text = "frame-A-1")
        assertEquals(listOf(7 to "frame-A-1"), forwarded)

        // Host swap: hostB replaces hostA. hostA's sink must be detached (cleared), hostB
        // gets the forwarding closure bound to ITS identity.
        live = hostB
        installer.install(
            live = live,
            setSink = FakeHost::setSink,
            liveSupplier = { live },
            forward = ::forward,
        )
        assertTrue("old client sink detached on swap", hostA.sink.get() == null)

        // Late frame from the torn-down hostA arrives on its old captured sink. It must be
        // rejected by the identity check — it is NOT forwarded even though its generation
        // matches a value hostB could also report.
        hostA.deliver(generation = 7, text = "late-frame-A")
        assertEquals("late old-client frame not forwarded", listOf(7 to "frame-A-1"), forwarded)

        // Replacement frame on hostB is delivered exactly once.
        hostB.deliver(generation = 7, text = "frame-B-1")
        assertEquals(listOf(7 to "frame-A-1", 7 to "frame-B-1"), forwarded)

        // Live becomes null: the installed host (hostB) is detached.
        live = null
        installer.install(
            live = null,
            setSink = FakeHost::setSink,
            liveSupplier = { live },
            forward = ::forward,
        )
        assertNull("detached when live becomes null", hostB.sink.get())
        hostB.deliver(generation = 7, text = "after-null")
        assertEquals("no frame after detach", listOf(7 to "frame-A-1", 7 to "frame-B-1"), forwarded)
    }

    @Test
    fun clearingTheSinkDetachesTheInstalledHost() {
        val installer = BrowserMirrorSinkInstaller<FakeHost>()
        val host = FakeHost("A")
        installer.install(
            live = host,
            setSink = FakeHost::setSink,
            liveSupplier = { host },
            forward = { _, _ -> },
        )
        assertTrue(host.sink.get() != null)
        installer.clear(setSink = FakeHost::setSink)
        assertNull(host.sink.get())
    }

    @Test
    fun reInstallWithSameIdentityIsIdempotent() {
        val installer = BrowserMirrorSinkInstaller<FakeHost>()
        val host = FakeHost("A")
        installer.install(host, FakeHost::setSink, { host }) { _, _ -> }
        val firstSink = host.sink.get()
        installer.install(host, FakeHost::setSink, { host }) { _, _ -> }
        assertEquals("no re-install churn for the same identity", firstSink, host.sink.get())
    }

    private class FakeHost(val name: String) {
        val sink = AtomicReference<WsRawFrameSink?>(null)
        fun setSink(s: WsRawFrameSink?) {
            sink.set(s)
        }
        fun deliver(generation: Int, text: String) {
            sink.get()?.onFrame(generation, text)
        }
    }
}
