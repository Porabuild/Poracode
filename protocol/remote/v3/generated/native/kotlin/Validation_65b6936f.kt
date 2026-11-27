// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_62c3e7fb25ff5c30: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("dataChannel", "transport"), properties = mapOf("dataChannel" to schema_36fea325bf1aca70, "transport" to schema_9a8b3412f7d55317), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_632568cf23c893da: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("includeRemote" to schema_a6ba34cd39bf30c5, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6350bebbf3d13115: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 24, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_636da2bdcbf5818d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_6db96506f253ef73, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_637f685cb2418b8c: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_9ff1236d4782edc7, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_63a5f0fcbab4a3a8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "selection"), properties = mapOf("brief" to schema_ba7dfbe6c754d186, "fallbacks" to schema_60a3d8687bc0025b, "id" to schema_020cad6f356d7c67, "label" to schema_6350bebbf3d13115, "noEdits" to schema_d2dd3595e1b5e5dc, "parallel" to schema_6fb5e1ff4ba2dc63, "selection" to schema_c33d76cdf9c7d5d7), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_63c18b52ffe65d8d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("additions", "deletions", "path"), properties = mapOf("additions" to schema_3d06117798bf5171, "deletions" to schema_3d06117798bf5171, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_63ccc3fa64031cff: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("not_chat"), JsonPrimitive("busy"), JsonPrimitive("no_history"), JsonPrimitive("unsupported_location")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_63cf2bb53100cbd8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("header", "question", "selected"), properties = mapOf("customAnswer" to schema_bf0b727f7b1c6d07, "header" to schema_bf0b727f7b1c6d07, "question" to schema_bf0b727f7b1c6d07, "selected" to schema_0cd9513af81aeee1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6422ecf430b9e0a8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("revision", "unchanged"), properties = mapOf("revision" to schema_2d20bc896a08a92b, "unchanged" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_649f2dd010d75dad: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_862e6a81a05c9f92, "projectId" to schema_36fea325bf1aca70), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_6554493bfa61b085: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "agentKind", "create", "env", "provider", "revision"), properties = mapOf("action" to schema_a2bcbae622b18cea, "agentKind" to schema_8e43cad70cd70de7, "apiKey" to schema_d48d13740c8803d4, "create" to schema_feeb8bb50144d96d, "env" to schema_2583fd799237ae71, "provider" to schema_9b6b648329c17d0e, "revision" to schema_8e43cad70cd70de7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_65899fb957cb9421: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_13f43aaaf56911fa, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_65955df8384777ba: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "projectLocation", "prompt"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "language" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_36fea325bf1aca70, "selection" to schema_32c3720f649f40a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_65b6b00dc35d2b27: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "kind", "threadIds"), properties = mapOf("action" to schema_e9d06fff5d247f24, "kind" to schema_70ab564010eb05b0, "removeOwnedWorktrees" to schema_feeb8bb50144d96d, "threadIds" to schema_0c6254245418ba4c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_65e6698fa7640db4: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_38b68e422d630291, "terminal" to schema_38b68e422d630291), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_65ec808e7a55f981: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("providers"), properties = mapOf("providers" to schema_7fdc1b397391e8f3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66021940878f3abc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope", "serverId"), properties = mapOf("kind" to schema_3d1908a6bccf4864, "scope" to schema_dc99757951407418, "serverId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6602e9e9c3006d18: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("commit", "current", "isRemote", "name"), properties = mapOf("commit" to schema_bf0b727f7b1c6d07, "current" to schema_feeb8bb50144d96d, "isRemote" to schema_feeb8bb50144d96d, "name" to schema_bf0b727f7b1c6d07, "remote" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6639dee694efeebe: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 32, items = schema_bd72dfdbe3300bed, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66504fdb436f3b0e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_5465dd986b32b774, "path" to schema_bd85a52dd25effae, "remoteServerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_665acf486e1a0586: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ref", "refreshedAt"), properties = mapOf("branches" to schema_cbe0ba241100dba5, "ghAvailable" to schema_feeb8bb50144d96d, "ref" to schema_83470ce63973b6e2, "refreshedAt" to schema_bf0b727f7b1c6d07, "status" to schema_c1d4a9f752e166b1, "worktrees" to schema_cd357f47aa772b6a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66846085f373f57f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type"), properties = mapOf("reason" to schema_bf0b727f7b1c6d07, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_000753aa3ed87d21), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66c1d4f45e673970: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 12, items = schema_ed6b68dea9d34806, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66d66ce0fd3d9001: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66e7754fba8eca93: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("value"), JsonPrimitive("json"), JsonPrimitive("text-list"), JsonPrimitive("terminal")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66ee2eb4eda62117: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ae4a7605815e4393, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_682526ffe765f76a: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 64, pattern = "^[a-z0-9][a-z0-9_\\-:.]*\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_682961f5d2dbd9ba: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 5592408, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_684d2eec4cf8a72b: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 4, maxLength = 262144, pattern = "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_69711423c3b7d2a6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("abort")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_69af29ff385f1e03: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "workspaceId"), properties = mapOf("kind" to schema_96cd458fa9bae303, "workspaceId" to schema_df704162f3d15808), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_69ff9fac2802eff8: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_5a704f7ccb489059, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a0abedb39fd6f31: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("delete-worktree-group")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
