// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_7e386bfca48a8819: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("user"), JsonPrimitive("assistant"), JsonPrimitive("tool")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7eb7e8f44a304273: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("basePath" to schema_bf0b727f7b1c6d07, "mode" to schema_953c573b196de65a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f86e779ad379105: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_c04b1452d18edb3f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f9f5a0d72de0d9a: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(1.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7fdc1b397391e8f3: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0a5d0a388502828c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_80906c6ddc7c6c9e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("done", "kind"), properties = mapOf("done" to schema_feeb8bb50144d96d, "kind" to schema_a9e065ca182491e5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_80a9ff940d24dba8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_3328521e00056564, schema_51f2acb99ea96b5b, schema_483d5aa44fc0eaba, schema_875b3bd94059f8e1, schema_290453f28a433311, schema_82fdb789883e6159, schema_500ee3799383d21f, schema_22c8bcdab9edbc02), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_80ac3a097b3c79c7: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("breakdown" to schema_3008927746cc013b, "maxTokens" to schema_23e05d248383ea40, "usedTokens" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_80c415b6e27c6ebd: RemoteSchema by lazy {
    RemoteSchema(type = "number", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8103808258c2d166: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name"), properties = mapOf("label" to schema_2d0b6ec9f2b2decf, "name" to schema_36fea325bf1aca70, "optional" to schema_feeb8bb50144d96d, "secret" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_81055c9199569630: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_81440643a0f1796d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope", "serverId"), properties = mapOf("kind" to schema_61fc4b3eaedeba13, "scope" to schema_dc99757951407418, "serverId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_815909fa96d68d7b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "threadId"), properties = mapOf("itemId" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_820293e02a103abf: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("name" to schema_36fea325bf1aca70, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_82088d0ad1ba613a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("imported"), properties = mapOf("imported" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8277cc81c1103ae4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "model"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "approvalPolicy" to schema_bf0b727f7b1c6d07, "approvalsReviewer" to schema_bf0b727f7b1c6d07, "browserMcp" to schema_feeb8bb50144d96d, "chromeMcp" to schema_feeb8bb50144d96d, "computerUse" to schema_feeb8bb50144d96d, "contextSize" to schema_bf0b727f7b1c6d07, "crossagentMcp" to schema_feeb8bb50144d96d, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "mode" to schema_01e21946e943d3eb, "model" to schema_bf0b727f7b1c6d07, "sandboxMode" to schema_bf0b727f7b1c6d07, "thinking" to schema_feeb8bb50144d96d, "worktreeMode" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_828172bf1752b0f1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("marketplace"), properties = mapOf("marketplace" to schema_118f67a0fa6bb27d, "query" to schema_e5bbd3e940039349, "sort" to schema_1eaf563a1e9fa631), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_82e8027595898a28: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("conclusion", "id", "name", "status", "steps"), properties = mapOf("completedAt" to schema_bf0b727f7b1c6d07, "conclusion" to schema_bf0b727f7b1c6d07, "id" to schema_3d06117798bf5171, "name" to schema_bf0b727f7b1c6d07, "startedAt" to schema_bf0b727f7b1c6d07, "status" to schema_bf0b727f7b1c6d07, "steps" to schema_f1a8832c8ce43a2f, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_82fdb789883e6159: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId"), properties = mapOf("kind" to schema_6801e053c0220116, "tabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_833ef472e7760fae: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-starred")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8345d2f810cef034: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope", "server"), properties = mapOf("kind" to schema_375b3978f669c107, "scope" to schema_dc99757951407418, "server" to schema_c04b1452d18edb3f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_83470ce63973b6e2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hostId", "projectId"), properties = mapOf("hostId" to schema_bf0b727f7b1c6d07, "projectId" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_835d30ad470a686c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("posix")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_839da5c7aa9ba993: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("author", "body", "createdAt", "id"), properties = mapOf("author" to schema_a99c73e81a312991, "body" to schema_bf0b727f7b1c6d07, "createdAt" to schema_bf0b727f7b1c6d07, "id" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_83c7c01b4046dd13: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("command", "type"), properties = mapOf("args" to schema_aac2a4e83d2823be, "command" to schema_36fea325bf1aca70, "cwd" to schema_36fea325bf1aca70, "env" to schema_c3ac2139868061bb, "type" to schema_01f71c4e26e7ecde), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_849e43bfc063f1bb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("invocation", "kind", "name", "provider", "scope"), properties = mapOf("invocation" to schema_36fea325bf1aca70, "kind" to schema_2a65cef1bc5905f9, "name" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "pluginId" to schema_36fea325bf1aca70, "pluginName" to schema_36fea325bf1aca70, "provider" to schema_36fea325bf1aca70, "scope" to schema_ac6ea0fc110d7efb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_84c6a19f87f29012: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 8, items = schema_941a12a3ce0aadca, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_85d2dd31fd2f4872: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("state", "threadId", "turnId", "type"), properties = mapOf("state" to schema_115555b2d2065a65, "threadId" to schema_bf0b727f7b1c6d07, "turnId" to schema_bf0b727f7b1c6d07, "type" to schema_cdcee850f284e657), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_85fe4f2f372c1ac3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "archived", "attention", "canResumeWithConfig", "config", "createdAt", "done", "id", "projectId", "starred", "status", "title", "updatedAt"), properties = mapOf("activeTurnStartedAt" to schema_36fea325bf1aca70, "agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "archived" to schema_f8b6dd8128e8bfe0, "attention" to schema_58edfaf9f73b8db4, "canResumeWithConfig" to schema_f8b6dd8128e8bfe0, "config" to schema_03b0262a8a76c7b7, "createdAt" to schema_36fea325bf1aca70, "done" to schema_f8b6dd8128e8bfe0, "doneAt" to schema_36fea325bf1aca70, "errorMessage" to schema_bf0b727f7b1c6d07, "groupId" to schema_bf0b727f7b1c6d07, "groupName" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "lastTurnEndedAt" to schema_36fea325bf1aca70, "lastTurnStartedAt" to schema_36fea325bf1aca70, "parentThreadId" to schema_36fea325bf1aca70, "prNumber" to schema_80c415b6e27c6ebd, "presentationMode" to schema_6508684ba659826b, "projectId" to schema_36fea325bf1aca70, "remoteId" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70, "sessionRef" to schema_3b70e9f118e13840, "slashCommands" to schema_174f77d24d01fc57, "starred" to schema_f8b6dd8128e8bfe0, "status" to schema_8c61ed237d0ab3d0, "threadStatusSource" to schema_8f739487924008df, "title" to schema_36fea325bf1aca70, "updatedAt" to schema_36fea325bf1aca70, "worktreeBranch" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_86230e1fa3f38188: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("wsl-user")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_863be77948ff8e01: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "type"), properties = mapOf("cursorSync" to schema_f8dd0bcba7ca976a, "id" to schema_36fea325bf1aca70, "type" to schema_c64b38404fc9a1d4), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_868bf1042a1bbba1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_86b938ce61c1942e: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_d66267c393bb4ec4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_86d5d72e84423420: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_0f732b9fceb2c6ac, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_875b3bd94059f8e1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "position", "tabId", "targetTabId"), properties = mapOf("kind" to schema_ed1865d937c91a50, "position" to schema_3512bd687eb85e90, "tabId" to schema_36fea325bf1aca70, "targetTabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8793e380887b215f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("clone")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8795ea0289d608d6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("1")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_883b3b8a6153aa17: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("read-error"), JsonPrimitive("missing-file"), JsonPrimitive("too-large"), JsonPrimitive("missing-frontmatter"), JsonPrimitive("missing-name"), JsonPrimitive("invalid-name"), JsonPrimitive("name-mismatch"), JsonPrimitive("missing-description"), JsonPrimitive("description-too-long")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_88444d52d400622b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("relocate")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_88480e7409f5bc30: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal"), JsonPrimitive("server")), defaultValue = JsonPrimitive("terminal"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_89033d459dedce3c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("marketplace", "skills", "total"), properties = mapOf("marketplace" to schema_118f67a0fa6bb27d, "skills" to schema_2f0b42b84f3f48a0, "total" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8906d017ba691d6f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "text"), properties = mapOf("kind" to schema_19030914d1c4d410, "text" to schema_00876431431924e0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_891e9ab2413a4e77: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("modifiedAtMs", "path", "status"), properties = mapOf("content" to schema_bf0b727f7b1c6d07, "contentBase64" to schema_bf0b727f7b1c6d07, "hasBom" to schema_feeb8bb50144d96d, "lineEnding" to schema_6d6f1fde7308a250, "modifiedAtMs" to schema_f696f11685898ba7, "path" to schema_bf0b727f7b1c6d07, "status" to schema_620971ca171eff87), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_89a32138dca165c4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authorizationUrl", "flowId", "status"), properties = mapOf("authorizationUrl" to schema_36fea325bf1aca70, "flowId" to schema_36fea325bf1aca70, "status" to schema_bd96f28e94e5dff9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_89bc4017c2e23cd6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope", "serverId"), properties = mapOf("kind" to schema_034741cb26a53fe4, "scope" to schema_dc99757951407418, "serverId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8a0ca790b0047a5e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("definition"), properties = mapOf("definition" to schema_02179e6a4b6545d5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8a62b43ffe3b4668: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("skills"), properties = mapOf("skills" to schema_3cc2bb39a7445b48), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8ab3ef50febb54d1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "name", "type"), properties = mapOf("args" to schema_0f732b9fceb2c6ac, "description" to schema_2d0b6ec9f2b2decf, "env" to schema_e51d77fd6734b53a, "id" to schema_36fea325bf1aca70, "name" to schema_36fea325bf1aca70, "type" to schema_c4197e46f3baa871), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8ace86d01d0cc126: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environment", "error", "latencyMs", "status", "toolCount"), properties = mapOf("environment" to schema_6b3ef80f7d149206, "error" to schema_f145218b6dee66b6, "latencyMs" to schema_56aa0e45cbdce0d0, "status" to schema_e527c3ee29cd639b, "toolCount" to schema_499c88c1c549e934), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8ad62783c0fcd641: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_85fe4f2f372c1ac3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8be1194a627287d7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("autoMerge", "headBranch", "prNumber", "projectId", "watchEnabled"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "autoMerge" to schema_feeb8bb50144d96d, "config" to schema_048d1517dd77004e, "headBranch" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectId" to schema_36fea325bf1aca70, "watchEnabled" to schema_feeb8bb50144d96d, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("pr-watch.agent-required-when-enabled"))
}

internal val schema_8c61ed237d0ab3d0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("inactive"), JsonPrimitive("launching"), JsonPrimitive("working"), JsonPrimitive("idle"), JsonPrimitive("finished"), JsonPrimitive("needs_approval"), JsonPrimitive("needs_reply"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8c71be0e7fdf9e1a: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9137d8707520f367, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8d017de5d26dce37: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_13f43aaaf56911fa, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8d3732b59a0dd026: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("file"), JsonPrimitive("directory")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8dfe4ead4e3bdcdd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("credential", "grantType"), properties = mapOf("client" to schema_696917027581de46, "credential" to schema_36fea325bf1aca70, "grantType" to schema_962b214fbc91a2f5, "scopes" to schema_7978d152fa09ea8e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8e43cad70cd70de7: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 128, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8ebc98d914ab234d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "task"), properties = mapOf("kind" to schema_1f4518886240126e, "task" to schema_aa2e4a946a9060bf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8f483f0889171da1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session:read"), JsonPrimitive("session:operate"), JsonPrimitive("terminal:read"), JsonPrimitive("terminal:operate"), JsonPrimitive("requests:resolve"), JsonPrimitive("projects:manage"), JsonPrimitive("ports:forward")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8f58c1d1acd8bc3c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "metadata", "tabId", "type"), properties = mapOf("data" to schema_36fea325bf1aca70, "metadata" to schema_7d9e4e8a681070bb, "tabId" to schema_36fea325bf1aca70, "type" to schema_c2894654f12fb350), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8f72d273465cb93f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("event", "seq", "type"), properties = mapOf("event" to schema_ca3d163bab055381, "seq" to schema_23e05d248383ea40, "type" to schema_1aa020e871f1c07e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8f739487924008df: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("cli_hook"), JsonPrimitive("terminal_parse"), JsonPrimitive("server")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8f8e73cb353005a1: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 64, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8f934fd77b3e45dd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deviceId"), properties = mapOf("deviceId" to schema_36fea325bf1aca70, "routing" to schema_a90fffdae1680bd2), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9063020a6c5ad8b3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("navigate")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9137d8707520f367: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("displayName", "kind", "name", "runCount"), properties = mapOf("displayName" to schema_bf0b727f7b1c6d07, "kind" to schema_b096158c792e0431, "name" to schema_bf0b727f7b1c6d07, "runCount" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_91766049dfdea029: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("managed"), JsonPrimitive("external"), JsonPrimitive("built-in"), JsonPrimitive("plugin")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9189c3f251645aa9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.updated")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9199b6e9ea61b83e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("comments", "id", "isOutdated", "isResolved"), properties = mapOf("comments" to schema_971eac5c1ec68beb, "id" to schema_bf0b727f7b1c6d07, "isOutdated" to schema_feeb8bb50144d96d, "isResolved" to schema_feeb8bb50144d96d, "line" to schema_3d06117798bf5171, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_91a5d2d349991a6a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("cumulative"), JsonPrimitive("per-call")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_91e1df4b9542bd01: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("pullRequests"), properties = mapOf("pullRequests" to schema_55a090c12a60cd7e, "viewerLogin" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_920e2e5db293bc41: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fastForward", "merged"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "conflicting" to schema_feeb8bb50144d96d, "error" to schema_bf0b727f7b1c6d07, "fastForward" to schema_feeb8bb50144d96d, "merged" to schema_feeb8bb50144d96d, "needsStash" to schema_feeb8bb50144d96d, "reapplyConflicting" to schema_feeb8bb50144d96d, "stashCommit" to schema_bf0b727f7b1c6d07, "stashPreserved" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_922ae6d8b34c9e29: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeWorktreePaths", "projectLocation"), properties = mapOf("activeWorktreePaths" to schema_0f732b9fceb2c6ac, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9358a37bbc89d2ef: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("github"), JsonPrimitive("gitlab"), JsonPrimitive("bitbucket"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_936535b2f1c97eac: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "createdAt", "enabled", "id", "lastCompletedAt", "lastError", "lastResult", "lastRunAt", "lastStatus", "name", "nextRunAt", "prompt", "recurrence", "updatedAt"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "config" to schema_048d1517dd77004e, "createdAt" to schema_7ba6d49874a01b9e, "enabled" to schema_feeb8bb50144d96d, "id" to schema_d855999aed5e6438, "lastCompletedAt" to schema_01f7df3e67448982, "lastError" to schema_2d0b6ec9f2b2decf, "lastResult" to schema_2d0b6ec9f2b2decf, "lastRunAt" to schema_01f7df3e67448982, "lastStatus" to schema_aafa8395560c3ea5, "name" to schema_b89c357946c21293, "nextRunAt" to schema_01f7df3e67448982, "projectId" to schema_2d0b6ec9f2b2decf, "prompt" to schema_30cc89214bd9dffb, "recurrence" to schema_d8fa37f0ae821721, "updatedAt" to schema_7ba6d49874a01b9e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_938414fbfa27a773: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("capturedAt", "checkpointItemId", "commit", "ref", "threadId"), properties = mapOf("capturedAt" to schema_36fea325bf1aca70, "checkpointItemId" to schema_36fea325bf1aca70, "commit" to schema_36fea325bf1aca70, "ref" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_93bef3a552bf787e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadIds", "type"), properties = mapOf("threadIds" to schema_39d8d7cbf4384109, "type" to schema_25e47114d380c1fb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_93ea7778107ef974: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "done", "id", "text"), properties = mapOf("createdAt" to schema_36fea325bf1aca70, "done" to schema_feeb8bb50144d96d, "id" to schema_36fea325bf1aca70, "text" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_941a12a3ce0aadca: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_bf0b727f7b1c6d07, schema_3d06117798bf5171), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_949f0ec1c2b67829: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ready"), JsonPrimitive("binary"), JsonPrimitive("too_large"), JsonPrimitive("unsupported"), JsonPrimitive("missing")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_94eb65eacab30b70: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entries", "homePath", "parentPath", "path", "truncated"), properties = mapOf("entries" to schema_5da64eb8d698413e, "homePath" to schema_bf0b727f7b1c6d07, "parentPath" to schema_2d0b6ec9f2b2decf, "path" to schema_bf0b727f7b1c6d07, "truncated" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_953c573b196de65a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global"), JsonPrimitive("project-relative")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_95bca512ea5c155a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("attempt", "conclusion", "createdAt", "event", "headBranch", "headSha", "id", "jobs", "name", "number", "startedAt", "status", "title", "updatedAt", "url", "workflowId", "workflowName"), properties = mapOf("attempt" to schema_3d06117798bf5171, "conclusion" to schema_bf0b727f7b1c6d07, "createdAt" to schema_bf0b727f7b1c6d07, "event" to schema_bf0b727f7b1c6d07, "headBranch" to schema_bf0b727f7b1c6d07, "headSha" to schema_bf0b727f7b1c6d07, "id" to schema_3d06117798bf5171, "jobs" to schema_48de96c42130e156, "name" to schema_bf0b727f7b1c6d07, "number" to schema_3d06117798bf5171, "startedAt" to schema_bf0b727f7b1c6d07, "status" to schema_bf0b727f7b1c6d07, "title" to schema_bf0b727f7b1c6d07, "updatedAt" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07, "workflowId" to schema_3d06117798bf5171, "workflowName" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_95d0adeb5b1f4c44: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "id", "type"), properties = mapOf("cursorSync" to schema_2cfe911595ad978d, "data" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "type" to schema_d8b225d7de9ceec5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.output-data-utf16"))
}

