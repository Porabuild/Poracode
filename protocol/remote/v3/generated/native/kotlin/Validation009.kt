// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_9ab386636c31e53c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ready"), JsonPrimitive("unsupported_host"), JsonPrimitive("missing_sdk"), JsonPrimitive("missing_xcode"), JsonPrimitive("missing_idb"), JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9addfc34d28f29dc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser"), JsonPrimitive("chrome"), JsonPrimitive("computer")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9b050dd4848ae8c2: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_304430ceb5560696, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9b963a4b704c492d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedHeadSha", "prNumber", "projectLocation"), properties = mapOf("admin" to schema_f8b6dd8128e8bfe0, "expectedHeadSha" to schema_89303c6cbb3ecd9a, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "method" to schema_72373308389f2027, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ba1e93599d271dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("modifiedAtMs", "path", "status"), properties = mapOf("content" to schema_bf0b727f7b1c6d07, "contentBase64" to schema_bf0b727f7b1c6d07, "hasBom" to schema_feeb8bb50144d96d, "lineEnding" to schema_6d6f1fde7308a250, "modifiedAtMs" to schema_f696f11685898ba7, "path" to schema_bf0b727f7b1c6d07, "status" to schema_949f0ec1c2b67829), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9bc1c08248602f5c: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 255, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9bdd26dd832b19ef: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "patch", "projectId"), properties = mapOf("kind" to schema_cbc64d14585e9a92, "patch" to schema_cadb9042bbcd8536, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9be4e34050076f08: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("autoUpdate", "browserPanel", "chromeBridge", "computerUse", "nativeSecrets", "osNotifications", "portForward", "ssh"), properties = mapOf("autoUpdate" to schema_f8b6dd8128e8bfe0, "browserPanel" to schema_f8b6dd8128e8bfe0, "chromeBridge" to schema_f8b6dd8128e8bfe0, "computerUse" to schema_f8b6dd8128e8bfe0, "nativeSecrets" to schema_f8b6dd8128e8bfe0, "osNotifications" to schema_f8b6dd8128e8bfe0, "portForward" to schema_f8b6dd8128e8bfe0, "ssh" to schema_f8b6dd8128e8bfe0), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_9c01de6b080eca40: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("merge"), JsonPrimitive("squash"), JsonPrimitive("rebase")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9c44204b656290c2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("default", "description", "envVar", "key", "label", "options", "type"), properties = mapOf("default" to schema_bf0b727f7b1c6d07, "description" to schema_bf0b727f7b1c6d07, "envVar" to schema_36fea325bf1aca70, "key" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "options" to schema_d0b10c04efa78c87, "platforms" to schema_0f732b9fceb2c6ac, "type" to schema_36b9fe91ec45bcd5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9c63009f65a656d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("numTurns", "threadId"), properties = mapOf("config" to schema_77c646d1a00c89a5, "numTurns" to schema_56aa0e45cbdce0d0, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9c8337f42f233534: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("shared"), JsonPrimitive("poracode")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ca4aec6d46ade2e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("view"), JsonPrimitive("control")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9cb900aa2dda44d0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseCheckpointItemId", "checkpointItemId", "projectLocation", "threadId"), properties = mapOf("baseCheckpointItemId" to schema_36fea325bf1aca70, "checkpointItemId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9d263023fc1dd3de: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1c58197f2405018b, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9d4f8a22a3e1fa05: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_6f5fd1f7837ee8fe), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_9d72555063ba9bd7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("runtime.truncated")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9d9cbc9ed0e89822: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1c2823e73ee0c1dc, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9da23fadb81a50e3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "threadId", "type"), properties = mapOf("message" to schema_bf0b727f7b1c6d07, "presentation" to schema_4886facc92937666, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_a023928e20a71a47), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9dbd17894594944e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "snapshot"), properties = mapOf("kind" to schema_9e712b4f87e5beb0, "snapshot" to schema_02cd82b5f5a0d2bb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9dd9855628dd71ae: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("chunkCount", "chunkIndex", "data", "fromCursor", "generation", "processState", "resumeServed", "terminalSize", "toCursor", "version", "watchId"), properties = mapOf("chunkCount" to schema_23e05d248383ea40, "chunkIndex" to schema_56aa0e45cbdce0d0, "data" to schema_bf0b727f7b1c6d07, "fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_df704162f3d15808, "processState" to schema_f156a9bc12c3639a, "resumeServed" to schema_feeb8bb50144d96d, "terminalSize" to schema_2d2a48957e54670a, "toCursor" to schema_56aa0e45cbdce0d0, "version" to schema_f8ba039a2f32fad1, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.baseline-chunk-utf16"))
}

