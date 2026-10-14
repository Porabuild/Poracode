// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_85b777c0c99bbbca: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 200.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_85c1db78d5c7dc29: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 512, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_85cd2a40f756baae: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label"), properties = mapOf("id" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_85d2dd31fd2f4872: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("state", "threadId", "turnId", "type"), properties = mapOf("state" to schema_115555b2d2065a65, "threadId" to schema_bf0b727f7b1c6d07, "turnId" to schema_bf0b727f7b1c6d07, "type" to schema_cdcee850f284e657), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_86230e1fa3f38188: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("wsl-user")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_871fe12f7dc5ccf6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("answerSdp"), properties = mapOf("answerSdp" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_872da7633023da6d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("completedTurns", "completedTurnsNextCursor", "contextUsage", "reads", "runtimeItems", "snapshotSeq", "thread", "updatedAt"), properties = mapOf("backgroundTasks" to schema_17dfab19afcacd90, "completedTurns" to schema_4c20b501501c0ba4, "completedTurnsNextCursor" to schema_df704162f3d15808, "contextUsage" to schema_e47ad2358cf0df53, "followUpQueue" to schema_91dcfb42aac98166, "historyProjection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "runtimeItems" to schema_5d3ac76d9a521e1d, "runtimeNextCursor" to schema_60e901bdbc3f78cd, "runtimeNotice" to schema_1468dfe9a2db9c9d, "runtimeResumeCursor" to schema_36fea325bf1aca70, "runtimeStateCurrent" to schema_feeb8bb50144d96d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "terminalScrollback" to schema_bf0b727f7b1c6d07, "terminalSize" to schema_55ee222c096690dc, "thread" to schema_c84f860f0ebf373b, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_872dc7babad00cd3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_1709690cf0edf961, schema_2b7b34c95b23bb0d, schema_0e8f58f429bb1135, schema_d550ef9994fd388f, schema_838adcbcaff5f551, schema_5af10e67b405a136, schema_3f58316dbb160752, schema_d2299af726097d6c, schema_93bef3a552bf787e), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_8850f6c7f12f8eb8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_835d30ad470a686c, "path" to schema_bd85a52dd25effae, "remoteServerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_898097c5b37c9168: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("nextCursor", "runtimeSummariesByThread", "threads"), properties = mapOf("gitSummariesByThread" to schema_aca97eda78815baa, "inventoryFrontier" to schema_36fea325bf1aca70, "nextCursor" to schema_2d0b6ec9f2b2decf, "reads" to schema_4659e6d395f41e16, "runtimeSummariesByThread" to schema_fc9d6f4c2617a24d, "threads" to schema_8e7b49eef8ed965c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_89a32138dca165c4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authorizationUrl", "flowId", "status"), properties = mapOf("authorizationUrl" to schema_36fea325bf1aca70, "flowId" to schema_36fea325bf1aca70, "status" to schema_bd96f28e94e5dff9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_89bc4017c2e23cd6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope", "serverId"), properties = mapOf("kind" to schema_034741cb26a53fe4, "scope" to schema_dc99757951407418, "serverId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_89c223893a706cf8: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 1000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
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