internal val schema_962b214fbc91a2f5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pairing-token")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9633843f8b51827f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok"), properties = mapOf("ok" to schema_d2dd3595e1b5e5dc, "routing" to schema_fe73ac6ba621dd72), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_965bd4463b1b7307: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("run"), properties = mapOf("mtimeMs" to schema_f696f11685898ba7, "run" to schema_74659b54c1ae64b8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_96776c817a074e1f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread"), JsonPrimitive("agentSettings")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_96aaf279dc8f3856: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "projectLocation"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "effort" to schema_36fea325bf1aca70, "fast" to schema_feeb8bb50144d96d, "language" to schema_36fea325bf1aca70, "model" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_971eac5c1ec68beb: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_839da5c7aa9ba993, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_97d27c4efa52f52a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_fb3dd6021c9a98a4, schema_9c44204b656290c2), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_97dee2d4960c1271: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("approvalPolicy" to schema_bf0b727f7b1c6d07, "sandboxMode" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98139abfca5e2eda: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_c1d4a9f752e166b1, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98c9ef3e406d69bf: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deviceId", "platform"), properties = mapOf("activityTokens" to schema_b84e449d1a150abf, "alertPreferences" to schema_0534fb6201293569, "appVersion" to schema_36fea325bf1aca70, "deviceId" to schema_212ab189f2321de4, "deviceToken" to schema_36fea325bf1aca70, "platform" to schema_41d0cf68976485ec, "pushToStartToken" to schema_36fea325bf1aca70, "routing" to schema_a90fffdae1680bd2, "webAppBasePath" to schema_25a3e0b2a9eecdfb, "webPushSubscription" to schema_fd8574a70c8187db), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("push.registration.platform-fields"))
}

