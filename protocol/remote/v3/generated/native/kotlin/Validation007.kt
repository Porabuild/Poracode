// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_626f8596f7256857: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id"), properties = mapOf("archived" to schema_feeb8bb50144d96d, "id" to schema_d855999aed5e6438, "unread" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("schedule.run-state"))
}

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

internal val schema_64570e224963bb89: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-input")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_645d18fd9a611f68: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("commit"), JsonPrimitive("pr"), JsonPrimitive("conflict")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_64900cfb16aa539e: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("cursor" to schema_36fea325bf1aca70, "limit" to schema_85b777c0c99bbbca, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "mode" to schema_902ee7904a410968, "order" to schema_42146530bc4d74c4, "reads" to schema_4659e6d395f41e16, "summaries" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_64ba4037c0af9670: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("delivered", "version"), properties = mapOf("controls" to schema_8971fe1e2b13c08e, "delivered" to schema_d2dd3595e1b5e5dc, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_65955df8384777ba: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "projectLocation", "prompt"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "language" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_36fea325bf1aca70, "selection" to schema_32c3720f649f40a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_66504fdb436f3b0e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_5465dd986b32b774, "path" to schema_bd85a52dd25effae, "remoteServerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_665acf486e1a0586: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ref", "refreshedAt"), properties = mapOf("branches" to schema_cbe0ba241100dba5, "ghAvailable" to schema_feeb8bb50144d96d, "ref" to schema_83470ce63973b6e2, "refreshedAt" to schema_bf0b727f7b1c6d07, "status" to schema_c1d4a9f752e166b1, "worktrees" to schema_cd357f47aa772b6a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66846085f373f57f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type"), properties = mapOf("reason" to schema_bf0b727f7b1c6d07, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_000753aa3ed87d21), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66d66ce0fd3d9001: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66ee2eb4eda62117: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ae4a7605815e4393, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_67373e16013c20e7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedRevision", "fingerprint"), properties = mapOf("expectedRevision" to schema_f58a8b771657d037, "fingerprint" to schema_d3359b6d5db5b90d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_677d43553d291527: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("completedTurnsLimit" to schema_be268483fb86810f, "deferBodies" to schema_30a537a9343bcdf7, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "notices" to schema_f67f6cbe63879b24, "omitScrollback" to schema_feeb8bb50144d96d, "projection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "runtimePage" to schema_8795ea0289d608d6, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_678d084ee287670a: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_2363c4dd0a78ce9d, "terminal" to schema_2363c4dd0a78ce9d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6801e053c0220116: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("back")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_682961f5d2dbd9ba: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 5592408, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_684d2eec4cf8a72b: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 4, maxLength = 262144, pattern = "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_69f5ba498bd960ff: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("item"), properties = mapOf("item" to schema_4c1171296b6868a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_6c203f8f04d76313: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 128, items = schema_4b43828b172de36c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6c24d6b835735b69: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 2, maxItems = 8, items = schema_fc49e8b0b6ac2911, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6c5abb4203cd5fd7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("files", "storage"), properties = mapOf("currentFiles" to schema_739ef5b32c1ac983, "diffHash" to schema_ec221fdc1494d0b1, "files" to schema_739ef5b32c1ac983, "storage" to schema_ae682752b1c14d17), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6c6fca70506b8f43: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data"), properties = mapOf("data" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6cb914aa8661083a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("archive", "cmd"), properties = mapOf("archive" to schema_6bb6e13415c8cbba, "args" to schema_0f732b9fceb2c6ac, "cmd" to schema_36fea325bf1aca70, "env" to schema_e51d77fd6734b53a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6ccb3f9f839a5656: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_63cf2bb53100cbd8, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6cf695d23ae995e6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("interval")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d1b9ceb7012b646: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_a59d7f7afd3350b1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d3a7935eccd662a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runs", "schedules", "unreadCount"), properties = mapOf("runs" to schema_280ab70e288f77f7, "schedules" to schema_bc6010db82e83d09, "unreadCount" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d40bf61903aed2d: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 32000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d5eecaeceee62b9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runtime"), properties = mapOf("runtime" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d6f1fde7308a250: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("lf"), JsonPrimitive("crlf")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d7393f7506dd1c5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("command"), JsonPrimitive("monitor"), JsonPrimitive("tool"), JsonPrimitive("agent"), JsonPrimitive("workflow"), JsonPrimitive("other")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6da82c72b226f41d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("gap", "notice"), properties = mapOf("gap" to schema_f550638b8241897c, "notice" to schema_214ae58e6e08f2d4), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6db96506f253ef73: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6db9f33ca9aa8b01: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_279eee1efa9da6c8, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6ddf4b7dc1e0e9e2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("frameId", "kind", "x", "y"), properties = mapOf("frameId" to schema_d855999aed5e6438, "kind" to schema_ef917452dcccd356, "x" to schema_5d4b39004bf5c532, "y" to schema_5d4b39004bf5c532), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_6e1a462e69bece35: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "initialSize", "projectLocation"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_281d24bbbaa46745, "disabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "disabledBuiltInMcpTools" to schema_fdad254a8bac8914, "initialInstructions" to schema_36fea325bf1aca70, "initialSize" to schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "mcpServers" to schema_7f86e779ad379105, "mentionHandoff" to schema_d2dd3595e1b5e5dc, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "projectPluginOverrides" to schema_6db96506f253ef73, "prompt" to schema_38d1a07d3b9b1c82, "providerSwitch" to schema_06461b14925bc6d2, "questionAnswer" to schema_4d59c815dfec80c4, "segments" to schema_4392338ffc80bed7, "sessionRef" to schema_25df6feb29c4a959, "threadId" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("thread.start.provider-switch"))
}

internal val schema_6e4ad578250cef79: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ca3d163bab055381, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6eed5e1fa2ae0e54: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("control")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6ef72b13e31a5a70: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("settings-document-unreadable"), JsonPrimitive("settings-document-unparseable"), JsonPrimitive("settings-document-not-object"), JsonPrimitive("host-resource-admission-invalid")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6f4c2b2449f0afb5: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("cancelled" to schema_feeb8bb50144d96d, "run" to schema_b6411354a37352f2), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6f5933af0336650b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("hourly")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6f5cce5ce127f97f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("observedFingerprint", "state"), properties = mapOf("observedFingerprint" to schema_d3359b6d5db5b90d, "state" to schema_f6c555fb5f1777c9), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_6f5fd1f7837ee8fe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("read")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6fb5e1ff4ba2dc63: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 4.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6fc62da359394b16: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_57bd680f6e04d0bc, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_7053ed3816efd9d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("version"), properties = mapOf("version" to schema_bf4561eb7adf4d72), additionalSchema = schema_ca3d163bab055381, unknownPolicy = RemoteUnknownFieldPolicy.PASSTHROUGH)
}

