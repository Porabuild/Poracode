package com.poracode.app.model.ports

enum class DetectedPortProtocol {
    Http,
    Unknown,
}

data class DetectedPort(
    val port: Int,
    val protocol: DetectedPortProtocol,
    val label: String?,
)

data class ActivePortForward(
    val id: String,
    val targetPort: Int,
    val listenPort: Int,
    val createdAtEpochMs: Long,
)

data class PortForwardSnapshot(
    val detected: List<DetectedPort>,
    val forwards: List<ActivePortForward>,
)

sealed interface PortForwardFailure {
    data object Offline : PortForwardFailure
    data object MissingScope : PortForwardFailure
    data object Unauthorized : PortForwardFailure
    data object NotFound : PortForwardFailure
    data object InvalidInput : PortForwardFailure
    data object InvalidResponse : PortForwardFailure

    /**
     * Definite browser-entry unavailability, distinct from [AmbiguousDelivery]
     * (outcome unknown) and [Unavailable] (host/route unreachable): the host
     * either does not advertise the isolated origin-bound entry or reports it
     * unconfigured (503 `forward_browser_unavailable`). The forward itself and
     * raw list/start/stop stay usable.
     */
    data object BrowserUnavailable : PortForwardFailure
    data object AmbiguousDelivery : PortForwardFailure
    data object Unavailable : PortForwardFailure
}

data class PortForwardUiState(
    val loading: Boolean = false,
    val detected: List<DetectedPort> = emptyList(),
    val forwards: List<ActivePortForward> = emptyList(),
    val busyForwardIds: Set<String> = emptySet(),
    val starting: Boolean = false,
    val failure: PortForwardFailure? = null,
)