internal val schema_995ee3e349270afe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("remote-reachable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9980c767412d708b: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 20.0, maximum = 400.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_99d0ed7b003eaf52: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_5ea95607826c2d23, schema_12ca2594dca47145, schema_43372628accc1dd8, schema_0e036ef4dad9c975, schema_849e43bfc063f1bb, schema_501221cdcb9cd48b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9b83e18a93c4ec45: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type", "usage"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "type" to schema_a799b0e11ed8f6df, "usage" to schema_0fce2ade0199ca1d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ba1e93599d271dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("modifiedAtMs", "path", "status"), properties = mapOf("content" to schema_bf0b727f7b1c6d07, "contentBase64" to schema_bf0b727f7b1c6d07, "hasBom" to schema_feeb8bb50144d96d, "lineEnding" to schema_6d6f1fde7308a250, "modifiedAtMs" to schema_f696f11685898ba7, "path" to schema_bf0b727f7b1c6d07, "status" to schema_949f0ec1c2b67829), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9bb33af2f649fdd1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_4cb4c9750289b975, "name" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9bc1c08248602f5c: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 255, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9c01de6b080eca40: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("merge"), JsonPrimitive("squash"), JsonPrimitive("rebase")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9c44204b656290c2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("default", "description", "envVar", "key", "label", "options", "type"), properties = mapOf("default" to schema_bf0b727f7b1c6d07, "description" to schema_bf0b727f7b1c6d07, "envVar" to schema_36fea325bf1aca70, "key" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "options" to schema_d0b10c04efa78c87, "platforms" to schema_0f732b9fceb2c6ac, "type" to schema_36b9fe91ec45bcd5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9c8337f42f233534: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("shared"), JsonPrimitive("poracode")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9cb900aa2dda44d0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseCheckpointItemId", "checkpointItemId", "projectLocation", "threadId"), properties = mapOf("baseCheckpointItemId" to schema_36fea325bf1aca70, "checkpointItemId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9d263023fc1dd3de: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1c58197f2405018b, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9d9cbc9ed0e89822: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1c2823e73ee0c1dc, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9dee5b496693b179: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_cdc63841ca583c5b, schema_8ab3ef50febb54d1, schema_0fd7e0ac403d7916), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9e169df36e4e41f6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("key", "kind"), properties = mapOf("key" to schema_7df0b39f181cc45b, "kind" to schema_14221269d858a2f5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ec272a8244847ff: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("key", "label"), properties = mapOf("key" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9edd0cfb1cd802d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("abbreviatedOid", "authoredDate", "messageHeadline", "oid"), properties = mapOf("abbreviatedOid" to schema_bf0b727f7b1c6d07, "author" to schema_a99c73e81a312991, "authoredDate" to schema_bf0b727f7b1c6d07, "messageBody" to schema_bf0b727f7b1c6d07, "messageHeadline" to schema_bf0b727f7b1c6d07, "oid" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
