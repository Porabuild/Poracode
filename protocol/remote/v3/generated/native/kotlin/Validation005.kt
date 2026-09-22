// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_60fc988aefaed4f5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("start")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_61fc4b3eaedeba13: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth-clear")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_620971ca171eff87: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ready"), JsonPrimitive("binary"), JsonPrimitive("too_large"), JsonPrimitive("unsupported")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_62392c6d6ccb4368: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_bb42560f34ae61e9, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_626533cdf183bb99: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_62c3e7fb25ff5c30: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("dataChannel", "transport"), properties = mapOf("dataChannel" to schema_36fea325bf1aca70, "transport" to schema_9a8b3412f7d55317), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_632568cf23c893da: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("includeRemote" to schema_a6ba34cd39bf30c5, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_637f685cb2418b8c: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_9ff1236d4782edc7, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_63c18b52ffe65d8d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("additions", "deletions", "path"), properties = mapOf("additions" to schema_3d06117798bf5171, "deletions" to schema_3d06117798bf5171, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_64570e224963bb89: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-input")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_645d18fd9a611f68: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("commit"), JsonPrimitive("pr"), JsonPrimitive("conflict")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_64900cfb16aa539e: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("cursor" to schema_36fea325bf1aca70, "limit" to schema_85b777c0c99bbbca, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "mode" to schema_902ee7904a410968, "order" to schema_42146530bc4d74c4, "reads" to schema_4659e6d395f41e16, "summaries" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_64dd00a3a569fc23: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("worktreeLocation"), properties = mapOf("reapplyStashCommit" to schema_bb2e0e6d90c93ccf, "worktreeLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_64e71691dcceabd9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "untrackedPaths" to schema_aac2a4e83d2823be), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6508684ba659826b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal"), JsonPrimitive("gui")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_65899fb957cb9421: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_13f43aaaf56911fa, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_65e6698fa7640db4: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_38b68e422d630291, "terminal" to schema_38b68e422d630291), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66021940878f3abc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope", "serverId"), properties = mapOf("kind" to schema_3d1908a6bccf4864, "scope" to schema_dc99757951407418, "serverId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6602e9e9c3006d18: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("commit", "current", "isRemote", "name"), properties = mapOf("commit" to schema_bf0b727f7b1c6d07, "current" to schema_feeb8bb50144d96d, "isRemote" to schema_feeb8bb50144d96d, "name" to schema_bf0b727f7b1c6d07, "remote" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66846085f373f57f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type"), properties = mapOf("reason" to schema_bf0b727f7b1c6d07, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_000753aa3ed87d21), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66d66ce0fd3d9001: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6710dbe90a1ebf9d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "projectLocation", "prompt"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "effort" to schema_36fea325bf1aca70, "fast" to schema_feeb8bb50144d96d, "language" to schema_36fea325bf1aca70, "model" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_67373e16013c20e7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedRevision", "fingerprint"), properties = mapOf("expectedRevision" to schema_f58a8b771657d037, "fingerprint" to schema_d3359b6d5db5b90d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_678d084ee287670a: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_2363c4dd0a78ce9d, "terminal" to schema_2363c4dd0a78ce9d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6801e053c0220116: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("back")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_685dee710cb094fd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("args", "binary"), properties = mapOf("args" to schema_0f732b9fceb2c6ac, "binary" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6900ba2bd97d76fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "sourceBranchOverride" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_694e88722e472029: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_cd357f47aa772b6a, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_696917027581de46: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("deviceType" to schema_28ab5341451545c8, "label" to schema_36fea325bf1aca70, "os" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_69af29ff385f1e03: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "workspaceId"), properties = mapOf("kind" to schema_96cd458fa9bae303, "workspaceId" to schema_df704162f3d15808), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a0abedb39fd6f31: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("delete-worktree-group")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a0c18e639dbb000: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("path" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a2600edfb55d776: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("user")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a2d40d38c4527c7: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_47fd370c6dedf4fa, schema_89a32138dca165c4, schema_43639d56ca3f1150), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a323d2278041c5a: RemoteSchema by lazy {
    RemoteSchema(defaultValue = JsonNull, unionKind = "anyOf", options = listOf(schema_f434bf2c3d6e7372, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a8ee4e736a740c4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("branch" to schema_bf0b727f7b1c6d07, "copyIgnoredPatterns" to schema_0f732b9fceb2c6ac, "createBranch" to schema_f8b6dd8128e8bfe0, "keepChangesInSource" to schema_f8b6dd8128e8bfe0, "ownerToken" to schema_8e43cad70cd70de7, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "sourceBranch" to schema_9bc1c08248602f5c, "startPoint" to schema_bf0b727f7b1c6d07, "transferUncommitted" to schema_f8b6dd8128e8bfe0, "worktreeOmitRepoDir" to schema_feeb8bb50144d96d, "worktreeRoot" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("git.add-worktree.frozen-source"))
}

internal val schema_6b3ef80f7d149206: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectScoped", "runtime"), properties = mapOf("projectScoped" to schema_feeb8bb50144d96d, "runtime" to schema_1f6ff7bae56a790b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6b97469fe43177d6: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_6602e9e9c3006d18, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6b98eaede59b512a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("project-pull-requests")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6bb6e13415c8cbba: RemoteSchema by lazy {
    RemoteSchema(type = "string", format = "uri", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6c24d6b835735b69: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 2, maxItems = 8, items = schema_fc49e8b0b6ac2911, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6c6fca70506b8f43: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data"), properties = mapOf("data" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d1b9ceb7012b646: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_a59d7f7afd3350b1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d5eecaeceee62b9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runtime"), properties = mapOf("runtime" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d6f1fde7308a250: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("lf"), JsonPrimitive("crlf")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6da7b367355578d7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accessToken", "expiresAt", "scopes", "tokenType"), properties = mapOf("accessToken" to schema_36fea325bf1aca70, "expiresAt" to schema_36fea325bf1aca70, "refreshToken" to schema_36fea325bf1aca70, "refreshTokenExpiresAt" to schema_36fea325bf1aca70, "scopes" to schema_515482d2104d1efa, "tokenType" to schema_7c8fd050dd5e98a8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6da82c72b226f41d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("gap", "notice"), properties = mapOf("gap" to schema_f550638b8241897c, "notice" to schema_214ae58e6e08f2d4), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6db9f33ca9aa8b01: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_279eee1efa9da6c8, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6de1ff82938123c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("newContent", "oldContent"), properties = mapOf("newContent" to schema_bf0b727f7b1c6d07, "oldContent" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6df05d56a8273d4c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("off"), JsonPrimitive("fix"), JsonPrimitive("merge")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6df40201d8c95128: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_bc92ea89e2de4f6a, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6e4ad578250cef79: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ca3d163bab055381, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6ef72b13e31a5a70: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("settings-document-unreadable"), JsonPrimitive("settings-document-unparseable"), JsonPrimitive("settings-document-not-object"), JsonPrimitive("host-resource-admission-invalid")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6f5933af0336650b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("hourly")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6f5cce5ce127f97f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("observedFingerprint", "state"), properties = mapOf("observedFingerprint" to schema_d3359b6d5db5b90d, "state" to schema_f6c555fb5f1777c9), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_6fcb1a55c059e655: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("steer"), JsonPrimitive("queue")), defaultValue = JsonPrimitive("steer"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_700ee4302bb616f0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environments"), properties = mapOf("environments" to schema_e4ed0fc98f59d7f1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_701d7d6274e152f6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("reorder")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_70e5b904af7932c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("worktrees"), properties = mapOf("worktrees" to schema_cd357f47aa772b6a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_710b6ecb781e06cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("policy", "resolution", "usage"), properties = mapOf("gitProcesses" to schema_f80bf20556c43632, "policy" to schema_280719966e4ed3aa, "resolution" to schema_c0edab91e2f5d96e, "usage" to schema_1618be77eba1d732), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7162208437a209c2: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_2778fa8937ac1709, schema_66846085f373f57f, schema_4244283735615c22, schema_85d2dd31fd2f4872, schema_fe7522595f5637c3, schema_c55a346c739cb16c, schema_1371f7bedcffbc2e, schema_996ce1c4e0b82a8b, schema_cdd89e732d29ca0e, schema_9b83e18a93c4ec45, schema_0bffd4a90cd2aab1, schema_15179deb98a23815, schema_e01133268267ec38, schema_2a107f95a9dcf216, schema_e9d3d0a9b8562d03, schema_f7a8f7639015cad8), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72130deafac7a5ba: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("done", "error", "needsAttention"), properties = mapOf("done" to schema_feeb8bb50144d96d, "error" to schema_feeb8bb50144d96d, "needsAttention" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72373308389f2027: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("merge"), JsonPrimitive("squash"), JsonPrimitive("rebase")), defaultValue = JsonPrimitive("merge"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72429c4be55ff8fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_725be166aa92607b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hostId", "projectId"), properties = mapOf("hostId" to schema_bf0b727f7b1c6d07, "projectId" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72ce7899de7d8b9d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("enterPath"), properties = mapOf("enterPath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72e4a424a2d9ffca: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_0b430722c61d94d2, schema_9278450827e5f1b3, schema_e7cab2d2c052144f, schema_09f700fdeb3e5213), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7324613e41acced2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label"), properties = mapOf("argumentHint" to schema_bf0b727f7b1c6d07, "description" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "pluginId" to schema_36fea325bf1aca70, "pluginName" to schema_36fea325bf1aca70, "section" to schema_f4cab1817a71aa36, "skillInvocation" to schema_36fea325bf1aca70, "skillName" to schema_36fea325bf1aca70, "skillPath" to schema_36fea325bf1aca70, "skillProvider" to schema_36fea325bf1aca70, "skillScope" to schema_ac6ea0fc110d7efb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_73baee1e403b7ee4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "createdAt", "enabled", "id", "lastCompletedAt", "lastError", "lastResult", "lastRunAt", "lastStatus", "name", "nextRunAt", "prompt", "recurrence", "updatedAt"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "config" to schema_048d1517dd77004e, "createdAt" to schema_38adcf16c79023ce, "enabled" to schema_feeb8bb50144d96d, "id" to schema_d855999aed5e6438, "lastCompletedAt" to schema_595da89b21b7ca56, "lastError" to schema_2d0b6ec9f2b2decf, "lastResult" to schema_2d0b6ec9f2b2decf, "lastRunAt" to schema_595da89b21b7ca56, "lastStatus" to schema_aafa8395560c3ea5, "name" to schema_b89c357946c21293, "nextRunAt" to schema_595da89b21b7ca56, "projectId" to schema_2d0b6ec9f2b2decf, "prompt" to schema_30cc89214bd9dffb, "recurrence" to schema_370441a9f9465376, "updatedAt" to schema_38adcf16c79023ce), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_740c7dc82a88634a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-watch-baseline-ack")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_744f57e3eb025261: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_26f96950d20651b3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_745963f66484f8a1: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_c1d4a9f752e166b1, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_74659b54c1ae64b8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_f9da03570b6c69fa, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_74c691ec4ce7238a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "initialSize", "projectLocation"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "config" to schema_023567f0898d4d6d, "disabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "disabledBuiltInMcpTools" to schema_fdad254a8bac8914, "initialSize" to schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "mcpServers" to schema_7f86e779ad379105, "mentionHandoff" to schema_d2dd3595e1b5e5dc, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_38d1a07d3b9b1c82, "providerSwitch" to schema_06461b14925bc6d2, "segments" to schema_4392338ffc80bed7, "sessionRef" to schema_3b70e9f118e13840, "threadId" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("thread.start.provider-switch"))
}

