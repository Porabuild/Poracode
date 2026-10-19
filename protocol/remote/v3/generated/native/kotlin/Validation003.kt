// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_2b430316258b9c31: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "nextCursor"), properties = mapOf("historyProjection" to schema_72a4409660da2b12, "items" to schema_5d3ac76d9a521e1d, "nextCursor" to schema_60e901bdbc3f78cd, "reads" to schema_4659e6d395f41e16, "runtimeNotice" to schema_1468dfe9a2db9c9d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

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

internal val schema_2c10059100ccb9e8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("background_tasks.changed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c13d2fc1c3e2e03: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("disconnected"), JsonPrimitive("connecting"), JsonPrimitive("connected"), JsonPrimitive("error"), JsonPrimitive("credential-missing"), JsonPrimitive("owner-unverified"), JsonPrimitive("identity-changed"), JsonPrimitive("hostkey-mismatch"), JsonPrimitive("needs-repair"), JsonPrimitive("trust-required")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c4b8c74e6940159: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9ec272a8244847ff, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c671d62fd5c98a8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("boolean")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c93150c89b253f9: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_247ec4acb49e6522, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c97b9d429a794cb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model"), properties = mapOf("approvalPolicy" to schema_bf0b727f7b1c6d07, "approvalsReviewer" to schema_bf0b727f7b1c6d07, "browserMcp" to schema_feeb8bb50144d96d, "chromeMcp" to schema_feeb8bb50144d96d, "computerUse" to schema_feeb8bb50144d96d, "contextSize" to schema_bf0b727f7b1c6d07, "crossagentMcp" to schema_feeb8bb50144d96d, "effort" to schema_bf0b727f7b1c6d07, "executionEnvironment" to schema_4cd2587996458d8d, "fast" to schema_feeb8bb50144d96d, "importedFrom" to schema_3471186f1398f1d2, "mode" to schema_01e21946e943d3eb, "model" to schema_36fea325bf1aca70, "sandboxMode" to schema_bf0b727f7b1c6d07, "selectionBinding" to schema_a11ab76af3bce730, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2cb7b58fd1c2e6ed: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("comments", "threads"), properties = mapOf("comments" to schema_971eac5c1ec68beb, "threads" to schema_5de54f0b1df69cc9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_2dfd7e74f3cca541: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("watch"), properties = mapOf("watch" to schema_2407db87eb6a3613), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_2e6d7dedeb6dc9a6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "createNew" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f0b42b84f3f48a0: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4dea101cb65656f3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f3c74eaed971b9f: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_1be5ac91cc4357cb, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f4c1755c2d3a402: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("posix", "windows", "wsl"), properties = mapOf("posix" to schema_4348fdb13264571d, "windows" to schema_4348fdb13264571d, "wsl" to schema_4348fdb13264571d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f799c370f35b4b9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt", "threadId"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_2c97b9d429a794cb, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_3008927746cc013b: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_1b3dc298a6f3cf15, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_302783bd5327b877: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_f2bb61aa3bb8d258, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_304430ceb5560696: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d4a49a3cee60b0ec, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_3155b0e8649e47af: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_cd124b21d98c4aa2, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3213f68cbec8daf5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "kind", "projectId", "prompt"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_2c97b9d429a794cb, "focus" to schema_feeb8bb50144d96d, "groupId" to schema_36fea325bf1aca70, "groupName" to schema_36fea325bf1aca70, "initialSize" to schema_55ee222c096690dc, "isNewWorktree" to schema_feeb8bb50144d96d, "kind" to schema_60fc988aefaed4f5, "launchRuntime" to schema_feeb8bb50144d96d, "parentThreadId" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "presentationMode" to schema_6508684ba659826b, "projectId" to schema_36fea325bf1aca70, "prompt" to schema_bf0b727f7b1c6d07, "providerSwitch" to schema_06461b14925bc6d2, "segments" to schema_4392338ffc80bed7, "title" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70, "workspaceId" to schema_36fea325bf1aca70, "worktreeBranch" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3224b2661089874d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_e105701b122113cd, schema_c3a4dfd6503d3858, schema_f252df24b49da178), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_324df5fa323e1096: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 200, items = schema_85c1db78d5c7dc29, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32773ce5899289ad: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("authorized")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_330389cc815cf211: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "initialSize", "projectLocation"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_2c97b9d429a794cb, "disabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "disabledBuiltInMcpTools" to schema_fdad254a8bac8914, "initialSize" to schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "mcpServers" to schema_7f86e779ad379105, "mentionHandoff" to schema_d2dd3595e1b5e5dc, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_38d1a07d3b9b1c82, "providerSwitch" to schema_06461b14925bc6d2, "questionAnswer" to schema_a22ff042f4e542fc, "segments" to schema_4392338ffc80bed7, "sessionRef" to schema_25df6feb29c4a959, "threadId" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("thread.start.provider-switch"))
}

internal val schema_3328521e00056564: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_0138c350a16e9103, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_338293a42e7115a2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("server"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "server" to schema_c04b1452d18edb3f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3466b9b69cc5e0cc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ok"), JsonPrimitive("auth-missing"), JsonPrimitive("app-not-running"), JsonPrimitive("rate-limited"), JsonPrimitive("quota-hit"), JsonPrimitive("unsupported"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3471186f1398f1d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("importedAt", "path"), properties = mapOf("importedAt" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3512bd687eb85e90: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("before"), JsonPrimitive("after")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_356ae1fc455ec4c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("rename")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_35889b09eb72e208: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branches", "ghAvailable", "status", "worktrees"), properties = mapOf("branches" to schema_d715cb198ae66d56, "ghAvailable" to schema_78c0e367e5120eb3, "status" to schema_98139abfca5e2eda, "worktrees" to schema_694e88722e472029), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_35962a43ae5cecce: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("completed"), JsonPrimitive("noop")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_36d27df213d025a2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("details"), properties = mapOf("details" to schema_9f1da8cf549c341e, "pr" to schema_a4457c545e0e0489), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36ebafd43b47829a: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_b4441316f1aafac9, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36fea325bf1aca70: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_370ff0ec0af5649a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_4d5989d27d26b612), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_375b3978f669c107: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("upsert")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_378174642bf763b3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "path", "type"), properties = mapOf("name" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07, "type" to schema_8d3732b59a0dd026), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_37addcca5b32752c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("kind" to schema_034741cb26a53fe4, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_37eeca9f5377b6e4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope"), properties = mapOf("kind" to schema_274e069cdc933ee1, "scope" to schema_dc99757951407418), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38462ff398fbe205: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath", "enabled"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "enabled" to schema_feeb8bb50144d96d, "projectLocation" to schema_080f9cc154af9e27, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_384bb6ef598ad698: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 6.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38754692c8b5ebef: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("completedAt", "error", "id", "scheduleId", "startedAt", "status", "summary", "threadId"), properties = mapOf("attempt" to schema_23e05d248383ea40, "automationSnapshot" to schema_fdddba9ec6ce269e, "completedAt" to schema_595da89b21b7ca56, "error" to schema_2d0b6ec9f2b2decf, "id" to schema_d855999aed5e6438, "iteration" to schema_23e05d248383ea40, "result" to schema_66ee2eb4eda62117, "scheduleId" to schema_d855999aed5e6438, "scheduledFor" to schema_38adcf16c79023ce, "startedAt" to schema_38adcf16c79023ce, "status" to schema_2151c8edcffb30bf, "summary" to schema_2d0b6ec9f2b2decf, "threadId" to schema_36fea325bf1aca70, "trigger" to schema_56296b74a9501a6f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3897f50212cb0b25: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("event", "seq", "type"), properties = mapOf("event" to schema_ca3d163bab055381, "omittedRuntimeThreadIds" to schema_515482d2104d1efa, "seq" to schema_23e05d248383ea40, "space" to schema_22c1b4b934fdb197, "type" to schema_1aa020e871f1c07e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38adcf16c79023ce: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format = "date-time", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38b68e422d630291: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("none"), JsonPrimitive("launch"), JsonPrimitive("always")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38c5e1151393f6bd: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^antigravity:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38d1a07d3b9b1c82: RemoteSchema by lazy {
    RemoteSchema(type = "string", defaultValue = JsonPrimitive(""), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3975ceeb3762f594: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("version", "watchId"), properties = mapOf("maxChunkBytes" to schema_f58a8b771657d037, "maxWindowBytes" to schema_f58a8b771657d037, "resume" to schema_9997128f830ac42e, "version" to schema_23e05d248383ea40, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3994629a32a97c9b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("workflows"), properties = mapOf("workflows" to schema_030ab3973aced8b3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_399c72fc193f1510: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedRevision", "legacyConnectionId"), properties = mapOf("expectedRevision" to schema_f58a8b771657d037, "legacyConnectionId" to schema_d855999aed5e6438), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_39a57fc9a7427f91: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("autoMerge", "headBranch", "prNumber", "projectId", "watchEnabled"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "autoMerge" to schema_feeb8bb50144d96d, "config" to schema_f69100925fc0e774, "headBranch" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectId" to schema_36fea325bf1aca70, "watchEnabled" to schema_feeb8bb50144d96d, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("pr-watch.agent-required-when-enabled"))
}

internal val schema_39bc2baf33179ca7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("grantType"), properties = mapOf("client" to schema_696917027581de46, "credential" to schema_36fea325bf1aca70, "grantType" to schema_20b56c9f2266c25a, "refreshToken" to schema_36fea325bf1aca70, "scopes" to schema_7978d152fa09ea8e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39c209cff99afe61: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseBranch", "branch", "projectLocation", "title"), properties = mapOf("baseBranch" to schema_36fea325bf1aca70, "body" to schema_38d1a07d3b9b1c82, "branch" to schema_36fea325bf1aca70, "isDraft" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39d6579ca7450396: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("admin" to schema_f8b6dd8128e8bfe0, "method" to schema_72373308389f2027, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39d8d7cbf4384109: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 200, items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39f0b40d9df37da7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("filePath", "projectLocation"), properties = mapOf("filePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a008e3c404a93c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("cancelled"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a27703aead13583: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ownerToken"), properties = mapOf("ownerToken" to schema_2d0b6ec9f2b2decf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a38f5dc8038f065: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 2.0, maximum = 120.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ac3526f6a2607f3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_61fc4b3eaedeba13), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ad514880db80c82: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("text")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3b681a533b5fa621: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("notices"), properties = mapOf("notices" to schema_f67f6cbe63879b24), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3bac601a40e32bf3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "id", "location", "name"), properties = mapOf("createdAt" to schema_36fea325bf1aca70, "disabled" to schema_feeb8bb50144d96d, "ghAccount" to schema_5646cf57ff3aebe0, "icon" to schema_36fea325bf1aca70, "id" to schema_36fea325bf1aca70, "lastDraftConfig" to schema_05ae4f07092942c9, "location" to schema_080f9cc154af9e27, "name" to schema_36fea325bf1aca70, "remoteId" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70, "scripts" to schema_51d89a5cbbb635e7, "searchSettings" to schema_3ccadafaab48b090, "workspaceId" to schema_bf0b727f7b1c6d07, "worktreeLocation" to schema_7eb7e8f44a304273), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c115ff749c28304: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0d39188d7ce690df, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c40bff8b05543d7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_feeb8bb50144d96d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c594c99571d82f9: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^factory:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cc2bb39a7445b48: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_a02c812507215fb8, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ccadafaab48b090: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("exclude" to schema_cda18ebe4af54c5c, "useIgnoreFiles" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cd19b85f5490a72: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("url")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cdb2ff0de916278: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 512, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3d06117798bf5171: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = -9007199254740991.0, maximum = 9007199254740991.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3d188d85aa0799fe: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("kind" to schema_2d29c7255e1cf1b1, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3d1908a6bccf4864: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth-begin")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3dd69184dc64b745: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_adaa80878b467841, schema_d1624ea0ecc46dc6, schema_2840caeaedca16a2, schema_94dda13e1cf59dea), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3df0ab0b4ea7223c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("close-tab")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3df4f14bf23d248d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3df8195e9076bb2b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("method", "requestId", "response"), properties = mapOf("method" to schema_36fea325bf1aca70, "requestId" to schema_a44865d83be28e9f, "response" to schema_ca3d163bab055381), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e412d7b328b3f5a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_3ccadafaab48b090, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e6404f86586fcab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "usedPercent"), properties = mapOf("currency" to schema_bf0b727f7b1c6d07, "id" to schema_29b52750e42441f8, "label" to schema_bf0b727f7b1c6d07, "limit" to schema_f696f11685898ba7, "resetsAt" to schema_56aa0e45cbdce0d0, "unit" to schema_c263982707afed92, "used" to schema_f696f11685898ba7, "usedPercent" to schema_a581e67cd137ad59), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e68ba0d03654c68: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("forward")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
