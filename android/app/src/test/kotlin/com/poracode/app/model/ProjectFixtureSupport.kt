package com.poracode.app.model

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

internal fun Any.readProjectFixture(name: String): JsonObject {
    val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
        ?: error("Missing fixture fixtures/$name from protocol/remote/v3")
    return RemoteJson.parseToJsonElement(stream.bufferedReader().use { it.readText() }).jsonObject
}