internal val schema_8b1889f3513fe2b3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("command"), properties = mapOf("argumentSubcommands" to schema_515482d2104d1efa, "command" to schema_36fea325bf1aca70, "controlArguments" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8b52512d7a324001: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId", "worktreePaths"), properties = mapOf("projectId" to schema_36fea325bf1aca70, "worktreePaths" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8b72b09d5cbe1e7f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("distro", "kind", "linuxPath", "uncPath"), properties = mapOf("distro" to schema_36fea325bf1aca70, "kind" to schema_2d8274eae552cc51, "linuxPath" to schema_bd85a52dd25effae, "remoteServerId" to schema_36fea325bf1aca70, "uncPath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8be22931a515cd6d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_7ac92dcb7485437b, schema_455b16a806252fd5, schema_e7cab2d2c052144f, schema_09f700fdeb3e5213), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8c0ef7d6db14930e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects", "projectsNextCursor", "reads"), properties = mapOf("inventoryFrontier" to schema_36fea325bf1aca70, "projects" to schema_45dc1a0b166d686a, "projectsNextCursor" to schema_df704162f3d15808, "reads" to schema_4659e6d395f41e16), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8c20a3e2d150dfcf: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("tabId"), properties = mapOf("tabId" to schema_56aa0e45cbdce0d0, "title" to schema_f7ecfe1017b42566, "url" to schema_a5af9fa380f11a11), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8c61ed237d0ab3d0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("inactive"), JsonPrimitive("launching"), JsonPrimitive("working"), JsonPrimitive("idle"), JsonPrimitive("finished"), JsonPrimitive("needs_approval"), JsonPrimitive("needs_reply"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8c71be0e7fdf9e1a: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9137d8707520f367, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8cdebfa85eb53602: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("filter"), properties = mapOf("cursor" to schema_5e8c2bfac4c6fcc6, "filter" to schema_479fd2dce7e64e29, "limit" to schema_f9e7f90793023053, "search" to schema_e5bbd3e940039349), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8d017de5d26dce37: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_13f43aaaf56911fa, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8d15f7f900e19f14: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("anchor"), properties = mapOf("anchor" to schema_98ef330d70f2e681), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8d3732b59a0dd026: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("file"), JsonPrimitive("directory")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8d7cbafc0ecc27cb: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(14.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8dfc34ff217d09b7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("filesPhase", "numTurns", "outcome", "providerPhase", "removedCompletedTurnAnchors", "replayed", "truncatePhase"), properties = mapOf("filesPhase" to schema_efc124973b411d28, "numTurns" to schema_3d06117798bf5171, "outcome" to schema_08ce03e6077b28a9, "providerPhase" to schema_11ada4e73a793b0d, "removedCompletedTurnAnchors" to schema_0f732b9fceb2c6ac, "replayed" to schema_feeb8bb50144d96d, "truncatePhase" to schema_35962a43ae5cecce), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8e43cad70cd70de7: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 128, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8e7b49eef8ed965c: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c84f860f0ebf373b, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8e7b4d097aa71417: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("reorder-flat")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8f483f0889171da1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session:read"), JsonPrimitive("session:operate"), JsonPrimitive("terminal:read"), JsonPrimitive("terminal:operate"), JsonPrimitive("requests:resolve"), JsonPrimitive("projects:manage"), JsonPrimitive("ports:forward")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8f58c1d1acd8bc3c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "metadata", "tabId", "type"), properties = mapOf("data" to schema_36fea325bf1aca70, "metadata" to schema_7d9e4e8a681070bb, "tabId" to schema_36fea325bf1aca70, "type" to schema_c2894654f12fb350), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_8fa99a81fa4d20fb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "state", "streams", "type"), properties = mapOf("detailsDeferred" to schema_d2dd3595e1b5e5dc, "id" to schema_36fea325bf1aca70, "parentItemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "state" to schema_2472eab79ad4b307, "streams" to schema_e51d77fd6734b53a, "type" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_902ee7904a410968: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("page"), JsonPrimitive("inventory")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9063020a6c5ad8b3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("navigate")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_913674349845fda9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread-transcript"), JsonPrimitive("context-file")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_91b38b813d4e4091: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unsupported")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_91dcfb42aac98166: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_0174a8d738e73980, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_9368b22ce42bb60e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("preferred"), JsonPrimitive("powershell")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_938414fbfa27a773: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("capturedAt", "checkpointItemId", "commit", "ref", "threadId"), properties = mapOf("capturedAt" to schema_36fea325bf1aca70, "checkpointItemId" to schema_36fea325bf1aca70, "commit" to schema_36fea325bf1aca70, "ref" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_939b432562853e88: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedRevision"), properties = mapOf("expectedRevision" to schema_f58a8b771657d037), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_93bef3a552bf787e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadIds", "type"), properties = mapOf("threadIds" to schema_39d8d7cbf4384109, "type" to schema_25e47114d380c1fb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_93cbcfd8dc76a545: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("currentValue", "id", "type"), properties = mapOf("category" to schema_bf0b727f7b1c6d07, "currentValue" to schema_feeb8bb50144d96d, "id" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "role" to schema_09201de15f15ed50, "type" to schema_2c671d62fd5c98a8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_93ea7778107ef974: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "done", "id", "text"), properties = mapOf("createdAt" to schema_36fea325bf1aca70, "done" to schema_feeb8bb50144d96d, "id" to schema_36fea325bf1aca70, "text" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_93f8fa8787f246fe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-draft-config")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_941a12a3ce0aadca: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_bf0b727f7b1c6d07, schema_3d06117798bf5171), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_949f0ec1c2b67829: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ready"), JsonPrimitive("binary"), JsonPrimitive("too_large"), JsonPrimitive("unsupported"), JsonPrimitive("missing")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_94dda13e1cf59dea: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("contextSize"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_94e04fb40cc1be58: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "path"), properties = mapOf("branch" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_94eb65eacab30b70: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entries", "homePath", "parentPath", "path", "truncated"), properties = mapOf("entries" to schema_5da64eb8d698413e, "homePath" to schema_bf0b727f7b1c6d07, "parentPath" to schema_2d0b6ec9f2b2decf, "path" to schema_bf0b727f7b1c6d07, "truncated" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_953c573b196de65a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global"), JsonPrimitive("project-relative")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_956459f749459347: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("entryType" to schema_8d3732b59a0dd026, "limit" to schema_039b848cf1c1ad6c, "projectLocation" to schema_080f9cc154af9e27, "query" to schema_38d1a07d3b9b1c82, "searchConfig" to schema_cbf78da83a6846d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_95bca512ea5c155a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("attempt", "conclusion", "createdAt", "event", "headBranch", "headSha", "id", "jobs", "name", "number", "startedAt", "status", "title", "updatedAt", "url", "workflowId", "workflowName"), properties = mapOf("attempt" to schema_3d06117798bf5171, "conclusion" to schema_bf0b727f7b1c6d07, "createdAt" to schema_bf0b727f7b1c6d07, "event" to schema_bf0b727f7b1c6d07, "headBranch" to schema_bf0b727f7b1c6d07, "headSha" to schema_bf0b727f7b1c6d07, "id" to schema_3d06117798bf5171, "jobs" to schema_48de96c42130e156, "name" to schema_bf0b727f7b1c6d07, "number" to schema_3d06117798bf5171, "startedAt" to schema_bf0b727f7b1c6d07, "status" to schema_bf0b727f7b1c6d07, "title" to schema_bf0b727f7b1c6d07, "updatedAt" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07, "workflowId" to schema_3d06117798bf5171, "workflowName" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_95d0adeb5b1f4c44: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "id", "type"), properties = mapOf("cursorSync" to schema_2cfe911595ad978d, "data" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "type" to schema_d8b225d7de9ceec5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.output-data-utf16"))
}