internal val schema_70c198324af8bd9f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("received"), properties = mapOf("received" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_70dc157e5476457b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts", "days", "models", "pricing", "providers", "totals"), properties = mapOf("accounts" to schema_2c09020b157316f2, "days" to schema_d37d1e49b0be87f8, "models" to schema_2c09020b157316f2, "pricing" to schema_7f0fc2dd36a6993f, "providers" to schema_2c09020b157316f2, "totals" to schema_05af39c3e918ff5a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_70e5b904af7932c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("worktrees"), properties = mapOf("worktrees" to schema_cd357f47aa772b6a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_710b6ecb781e06cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("policy", "resolution", "usage"), properties = mapOf("gitProcesses" to schema_f80bf20556c43632, "policy" to schema_280719966e4ed3aa, "resolution" to schema_c0edab91e2f5d96e, "usage" to schema_1618be77eba1d732), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_711e84b2a6817609: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("reviewers", "truncated"), properties = mapOf("reviewers" to schema_1d261f6c634ca0b3, "truncated" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_71a61af1695a9802: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_ced55d8893218e84, schema_ac3c47c48ccf5bc6, schema_37c5f2164832811e, schema_174bab0c7c772746, schema_134ccbcdbce97927, schema_f6f6c60cfab9884a, schema_c215a52302a1f428), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_729d8ec2243ca0f3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_cbf9eddea4280dec, schema_938eaedae89e4e2f), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72a4409660da2b12: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("details-v1")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72a4809a8d48dab8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "value"), properties = mapOf("type" to schema_c8c48a1118d06f0b, "value" to schema_f0f815c9ec0e3b5a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_72ce7899de7d8b9d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("enterPath"), properties = mapOf("enterPath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7324613e41acced2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label"), properties = mapOf("argumentHint" to schema_bf0b727f7b1c6d07, "description" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "pluginId" to schema_36fea325bf1aca70, "pluginName" to schema_36fea325bf1aca70, "section" to schema_f4cab1817a71aa36, "skillInvocation" to schema_36fea325bf1aca70, "skillName" to schema_36fea325bf1aca70, "skillPath" to schema_36fea325bf1aca70, "skillProvider" to schema_36fea325bf1aca70, "skillScope" to schema_ac6ea0fc110d7efb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_739ef5b32c1ac983: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_cac7783fa7c0ea01, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_73d7644dc835b94d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "length", "offset", "transferId"), properties = mapOf("kind" to schema_6f5fd1f7837ee8fe, "length" to schema_5ea91ac05355eb18, "offset" to schema_56aa0e45cbdce0d0, "transferId" to schema_7f836db787c9df87), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_74839ee2e9eafd92: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_b796dbfba5908fbc), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_74b3a4e21747a253: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_d3abf2cfac530357, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_75adf15ca2f6d249: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 16384, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_75b702ed8c9f54ac: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_294ca0c3f20bda2e, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