internal val schema_9dee5b496693b179: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_cdc63841ca583c5b, schema_8ab3ef50febb54d1, schema_0fd7e0ac403d7916), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9e169df36e4e41f6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("key", "kind"), properties = mapOf("key" to schema_7df0b39f181cc45b, "kind" to schema_14221269d858a2f5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9e712b4f87e5beb0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("snapshot")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ea58f9bfc61ade7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("light"), JsonPrimitive("dark"), JsonPrimitive("system")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9eaa25e68d8e4cf4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type", "version", "watchId"), properties = mapOf("threadId" to schema_97d85a5eaee82b97, "type" to schema_9f6b436502c63c75, "version" to schema_7f9f5a0d72de0d9a, "watchId" to schema_8e43cad70cd70de7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ec272a8244847ff: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("key", "label"), properties = mapOf("key" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9edd0cfb1cd802d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("abbreviatedOid", "authoredDate", "messageHeadline", "oid"), properties = mapOf("abbreviatedOid" to schema_bf0b727f7b1c6d07, "author" to schema_a99c73e81a312991, "authoredDate" to schema_bf0b727f7b1c6d07, "messageBody" to schema_bf0b727f7b1c6d07, "messageHeadline" to schema_bf0b727f7b1c6d07, "oid" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9eed5c4959909cfe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("windows"), JsonPrimitive("wsl"), JsonPrimitive("posix")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f0df99b7a4b0249: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_1544bc59ff42b21c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f1edfda198d533d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("git-state-interests")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f20fb68ee791598: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("turn.started")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f6b436502c63c75: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent-vision-watch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f6e05a566c74be3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("heapUsedBytes", "rssBytes", "uptimeSeconds"), properties = mapOf("heapUsedBytes" to schema_56aa0e45cbdce0d0, "rssBytes" to schema_56aa0e45cbdce0d0, "uptimeSeconds" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9fe1fe9bbcff3ecd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("count", "key", "label", "percent"), properties = mapOf("count" to schema_80c415b6e27c6ebd, "key" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07, "percent" to schema_80c415b6e27c6ebd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ff1236d4782edc7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c04b1452d18edb3f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a014f9df96e82169: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("details"), properties = mapOf("details" to schema_7e778a19c741f3ed, "pr" to schema_22a062bffa4e84da), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a016251474d39e0d: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 64, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_a023928e20a71a47: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("warning")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a02c812507215fb8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("destinationScope", "mode", "sourcePath"), properties = mapOf("availability" to schema_9c8337f42f233534, "destinationScope" to schema_ac6ea0fc110d7efb, "mode" to schema_aa2d0958d3ec845a, "projectLocation" to schema_080f9cc154af9e27, "replace" to schema_f8b6dd8128e8bfe0, "sourcePath" to schema_36fea325bf1aca70, "sourceProjectLocation" to schema_080f9cc154af9e27, "sourceWslDistro" to schema_36fea325bf1aca70, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a03f50bc643a4820: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "message"), properties = mapOf("code" to schema_2fbfd962f52fe805, "fingerprint" to schema_d3359b6d5db5b90d, "keyType" to schema_a016251474d39e0d, "message" to schema_ac157d37d82304b4), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_a050e4e43216f73b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("cron")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a087b069daed224f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("destination", "kind", "serverId", "source"), properties = mapOf("destination" to schema_dc99757951407418, "kind" to schema_a77c8545896b4c52, "serverId" to schema_36fea325bf1aca70, "source" to schema_dc99757951407418), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a11ab76af3bce730: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("inertValues", "kind", "model", "owner", "version"), properties = mapOf("inertValues" to schema_3dd69184dc64b745, "kind" to schema_452e07a326fbbba7, "model" to schema_36fea325bf1aca70, "owner" to schema_a8eb5a0e025da439, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_a13200e46be7a2e6: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 255, pattern = "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_a16cb9740d19657e: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 8, items = schema_d6a8cd432c4887c3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a1f40266b6e1acfa: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("prepare-worktree")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a20681cb358b7044: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("project", "pullRequestKeys", "refreshedAt"), properties = mapOf("project" to schema_83470ce63973b6e2, "pullRequestKeys" to schema_0f732b9fceb2c6ac, "refreshedAt" to schema_bf0b727f7b1c6d07, "viewerLogin" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a26f77dd4ad13e5b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("targetPort"), properties = mapOf("targetPort" to schema_279eee1efa9da6c8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a2e6931179ca973c: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_55723acd91303073, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a36830c34a81f248: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_60fc988aefaed4f5), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_a399fbc7541223f3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_5ea95607826c2d23, schema_12ca2594dca47145, schema_43372628accc1dd8, schema_0e036ef4dad9c975, schema_849e43bfc063f1bb, schema_501221cdcb9cd48b, schema_1806ffb1da5fcacb), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a39dd0410456fe31: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("balance"), properties = mapOf("balance" to schema_80c415b6e27c6ebd, "currency" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07, "unlimited" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a44865d83be28e9f: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_36fea325bf1aca70, schema_80c415b6e27c6ebd), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a467b0ed1c0ea208: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "minute"), properties = mapOf("kind" to schema_6f5933af0336650b, "minute" to schema_53f3c1938556e280), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a56cd97e5b842063: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "initialSize", "projectLocation"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_77c646d1a00c89a5, "disabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "disabledBuiltInMcpTools" to schema_fdad254a8bac8914, "initialInstructions" to schema_36fea325bf1aca70, "initialSize" to schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "mcpServers" to schema_7f86e779ad379105, "mentionHandoff" to schema_d2dd3595e1b5e5dc, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_38d1a07d3b9b1c82, "providerSwitch" to schema_06461b14925bc6d2, "questionAnswer" to schema_4d59c815dfec80c4, "segments" to schema_4392338ffc80bed7, "sessionRef" to schema_25df6feb29c4a959, "threadId" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("thread.start.provider-switch"))
}

