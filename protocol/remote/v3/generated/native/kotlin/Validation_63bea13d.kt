// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_6a0c18e639dbb000: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("path" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a18d2072710cec2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("view")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_6b6133f7ff53b2a8: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_def077222ff95f67, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_6beecd6e512e8794: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label"), properties = mapOf("label" to schema_dfc3f3726c991dbe, "model" to schema_3cdb2ff0de916278, "phaseTitle" to schema_3cdb2ff0de916278), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6c042b493abd3ee5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("positive"), JsonPrimitive("negative"), JsonPrimitive("fact")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_6c7cb6fb412178b1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("fold")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_6d0b14c439689ee7: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("disabledMcpServerNames" to schema_242a5ef77d1f8924, "disabledSkillIds" to schema_242a5ef77d1f8924, "enabled" to schema_a6ba34cd39bf30c5, "version" to schema_362e75234d94c7e4), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_6d501e487e307ea9: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("approvalPolicies" to schema_d0b10c04efa78c87, "bypassPermissions" to schema_edbbbb70d0bea172, "contextSizeChangeReloadsSession" to schema_feeb8bb50144d96d, "contextSizeReloadStopsSubagents" to schema_feeb8bb50144d96d, "contextSizes" to schema_d0b10c04efa78c87, "defaultApprovalPolicy" to schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer" to schema_bf0b727f7b1c6d07, "defaultContextSize" to schema_bf0b727f7b1c6d07, "defaultEffort" to schema_bf0b727f7b1c6d07, "defaultHiddenModels" to schema_515482d2104d1efa, "defaultSandboxMode" to schema_bf0b727f7b1c6d07, "disabledSkillNames" to schema_515482d2104d1efa, "efforts" to schema_515482d2104d1efa, "fastDisabledReason" to schema_bf0b727f7b1c6d07, "fastModels" to schema_515482d2104d1efa, "liveInputMode" to schema_cb81a9dbb81a1a63, "modelContextSizes" to schema_e163a1a22234ae4f, "modelDefaultEfforts" to schema_e51d77fd6734b53a, "modelEfforts" to schema_e163a1a22234ae4f, "modelFamilies" to schema_ae3b637db050db2a, "modelSubProvider" to schema_e51d77fd6734b53a, "models" to schema_d0b10c04efa78c87, "modes" to schema_acf85c3d3b25a389, "presentationMode" to schema_6508684ba659826b, "presentationModes" to schema_553c5c509350e4e7, "requiresTerminalFocusBeforeInput" to schema_feeb8bb50144d96d, "runtimeLabel" to schema_36fea325bf1aca70, "sandboxModes" to schema_d0b10c04efa78c87, "settingDefs" to schema_113b6f36094df840, "showRuntimeLabelInPicker" to schema_feeb8bb50144d96d, "slashCommands" to schema_174f77d24d01fc57, "subProviders" to schema_d0b10c04efa78c87, "supportsDirectInput" to schema_feeb8bb50144d96d, "supportsResume" to schema_feeb8bb50144d96d, "thinkingModels" to schema_515482d2104d1efa, "workflowLabel" to schema_36fea325bf1aca70, "workflowModels" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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
