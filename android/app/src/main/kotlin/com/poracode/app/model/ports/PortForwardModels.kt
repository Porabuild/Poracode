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
