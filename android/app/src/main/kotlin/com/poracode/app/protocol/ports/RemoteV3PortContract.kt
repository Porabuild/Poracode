package com.poracode.app.protocol.ports

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.ports.ActivePortForward
import com.poracode.app.model.ports.DetectedPort
import com.poracode.app.model.ports.DetectedPortProtocol
import com.poracode.app.model.ports.PortForwardSnapshot
import com.poracode.app.protocol.CleartextPolicy
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteField
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.RouteforwardU2DEnterPath_32e268a4ad
import com.poracode.remote.v3.generated.RouteforwardU2DEnterQuery_a6940e107d
import com.poracode.remote.v3.generated.RouteportU2DEnterRequest_4067ad04bf
import com.poracode.remote.v3.generated.RouteportU2DForwardRequest_a26f77dd4a
import com.poracode.remote.v3.generated.routeU2EForwardU2DEnterU2EPath
import com.poracode.remote.v3.generated.routeU2EForwardU2DEnterU2EQuery
import com.poracode.remote.v3.generated.routeU2EPortU2DEnterU2ERequest
import com.poracode.remote.v3.generated.routeU2EPortU2DEnterU2EResponse
import com.poracode.remote.v3.generated.routeU2EPortU2DForwardU2ERequest
import com.poracode.remote.v3.generated.routeU2EPortU2DForwardU2EResponse
import com.poracode.remote.v3.generated.routeU2EPortU2DUnforwardU2ERequest
import com.poracode.remote.v3.generated.routeU2EPortU2DUnforwardU2EResponse
import com.poracode.remote.v3.generated.routeU2EPortsU2DReadU2EResponse
import okhttp3.HttpUrl.Companion.toHttpUrl

data class PortRoute(
    val id: String,
    val method: String,
    val path: String,
    val scope: String?,
    val expectedStatus: Int,
)

/** Hash-isolating facade over the generated remote-v3 port-forward roots. */
object RemoteV3PortContract {
    private val routes = RemoteContractMetadata.routes.associateBy { it.id }

    init {
        GeneratedRemoteV3Contract.verifyRuntimeCompatibility()
        verify("ports-read", "GET", "/api/ports", "ports:forward", "json")
        verify("port-forward", "POST", "/api/ports/forward", "ports:forward", "json")
        verify("port-enter", "POST", "/api/ports/enter", "ports:forward", "json")
        verify("port-unforward", "POST", "/api/ports/unforward", "ports:forward", "json")
        val enter = checkNotNull(routes["forward-enter"])
        check(enter.method == "GET")
        check(enter.path == "/forward/{forwardId}/enter")
        check(enter.auth == "forward-enter-token")
        check(enter.scopes.isEmpty())
        check(enter.responseKind == "redirect-html")
    }

    fun route(id: String): PortRoute {
        val route = checkNotNull(routes[id]) { "Unknown remote-v3 route $id" }
        return PortRoute(
            id = route.id,
            method = route.method,
            path = route.path,
            scope = route.scopes.singleOrNull(),
            expectedStatus = route.status,
        )
    }

    fun decodePorts(raw: String): PortForwardSnapshot = boundary("ports-read") {
        val value = RemoteRootCodecs.routeU2EPortsU2DReadU2EResponse.decode(raw).value
        PortForwardSnapshot(
            detected = value.detected.map { item ->
                DetectedPort(
                    port = item.port.toPort(),
                    protocol = when (item.protocol.name) {
                        "HTTP" -> DetectedPortProtocol.Http
                        else -> DetectedPortProtocol.Unknown
                    },
                    label = item.label.valueOrNull(),
                )
            },
            forwards = value.forwards.map { item ->
                ActivePortForward(
                    id = item.id,
                    targetPort = item.targetPort.toPort(),
                    listenPort = item.listenPort.toPort(),
                    createdAtEpochMs = item.createdAt,
                )
            },
        )
    }

    fun encodeForward(targetPort: Int): String = boundary("port-forward request") {
        RemoteRootCodecs.routeU2EPortU2DForwardU2ERequest.encode(
            RouteportU2DForwardRequest_a26f77dd4a(targetPort.toLong()),
        )
    }

