package com.poracode.app.chat

import com.poracode.app.model.ClientConnectionId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

internal val richTestConnectionId = ClientConnectionId("00000000-0000-4000-8000-000000000001")

internal fun Any.readRichFixture(name: String): JsonObject {
    val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
        ?: error("Missing shared fixture fixtures/$name")
    return Json.parseToJsonElement(stream.bufferedReader().use { it.readText() }).jsonObject
}