internal val schema_95e237e57720296e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent-unavailable"), JsonPrimitive("worktree-unavailable"), JsonPrimitive("duplicate-project-watches")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_962b214fbc91a2f5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pairing-token")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9633843f8b51827f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok"), properties = mapOf("ok" to schema_d2dd3595e1b5e5dc, "routing" to schema_fe73ac6ba621dd72), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_963874114b1e0922: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "projectLocation", "sessionRef", "threadId"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "selection" to schema_32c3720f649f40a1, "sessionRef" to schema_25df6feb29c4a959, "threadId" to schema_36fea325bf1aca70, "worktreePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9645658cf3b0cbb3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_94e04fb40cc1be58, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_965bd4463b1b7307: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("run"), properties = mapOf("mtimeMs" to schema_f696f11685898ba7, "run" to schema_74659b54c1ae64b8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_96776c817a074e1f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread"), JsonPrimitive("agentSettings")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_96967a6998f6cab7: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 8, maxLength = 110, pattern = "^[A-Za-z0-9._:-]+$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_96cd458fa9bae303: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-workspace")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_971eac5c1ec68beb: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_839da5c7aa9ba993, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9780f521bc1dee38: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread-events"), JsonPrimitive("thread-bytes"), JsonPrimitive("global-events"), JsonPrimitive("global-bytes"), JsonPrimitive("oversize"), JsonPrimitive("age"), JsonPrimitive("degraded"), JsonPrimitive("rebase-dropped"), JsonPrimitive("shutdown"), JsonPrimitive("unclean-epoch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_97d27c4efa52f52a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_fb3dd6021c9a98a4, schema_9c44204b656290c2), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_97d85a5eaee82b97: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 256, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_98d52bd55e800515: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 16, items = schema_137445efd1582c7a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98ef330d70f2e681: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "version"), properties = mapOf("data" to schema_ca3d163bab055381, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9913d9e2d0d47448: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_2c97b9d429a794cb, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_995ee3e349270afe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("remote-reachable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_996ce1c4e0b82a8b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("delta", "itemId", "stream", "threadId", "type"), properties = mapOf("delta" to schema_bf0b727f7b1c6d07, "itemId" to schema_bf0b727f7b1c6d07, "replace" to schema_feeb8bb50144d96d, "stream" to schema_b5c1f44eaf04477b, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_f30731ffd8c57b5c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9980c767412d708b: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 20.0, maximum = 400.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9997128f830ac42e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursor", "generation"), properties = mapOf("cursor" to schema_56aa0e45cbdce0d0, "generation" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_99cf08bb5da33962: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeWebSocketClients", "eventBufferEntries", "lastEventSeq"), properties = mapOf("activeWebSocketClients" to schema_56aa0e45cbdce0d0, "eventBufferEntries" to schema_56aa0e45cbdce0d0, "lastEventSeq" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9a8b3412f7d55317: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("webrtc")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9b050dd4848ae8c2: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_304430ceb5560696, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9b83e18a93c4ec45: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type", "usage"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "type" to schema_a799b0e11ed8f6df, "usage" to schema_0fce2ade0199ca1d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ba1e93599d271dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("modifiedAtMs", "path", "status"), properties = mapOf("content" to schema_bf0b727f7b1c6d07, "contentBase64" to schema_bf0b727f7b1c6d07, "hasBom" to schema_feeb8bb50144d96d, "lineEnding" to schema_6d6f1fde7308a250, "modifiedAtMs" to schema_f696f11685898ba7, "path" to schema_bf0b727f7b1c6d07, "status" to schema_949f0ec1c2b67829), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9bc1c08248602f5c: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 255, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
