// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_2b4ffb830b606cf1: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_feeb8bb50144d96d, schema_bf0b727f7b1c6d07), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b7595c3da8bc0e9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "name", "parentPath"), properties = mapOf("kind" to schema_1f4518886240126e, "name" to schema_36fea325bf1aca70, "parentPath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b7b34c95b23bb0d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_3f5bcd72f92b6f9f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b8805d864582a03: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("projectIds" to schema_324df5fa323e1096, "threadIds" to schema_324df5fa323e1096), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c09020b157316f2: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9751de90fd8644d6, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c0b30d69cd8870d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_75aa7b06238db739, schema_41ffeb2050e1e71c, schema_8906d017ba691d6f, schema_9e169df36e4e41f6), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c0f74a209084782: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("admin" to schema_f8b6dd8128e8bfe0, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "method" to schema_72373308389f2027, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c10059100ccb9e8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("background_tasks.changed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c13d2fc1c3e2e03: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("disconnected"), JsonPrimitive("connecting"), JsonPrimitive("connected"), JsonPrimitive("error"), JsonPrimitive("credential-missing"), JsonPrimitive("owner-unverified"), JsonPrimitive("identity-changed"), JsonPrimitive("hostkey-mismatch"), JsonPrimitive("needs-repair"), JsonPrimitive("trust-required")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c4b8c74e6940159: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9ec272a8244847ff, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c6061a21fb7aee6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("durationMs", "endX", "endY", "frameId", "kind", "x", "y"), properties = mapOf("durationMs" to schema_c5c5a6d768bddd81, "endX" to schema_5d4b39004bf5c532, "endY" to schema_5d4b39004bf5c532, "frameId" to schema_d855999aed5e6438, "kind" to schema_0cdfc047b0a2e1bb, "x" to schema_5d4b39004bf5c532, "y" to schema_5d4b39004bf5c532), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_2c671d62fd5c98a8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("boolean")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c93150c89b253f9: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_247ec4acb49e6522, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2cfe911595ad978d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fromCursor", "generation", "toCursor", "version", "watchId"), properties = mapOf("fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_36fea325bf1aca70, "toCursor" to schema_56aa0e45cbdce0d0, "version" to schema_7f9f5a0d72de0d9a, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.output-range"))
}