    fun decodeForward(raw: String): Pair<ActivePortForward, String?> =
        boundary("port-forward response") {
            val value = RemoteRootCodecs.routeU2EPortU2DForwardU2EResponse.decode(raw).value
            ActivePortForward(
                id = value.forward.id,
                targetPort = value.forward.targetPort.toPort(),
                listenPort = value.forward.listenPort.toPort(),
                createdAtEpochMs = value.forward.createdAt,
            ) to value.enterPath.valueOrNull()
        }

    fun encodeEnter(id: String): String = boundary("port-enter request") {
        RemoteRootCodecs.routeU2EPortU2DEnterU2ERequest.encode(
            RouteportU2DEnterRequest_4067ad04bf(id),
        )
    }

    fun decodeEnter(raw: String): String = boundary("port-enter response") {
        RemoteRootCodecs.routeU2EPortU2DEnterU2EResponse.decode(raw).value.enterPath
    }

    fun encodeUnforward(id: String): String = boundary("port-unforward request") {
        RemoteRootCodecs.routeU2EPortU2DUnforwardU2ERequest.encode(
            RouteportU2DEnterRequest_4067ad04bf(id),
        )
    }

    fun decodeUnforward(raw: String) = boundary("port-unforward response") {
        check(RemoteRootCodecs.routeU2EPortU2DUnforwardU2EResponse.decode(raw).value.ok)
    }

    /**
     * Resolves the token-bearing enter path using the manifest's preserved-base-path policy.
     * The token is validated and returned only to the immediate browser-open callback.
     */
    fun browserEntryUrl(endpoint: String, enterPath: String): String = boundary("forward-enter") {
        val raw = enterPath.trim()
        require(raw.startsWith('/') && !raw.startsWith("//"))
        val parsed = checkNotNull(DUMMY_ORIGIN.resolve(raw))
        require(parsed.scheme == DUMMY_ORIGIN.scheme && parsed.host == DUMMY_ORIGIN.host)
        require(parsed.fragment == null && parsed.username.isEmpty() && parsed.password.isEmpty())
        require(parsed.encodedPathSegments.size == 3)
        require(parsed.encodedPathSegments[0] == "forward")
        require(parsed.encodedPathSegments[2] == "enter")
        require(parsed.querySize == 1 && parsed.queryParameterNames == setOf("fwt"))
        val forwardId = parsed.pathSegments[1]
        val token = parsed.queryParameter("fwt").orEmpty()
        require(forwardId.isNotBlank() && token.isNotBlank())

        RemoteRootCodecs.routeU2EForwardU2DEnterU2EPath.encode(
            RouteforwardU2DEnterPath_32e268a4ad(forwardId),
        )
        RemoteRootCodecs.routeU2EForwardU2DEnterU2EQuery.encode(
            RouteforwardU2DEnterQuery_a6940e107d(token),
        )

        val base = endpoint.toHttpUrl().newBuilder().query(null).fragment(null).build()
        CleartextPolicy.enforce(base.toString())
        val prefix = base.encodedPath.let { path ->
            when {
                path.isEmpty() || path == "/" -> "/"
                path.endsWith('/') -> path
                else -> "$path/"
            }
        }
        base.newBuilder()
            .encodedPath(prefix + parsed.encodedPath.trimStart('/'))
            .encodedQuery(parsed.encodedQuery)
            .build()
            .toString()
    }

    private fun verify(
        id: String,
        method: String,
        path: String,
        scope: String,
        responseKind: String,
    ) {
        val route = checkNotNull(routes[id])
        check(route.method == method)
        check(route.path == path)
        check(route.auth == "bearer")
        check(route.scopes == listOf(scope))
        check(route.responseKind == responseKind)
        check(route.status == 200)
    }

    private inline fun <T> boundary(name: String, operation: () -> T): T = try {
        operation()
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        throw RemoteClientException.invalidResponse("Remote port validation failed at $name.")
    }

    private fun Long.toPort(): Int {
        require(this in 1..65_535)
        return toInt()
    }

    private fun <T> RemoteField<T>.valueOrNull(): T? = when (this) {
        is RemoteField.Value -> value
        RemoteField.Missing,
        RemoteField.Null,
        -> null
    }

    private val DUMMY_ORIGIN = "https://poracode.invalid/".toHttpUrl()
}
