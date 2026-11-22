package com.poracode.app.model

import kotlinx.serialization.Serializable

@Serializable
data class RemoteHostWorkspace(
    val id: String,
    val name: String,
    val icon: String? = null,
)
