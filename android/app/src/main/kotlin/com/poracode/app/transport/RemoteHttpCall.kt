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

/**
 * Keeps the foreground barrier and call deadline active through body decoding.
 *
 * [retryableRead] marks a pure read the caller has classified as safe to
 * replay. When such a request fails on a connection-level [IOException]
 * before any response arrives — the signature of a pooled socket the host
 * already closed — it is retried exactly once, immediately. Mutations and
 * every post-response or timeout/TLS/gate failure never retry, so timeouts
 * and mutation-outcome ambiguity are unchanged.
 */
internal suspend fun <Value> executeRemoteRequest(
    client: OkHttpClient,
    networkGate: ForegroundNetworkGate,
    request: Request,
    deadlineNanos: Long? = null,
    retryableRead: Boolean = false,
    process: (Response) -> Value,
): Value {
    if (!networkGate.isOpen) {
        throw CancellationException("Foreground network gate closed")
    }
    return suspendCancellableCoroutine { cont ->
        var retried = false
        var activeCall: Call? = null
        cont.invokeOnCancellation {
            activeCall?.let {
                networkGate.unregisterCall(it)
                it.cancel()
            }
        }
        fun attempt() {
            val call = client.newCall(request)
            activeCall = call
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
                return
            }
            // Set once response headers arrive; a body-decode IOException is a
            // post-response failure and is never eligible for the stale-read
            // replay even though it shares the failure path below.
            var responseReceived = false
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    networkGate.unregisterCall(call)
                    if (activeCall === call) activeCall = null
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
                    val tlsMismatch = TlsCertPin.isMismatch(e)
                    if (retryableRead && !retried && !responseReceived && !tlsMismatch) {
                        retried = true
                        attempt()
                        return
                    }
                    cont.resumeWithException(
                        if (tlsMismatch) {
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
                    responseReceived = true
                    if (!cont.isActive) {
                        networkGate.unregisterCall(call)
                        if (activeCall === call) activeCall = null
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
                        if (activeCall === call) activeCall = null
                    }
                }
            })
        }
        attempt()
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
