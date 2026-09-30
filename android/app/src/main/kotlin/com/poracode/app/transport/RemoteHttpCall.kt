package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import java.io.IOException
import java.io.InterruptedIOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

/** Keeps the foreground barrier and call deadline active through body decoding. */
internal suspend fun <Value> executeRemoteRequest(
    client: OkHttpClient,
    networkGate: ForegroundNetworkGate,
    request: Request,
    deadlineNanos: Long? = null,
    process: (Response) -> Value,
): Value {
    if (!networkGate.isOpen) {
        throw CancellationException("Foreground network gate closed")
    }
    return suspendCancellableCoroutine { cont ->
        val call = client.newCall(request)
        // Own the deadline so expiry is attributable. OkHttp's call timeout
        // cancels the call exactly like a caller or gate cancel does, so
        // `isCanceled` alone cannot say whether the transport deadline fired.
        val effectiveDeadlineNanos = deadlineNanos ?: client.callTimeoutMillis
            .takeIf { it > 0 }
            ?.let { System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(it.toLong()) }
        if (effectiveDeadlineNanos != null) {
            call.timeout().deadlineNanoTime(effectiveDeadlineNanos)
        }
        val registration = networkGate.registerCall(call)
        if (registration == null) {
            cont.resumeWithException(CancellationException("Foreground network gate closed"))
            return@suspendCancellableCoroutine
        }
        cont.invokeOnCancellation {
            networkGate.unregisterCall(call)
            call.cancel()
        }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                networkGate.unregisterCall(call)
                if (!cont.isActive) return
                // Caller and background cancellation are explicit intent. The
                // gate marker survives a close/reopen before this failure is
                // delivered; a mere `isCanceled` is never cause evidence.
                if (registration.isGateCancelled) {
                    cont.resumeWithException(
                        CancellationException("Foreground network gate closed"),
                    )
                    return
                }
                if (isTimeout(e, call, effectiveDeadlineNanos)) {
                    cont.resumeWithException(
                        RemoteClientException(
                            "Network request timed out.",
                            status = 0,
                            code = "timeout",
                        ),
                    )
                    return
                }
                cont.resumeWithException(
                    if (TlsCertPin.isMismatch(e)) {
                        RemoteClientException(
                            TlsCertPin.mismatchMessage(),
                            status = 502,
                            code = TlsCertPin.MISMATCH_CODE,
                        )
                    } else {
                        RemoteClientException(
                            "Network request failed.",
                            status = 0,
                            code = "network",
                        )
                    },
                )
            }

            override fun onResponse(call: Call, response: Response) {
                if (!cont.isActive) {
                    networkGate.unregisterCall(call)
                    response.close()
                    return
                }
                try {
                    cont.resume(process(response))
                } catch (e: IOException) {
                    onFailure(call, e)
                } catch (e: Exception) {
                    if (cont.isActive) cont.resumeWithException(e)
                } finally {
                    networkGate.unregisterCall(call)
                }
            }
        })
    }
}

/**
 * A read/write timeout is a typed transport deadline; a cancelled call is a
 * deadline only when our own deadline actually elapsed. Unattributed
 * cancellation is not a timeout and not a caller cancellation — it falls
 * through to the plain network classification.
 */
private fun isTimeout(e: IOException, call: Call, deadlineNanos: Long?): Boolean =
    e is InterruptedIOException ||
        (call.isCanceled() && deadlineNanos != null && System.nanoTime() >= deadlineNanos)