internal val schema_a581e67cd137ad59: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = 0.0, maximum = 100.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a59d7f7afd3350b1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label"), properties = mapOf("description" to schema_36fea325bf1aca70, "id" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "tooltipDescription" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a5af9fa380f11a11: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 2048, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a5b7c88e398574a5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a633f9a256d1d0c9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("reason", "seq", "type"), properties = mapOf("reason" to schema_36fea325bf1aca70, "seq" to schema_56aa0e45cbdce0d0, "space" to schema_22c1b4b934fdb197, "type" to schema_d9640543f6c97ed9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a66324f9a46c480b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("headers", "type", "url"), properties = mapOf("headers" to schema_c3ac2139868061bb, "type" to schema_3120d80990432c9a, "url" to schema_7ac95086b2ca282e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_a6940e107dbdb450: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fwt"), properties = mapOf("fwt" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a6ba34cd39bf30c5: RemoteSchema by lazy {
    RemoteSchema(type = "boolean", defaultValue = JsonPrimitive(true), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a6c274420d82c814: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 2, items = schema_97a2308a409b73af, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a6f98c7f485db267: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "worktreePaths"), properties = mapOf("detail" to schema_15cae388d0cdd5b6, "projectLocation" to schema_080f9cc154af9e27, "worktreePaths" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a76106fec07f8e2b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("read"), JsonPrimitive("appearance"), JsonPrimitive("textSize"), JsonPrimitive("orientation"), JsonPrimitive("reduceMotion"), JsonPrimitive("network"), JsonPrimitive("location"), JsonPrimitive("permission"), JsonPrimitive("openUrl"), JsonPrimitive("launchApp"), JsonPrimitive("powerOff")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a77c8545896b4c52: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("move")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a799b0e11ed8f6df: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("usage.spent")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8565e7811b17010: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("h264")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8b4490d4a4f6745: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("owned"), JsonPrimitive("removed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8dfb6388d9edb75: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("pulled", "pushed"), properties = mapOf("pulled" to schema_feeb8bb50144d96d, "pushed" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8eb5a0e025da439: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "presentationMode"), properties = mapOf("agentInstanceId" to schema_36fea325bf1aca70, "agentKind" to schema_36fea325bf1aca70, "presentationMode" to schema_6508684ba659826b), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_a8f9536c8e956810: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_2e2f445a742056c6, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a90fffdae1680bd2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("clientConnectionId", "desktopId", "version"), properties = mapOf("clientConnectionId" to schema_53996e5a27a5b0c4, "desktopId" to schema_c7e9848de3a346ed, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a9266ff57466f267: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("versions"), properties = mapOf("versions" to schema_5f5ea22d1d79751d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a93427ae1fb25d32: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "targetThreadId"), properties = mapOf("kind" to schema_54e79a700cdcdd03, "targetThreadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a93ba7bf23f9b121: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_c7bfc39efc965eed), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a99c73e81a312991: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("login"), properties = mapOf("avatarUrl" to schema_bf0b727f7b1c6d07, "login" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a9e065ca182491e5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-done")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aa2d0958d3ec845a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("copy"), JsonPrimitive("link")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aa35b4044d2b1d2c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("childTicket"), properties = mapOf("childTicket" to schema_7f27390751296eea), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aa5449703b29a615: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("never"), JsonPrimitive("running"), JsonPrimitive("waiting-for-approval"), JsonPrimitive("succeeded"), JsonPrimitive("failed"), JsonPrimitive("cancelled"), JsonPrimitive("interrupted"), JsonPrimitive("skipped")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aac2a4e83d2823be: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aaf42afe3bc86594: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("env_var")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aafcd63530265fa8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "record", "revision"), properties = mapOf("kind" to schema_442f4438e0362260, "record" to schema_1be5ac91cc4357cb, "revision" to schema_36fea325bf1aca70, "rows" to schema_a16cb9740d19657e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab08aad343958c81: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "fromCursor", "generation", "processState", "status", "terminalSize", "toCursor"), properties = mapOf("data" to schema_bf0b727f7b1c6d07, "fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_df704162f3d15808, "processState" to schema_f156a9bc12c3639a, "status" to schema_0200f968d21b338b, "terminalSize" to schema_2d2a48957e54670a, "toCursor" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.ready-range-utf16"))
}

internal val schema_ab5271048956dc05: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.completed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab6b873225f5c96a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-mirror-status")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab9af0b233ebeb7d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("device", "inputAdmission", "proxyHelpers", "streamSettings", "url"), properties = mapOf("device" to schema_97d85a5eaee82b97, "inputAdmission" to schema_d2dd3595e1b5e5dc, "proxyHelpers" to schema_d2dd3595e1b5e5dc, "streamSettings" to schema_e0e12d4798687ab0, "url" to schema_833ba85e740a223b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aba5d69bfdbd30c9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseModifiedAtMs", "content", "path", "projectLocation"), properties = mapOf("baseModifiedAtMs" to schema_f696f11685898ba7, "content" to schema_bf0b727f7b1c6d07, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_abcfe9be3ea6f135: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("initialDelaySeconds", "kind", "maxAttempts", "maxDelaySeconds"), properties = mapOf("initialDelaySeconds" to schema_e9f57f9b4751d6e1, "kind" to schema_1dff9447e3354b05, "maxAttempts" to schema_f7164d030c9bbeaf, "maxDelaySeconds" to schema_e9f57f9b4751d6e1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_abff99d05c43ad4c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("enabled"), JsonPrimitive("disabled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ac157d37d82304b4: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 240, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_ac6ea0fc110d7efb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global"), JsonPrimitive("project")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ac7865b2a567eb07: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("days", "kind", "time"), properties = mapOf("days" to schema_f7b2db2c4c7fbdd3, "kind" to schema_475f91db7d51b153, "time" to schema_b61004d40d3caef8, "timeZone" to schema_be5d5f9829abefd6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aca97eda78815baa: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_b2a9cad3f0f3b617, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_acccf296d86b4026: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("experiments", "revision"), properties = mapOf("experiments" to schema_2f3c74eaed971b9f, "revision" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_acf85c3d3b25a389: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_01e21946e943d3eb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ad1d9fe8b3eda038: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_e2d96ee09e9d99a2, schema_d95fd60152159d7a, schema_591e7e71be40d4d4), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ad6bb2de51c0e05f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("amount", "currency"), properties = mapOf("amount" to schema_f696f11685898ba7, "currency" to schema_e22de6db69f83369), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_adaa80878b467841: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("effort"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_ae26bc52b712b00c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("7d"), JsonPrimitive("30d"), JsonPrimitive("all")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ae3b637db050db2a: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_1be1630ac362ee37, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ae4a7605815e4393: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("archivedAt", "changedFiles", "outcome", "severity", "stopReason", "summary", "unread"), properties = mapOf("archivedAt" to schema_595da89b21b7ca56, "changedFiles" to schema_3f02a5451ac550c4, "completionEvaluation" to schema_b2d5bb9fac49f2fc, "outcome" to schema_75fa28583d2c03c2, "severity" to schema_2d5efa5a796cb8bd, "stopReason" to schema_7bbdba78cb64cd5f, "summary" to schema_74b3a4e21747a253, "unread" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ae682752b1c14d17: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("forge"), JsonPrimitive("host")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_af6b6f72d4304b97: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-unwatch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_af80d040598805ef: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1e25c599a64f5b9d, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_af9e7187ee39d2c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "path", "providerId"), properties = mapOf("message" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "providerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_afbf6761fa459396: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("existingProjectIds", "existingThreadIds"), properties = mapOf("existingProjectIds" to schema_515482d2104d1efa, "existingThreadIds" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b01e26e0438140cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId", "worktreePath"), properties = mapOf("kind" to schema_a1f40266b6e1acfa, "projectId" to schema_36fea325bf1aca70, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