internal val schema_757b67af108cc67a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("path" to schema_bd85a52dd25effae), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7583b8d37fafbf18: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("win32"), JsonPrimitive("darwin"), JsonPrimitive("linux")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_75aa7b06238db739: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "x", "y"), properties = mapOf("kind" to schema_ef917452dcccd356, "x" to schema_80c415b6e27c6ebd, "y" to schema_80c415b6e27c6ebd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_75b702ed8c9f54ac: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_294ca0c3f20bda2e, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7675a7cd6ae22dbd: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_d68bbd085678f807, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_76b2c94b29aad9b1: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_06735b175e7447d5, schema_f97770a7e3ba8e29), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_776626d20373881d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("today"), JsonPrimitive("7d"), JsonPrimitive("30d"), JsonPrimitive("cycle")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_77a7dec7edfc464f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("exact"), JsonPrimitive("suspect")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_78a16ea62277e780: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("preserveLocalChanges" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27, "remote" to schema_bfc0c020a52f85b3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_78c0e367e5120eb3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_feeb8bb50144d96d, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_79608b5eceb792fe: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_13f43aaaf56911fa, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7978d152fa09ea8e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8f483f0889171da1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_79fd49e14d0e7e17: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("open"), JsonPrimitive("draft"), JsonPrimitive("merged"), JsonPrimitive("closed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7a00457b3e3294c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("flowId", "kind", "scope"), properties = mapOf("flowId" to schema_36fea325bf1aca70, "kind" to schema_04569d9eea76ae2b, "scope" to schema_dc99757951407418), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7a20e2f82d6f16d6: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ee6af1c3c62ad32f, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7a4831c3c01cfb91: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("canGoBack", "canGoForward", "loading", "tabId", "title", "url"), properties = mapOf("canGoBack" to schema_feeb8bb50144d96d, "canGoForward" to schema_feeb8bb50144d96d, "faviconUrl" to schema_bf0b727f7b1c6d07, "loading" to schema_feeb8bb50144d96d, "tabId" to schema_36fea325bf1aca70, "title" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7ac95086b2ca282e: RemoteSchema by lazy {
    RemoteSchema(type = "string", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_7b055156a726d1cc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "nextCursor"), properties = mapOf("items" to schema_d3749f0d30f56447, "nextCursor" to schema_60e901bdbc3f78cd, "reads" to schema_4659e6d395f41e16, "runtimeNotice" to schema_1468dfe9a2db9c9d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7b212bbb531a3d31: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("doc", "todos", "updatedAt"), properties = mapOf("doc" to schema_6e4ad578250cef79, "todos" to schema_e7c244bd461f7229, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7b88ef93ea82dd5b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt"), properties = mapOf("config" to schema_023567f0898d4d6d, "prompt" to schema_36fea325bf1aca70, "segments" to schema_4392338ffc80bed7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7c8fd050dd5e98a8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("Bearer")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7ce40fcb9f4c6111: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("available")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7d62681c6488867d: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 64, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7d9e4e8a681070bb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deviceHeight", "deviceWidth", "offsetTop", "pageScaleFactor", "scrollOffsetX", "scrollOffsetY"), properties = mapOf("deviceHeight" to schema_80c415b6e27c6ebd, "deviceWidth" to schema_80c415b6e27c6ebd, "offsetTop" to schema_80c415b6e27c6ebd, "pageScaleFactor" to schema_80c415b6e27c6ebd, "scrollOffsetX" to schema_80c415b6e27c6ebd, "scrollOffsetY" to schema_80c415b6e27c6ebd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7db74ec55cf0af32: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("attachment")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7df0b39f181cc45b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("enter"), JsonPrimitive("backspace"), JsonPrimitive("tab"), JsonPrimitive("escape"), JsonPrimitive("arrow-up"), JsonPrimitive("arrow-down"), JsonPrimitive("arrow-left"), JsonPrimitive("arrow-right")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7e2ac4b6482d3bf6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("includeGhCheck" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7e386bfca48a8819: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("user"), JsonPrimitive("assistant"), JsonPrimitive("tool")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7e3e58fba723ce2c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("watch"), properties = mapOf("watch" to schema_4e69a9e2508b7f12), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7e8114c3dda52277: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session-5h"), JsonPrimitive("daily"), JsonPrimitive("weekly"), JsonPrimitive("weekly-opus"), JsonPrimitive("weekly-sonnet"), JsonPrimitive("weekly-fable"), JsonPrimitive("monthly"), JsonPrimitive("extra-usage"), JsonPrimitive("cursor-auto"), JsonPrimitive("cursor-api")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7e8fc11537a79bb6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("updatedAt", "windows", "wsl"), properties = mapOf("updatedAt" to schema_36fea325bf1aca70, "windows" to schema_d8d587b6ae054cb6, "wsl" to schema_d8d587b6ae054cb6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7e9898b3aed3af7f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("history"), properties = mapOf("history" to schema_dce2bd45b66af8a9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7eb7e8f44a304273: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("basePath" to schema_bf0b727f7b1c6d07, "mode" to schema_953c573b196de65a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7ee0d4255fd8c330: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f6bd58bd8881ec0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 100000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f86e779ad379105: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_c04b1452d18edb3f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f9f5a0d72de0d9a: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(1.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