internal val schema_2d0b6ec9f2b2decf: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_bf0b727f7b1c6d07, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d29c7255e1cf1b1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("project")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d2a48957e54670a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_55ee222c096690dc, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d52ff1140653b18: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth"), JsonPrimitive("bearer"), JsonPrimitive("other"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d5efa5a796cb8bd: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("info"), JsonPrimitive("warning"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d677fb04187d46b: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf("crossagents" to JsonPrimitive(true))), additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d8274eae552cc51: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("wsl")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d862d697d08c085: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pause"), JsonPrimitive("resume"), JsonPrimitive("clear")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e20b523bd887c4e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name"), properties = mapOf("color" to schema_5fbc9d1e0e62e0cb, "description" to schema_bf0b727f7b1c6d07, "name" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e2f445a742056c6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id"), properties = mapOf("id" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e4d2aaed030369e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "title"), properties = mapOf("kind" to schema_356ae1fc455ec4c8, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e59da965e611892: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id"), properties = mapOf("id" to schema_f355c9e66a3091a2), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e5ddb0a3afed2cb: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_2e68c47efd6e1f9c, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e68c47efd6e1f9c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("capabilities", "forge", "host", "remote", "repository"), properties = mapOf("account" to schema_c2bb40b82b330cd4, "capabilities" to schema_3ad15ffc16029f9a, "forge" to schema_eaed3cfbf46d5d81, "host" to schema_36fea325bf1aca70, "remote" to schema_36fea325bf1aca70, "repository" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e6d7dedeb6dc9a6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "createNew" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2eb2bd4b48793b85: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("0"), JsonPrimitive("1")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2ebee6ffa37983f2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "line", "path", "side"), properties = mapOf("body" to schema_1be16061d2974772, "line" to schema_23e05d248383ea40, "path" to schema_bd85a52dd25effae, "side" to schema_598c25a2e687258b, "startLine" to schema_23e05d248383ea40), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f0b42b84f3f48a0: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4dea101cb65656f3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f2654f61b052491: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "model"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "approvalPolicy" to schema_bf0b727f7b1c6d07, "approvalsReviewer" to schema_bf0b727f7b1c6d07, "browserMcp" to schema_feeb8bb50144d96d, "chromeMcp" to schema_feeb8bb50144d96d, "computerUse" to schema_feeb8bb50144d96d, "contextSize" to schema_bf0b727f7b1c6d07, "crew" to schema_46a8742e5750f74f, "crossagentMcp" to schema_feeb8bb50144d96d, "effort" to schema_bf0b727f7b1c6d07, "executionEnvironment" to schema_4cd2587996458d8d, "fast" to schema_feeb8bb50144d96d, "importedFrom" to schema_3471186f1398f1d2, "mcpServerOverrides" to schema_6db96506f253ef73, "mode" to schema_01e21946e943d3eb, "model" to schema_bf0b727f7b1c6d07, "pluginOverrides" to schema_6db96506f253ef73, "sandboxMode" to schema_bf0b727f7b1c6d07, "selectionBinding" to schema_a11ab76af3bce730, "thinking" to schema_feeb8bb50144d96d, "workflows" to schema_feeb8bb50144d96d, "worktreeMode" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f3c74eaed971b9f: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_1be5ac91cc4357cb, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f4c1755c2d3a402: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("posix", "windows", "wsl"), properties = mapOf("posix" to schema_4348fdb13264571d, "windows" to schema_4348fdb13264571d, "wsl" to schema_4348fdb13264571d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f9ed801b7a74652: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects", "runtimeSummariesByThread", "snapshotSeq", "threads", "updatedAt"), properties = mapOf("gitState" to schema_039d29a220abcf97, "gitSummariesByThread" to schema_aca97eda78815baa, "projects" to schema_61efa8909f32b55e, "projectsNextCursor" to schema_2d0b6ec9f2b2decf, "reads" to schema_4659e6d395f41e16, "runtimeSummariesByThread" to schema_fc9d6f4c2617a24d, "snapshotEpoch" to schema_8e43cad70cd70de7, "snapshotSeq" to schema_56aa0e45cbdce0d0, "threads" to schema_315e9038603a0581, "threadsNextCursor" to schema_2d0b6ec9f2b2decf, "updatedAt" to schema_36fea325bf1aca70, "workspaces" to schema_15fcce03de60030d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2fb9be13c54e7688: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("auth-required"), JsonPrimitive("timeout"), JsonPrimitive("command-not-found"), JsonPrimitive("connection-failed"), JsonPrimitive("protocol-error"), JsonPrimitive("invalid-config"), JsonPrimitive("probe-unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2fbfd962f52fe805: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("environment/not-found"), JsonPrimitive("environment/revision-conflict"), JsonPrimitive("environment/store-busy"), JsonPrimitive("environment/store-limit"), JsonPrimitive("environment/store-unavailable"), JsonPrimitive("environment/invalid-input"), JsonPrimitive("environment/not-connected"), JsonPrimitive("environment/trust-required"), JsonPrimitive("environment/trust-changed"), JsonPrimitive("environment/trust-mismatch"), JsonPrimitive("environment/hostkey-mismatch"), JsonPrimitive("environment/identity-changed"), JsonPrimitive("environment/credential-missing"), JsonPrimitive("environment/owner-unverified"), JsonPrimitive("environment/owner-unresponsive"), JsonPrimitive("environment/owner-incompatible"), JsonPrimitive("environment/owner-busy"), JsonPrimitive("environment/owner-conflict"), JsonPrimitive("environment/launch-failed"), JsonPrimitive("environment/upgrade-unavailable"), JsonPrimitive("environment/upgrade-refused"), JsonPrimitive("environment/transport-error"), JsonPrimitive("environment/cancelled"), JsonPrimitive("environment/internal-error"), JsonPrimitive("environment/not-authorized")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2fc59eb755b48806: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "rationale", "source", "threadId"), properties = mapOf("assessments" to schema_0dc750244bb89d0c, "comparisonMode" to schema_1124eb24dd0748ff, "createdAt" to schema_36fea325bf1aca70, "modelLabel" to schema_36fea325bf1aca70, "rationale" to schema_36fea325bf1aca70, "snapshotHash" to schema_36fea325bf1aca70, "source" to schema_d4e60a4c33cd4bbd, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_30057dd734d040ce: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 32, items = schema_7d62681c6488867d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3008927746cc013b: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_1b3dc298a6f3cf15, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_302783bd5327b877: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_f2bb61aa3bb8d258, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_304430ceb5560696: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d4a49a3cee60b0ec, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_30a537a9343bcdf7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("file_change")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_30b422e470a61b28: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "workflowId"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "ref" to schema_36fea325bf1aca70, "workflowId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_30cc89214bd9dffb: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 50000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_3120d80990432c9a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("sse")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_313744588ce712ec: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "id"), properties = mapOf("action" to schema_79cc8fd8772975d2, "id" to schema_d855999aed5e6438), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3155b0e8649e47af: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_cd124b21d98c4aa2, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_315e9038603a0581: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_b37f60804aab420f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3224b2661089874d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_e105701b122113cd, schema_c3a4dfd6503d3858, schema_f252df24b49da178), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_324df5fa323e1096: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 200, items = schema_85c1db78d5c7dc29, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3264c4f1e6231fa5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prompts", "truncated"), properties = mapOf("prompts" to schema_8103b4e6f4958c4c, "truncated" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32773ce5899289ad: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("authorized")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32a902996bba88be: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("devices", "generation", "platforms", "version"), properties = mapOf("devices" to schema_6c203f8f04d76313, "generation" to schema_d855999aed5e6438, "platforms" to schema_a6c274420d82c814, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32b2db2eaac8458c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("command"), JsonPrimitive("other")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32c3720f649f40a1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "model" to schema_bf0b727f7b1c6d07, "selectionBinding" to schema_a11ab76af3bce730, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_32e268a4ad7c1c3d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("forwardId"), properties = mapOf("forwardId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32e823c3d8c4b6d8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("import-session")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_33250cfe650a4571: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "name"), properties = mapOf("id" to schema_36fea325bf1aca70, "name" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3328521e00056564: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_0138c350a16e9103, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_338293a42e7115a2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("server"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "server" to schema_c04b1452d18edb3f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_339dd50c84bc91c2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "app", "requestId", "threadId"), properties = mapOf("action" to schema_8c2d417de56bf72a, "app" to schema_b313ad72a5d78585, "requestId" to schema_d855999aed5e6438, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_33c56fa54b24233a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27, "rebase" to schema_f8b6dd8128e8bfe0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_340c8f8b68b6e2b5: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 50, items = schema_9bc1c08248602f5c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3466b9b69cc5e0cc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ok"), JsonPrimitive("auth-missing"), JsonPrimitive("app-not-running"), JsonPrimitive("rate-limited"), JsonPrimitive("quota-hit"), JsonPrimitive("unsupported"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3471186f1398f1d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("importedAt", "path"), properties = mapOf("importedAt" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_348882537c48186f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "prNumber", "projectLocation"), properties = mapOf("body" to schema_36fea325bf1aca70, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3512bd687eb85e90: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("before"), JsonPrimitive("after")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_356ae1fc455ec4c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("rename")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_35962a43ae5cecce: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("completed"), JsonPrimitive("noop")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_35c107fafb96bccf: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("home"), JsonPrimitive("back"), JsonPrimitive("enter"), JsonPrimitive("backspace")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3615f9310cd4ee9d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_378174642bf763b3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_369773f70316d070: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("effort", "fast"), properties = mapOf("effort" to schema_b6a98d4e6efc4f4c, "fast" to schema_b6a98d4e6efc4f4c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36a14ea6cf3d0316: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("cacheRead" to schema_f696f11685898ba7, "cacheWrite" to schema_f696f11685898ba7, "input" to schema_f696f11685898ba7, "output" to schema_f696f11685898ba7, "period" to schema_776626d20373881d, "total" to schema_f696f11685898ba7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36b9fe91ec45bcd5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("select")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
