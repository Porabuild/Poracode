package com.poracode.app.session.replay

import com.poracode.app.model.asObjectOrNull
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Loads root protocol/remote/v3 fixtures from the JVM test classpath. */
internal object ReplayFixtureSupport {
    fun readFixture(name: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture fixtures/$name from protocol/remote/v3")
        return stream.bufferedReader().use { it.readText() }
    }

    fun readFixtureJson(name: String): JsonObject {
        val raw = readFixture(name)
        return com.poracode.app.model.RemoteJson.parseToJsonElement(raw).asObjectOrNull()
            ?: error("Fixture $name is not a JSON object")
    }

    fun parseObject(text: String): JsonObject =
        com.poracode.app.model.RemoteJson.parseToJsonElement(text).asObjectOrNull()
            ?: error("Not a JSON object")

    fun parseElement(text: String): JsonElement =
        com.poracode.app.model.RemoteJson.parseToJsonElement(text)
}
