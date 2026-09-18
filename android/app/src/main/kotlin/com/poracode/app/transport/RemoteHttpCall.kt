package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import java.io.IOException
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
        if (deadlineNanos != null) call.timeout().deadlineNanoTime(deadlineNanos)
        if (!networkGate.registerCall(call)) {
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
                if (call.isCanceled()) {
                    cont.resumeWithException(
                        CancellationException("OkHttp call cancelled"),
                    )
                    return
                }
                cont.resumeWithException(
                    RemoteClientException(
                        "Network request failed.",
                        status = 0,
                        code = "network",
                    ),
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
