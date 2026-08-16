package com.poracode.app.protocol

data class LocalNetworkPermissionUi(
    val status: Status = Status.Idle,
    val sanitizedHost: String = "",
) {
    enum class Status { Idle, Rationale, Denied, Granted }
}
