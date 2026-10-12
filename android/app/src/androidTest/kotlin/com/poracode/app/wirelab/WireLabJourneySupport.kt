package com.poracode.app.wirelab

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject

/** Shared support for the API 37 wire-lab journey instrumentation tests. */

object WireLabArgs {
    fun controlBaseUrl(): String {
        val args = InstrumentationRegistry.getArguments()
        val host = args.getString("controlHost") ?: "127.0.0.1"
        val port = args.getString("controlPort") ?: "49161"
        return "http://$host:$port"
    }

    fun capability(): String =
        InstrumentationRegistry.getArguments().getString("capability")
            ?: error("instrumentation arg 'capability' is required")

    /** App-facing host base URL (loopback, reached through `adb reverse`). */
    fun hostBaseUrl(): String =
        InstrumentationRegistry.getArguments().getString("hostBaseUrl") ?: "http://127.0.0.1:49160/"

    /**
     * Same lab reached through the Android emulator host alias `10.0.2.2`, which the
     * platform treats as a local-network endpoint and therefore exercises the real
     * Android 17 `ACCESS_LOCAL_NETWORK` runtime permission path against a live host.
     */
    fun emulatorAliasBaseUrl(): String {
        val raw = InstrumentationRegistry.getArguments().getString("emulatorAliasBaseUrl")
        if (!raw.isNullOrEmpty()) return raw
        val port = hostBaseUrl().substringAfterLast(":").removeSuffix("/").trim()
        return "http://10.0.2.2:$port/"
    }
}

/** Builds the deterministic scenario `await` condition for a set of observed operations. */
fun operationsObservedCondition(operationIds: List<String>): JSONObject = JSONObject()
    .put("kind", "operations-observed")
    .put("operationIds", JSONArray(operationIds))

/** Asserts every [expected] operation id is present in the lab's observed set. */
fun assertObserved(control: WireLabControl, expected: List<String>) {
    val observed = control.observedOperationIds()
    val missing = expected.filter { it !in observed }
    check(missing.isEmpty()) { "missing observed operations: $missing (have ${observed.size})" }
}
