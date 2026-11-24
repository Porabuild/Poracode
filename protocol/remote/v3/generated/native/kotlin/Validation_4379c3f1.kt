// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_f6a941e10f9feb27: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^codex:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f6c555fb5f1777c9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("observed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f6cdfe506c1e5468: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "label"), properties = mapOf("kind" to schema_32519102603d95d6, "label" to schema_2963caa14efb9573, "text" to schema_dfc3f3726c991dbe), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f6dd22a2a9de3244: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("camera"), JsonPrimitive("microphone"), JsonPrimitive("photos"), JsonPrimitive("contacts"), JsonPrimitive("calendar"), JsonPrimitive("location"), JsonPrimitive("notifications"), JsonPrimitive("motion")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f6e7e7b61d75b459: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "version"), properties = mapOf("items" to schema_f3e06411e2a7b1ac, "version" to schema_f8ba039a2f32fad1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f6f6c60cfab9884a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branchRenamed", "kind", "replayed", "thread"), properties = mapOf("branch" to schema_36fea325bf1aca70, "branchRenamed" to schema_feeb8bb50144d96d, "kind" to schema_1fcbd5bc41d865ae, "replayed" to schema_feeb8bb50144d96d, "thread" to schema_b37f60804aab420f, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f7164d030c9bbeaf: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 2.0, maximum = 6.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f71a677b4df4bd5e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("groups"), properties = mapOf("groups" to schema_f3d89ffd4842a73f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f75d628126272292: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_98473b8b464036a4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f76e77baaeec46d5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("utcOffsetMinutes"), properties = mapOf("deviceId" to schema_bf0b727f7b1c6d07, "provider" to schema_bf0b727f7b1c6d07, "scope" to schema_b99ee3af304513c2, "utcOffsetMinutes" to schema_80c415b6e27c6ebd, "window" to schema_ae26bc52b712b00c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f7b2db2c4c7fbdd3: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_384bb6ef598ad698, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f7ecfe1017b42566: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 300, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f802abb4a32bbf85: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent-vision-unwatch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f86171557f2ff456: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_11f20430355ec49c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f86cfdbc9e0cdbec: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "type", "url"), properties = mapOf("path" to schema_bf0b727f7b1c6d07, "ref" to schema_bf0b727f7b1c6d07, "sha" to schema_bf0b727f7b1c6d07, "type" to schema_5e5498f4efcdaa16, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_f8afe6df005d2978: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("history-incomplete")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f8b6dd8128e8bfe0: RemoteSchema by lazy {
    RemoteSchema(type = "boolean", defaultValue = JsonPrimitive(false), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f8ba039a2f32fad1: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(2.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f8fde013f784c33d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "id", "language", "model"), properties = mapOf("action" to schema_d6b726f850f5dc81, "id" to schema_d855999aed5e6438, "language" to schema_f4e43b71651c06ad, "model" to schema_8e43cad70cd70de7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f92ad486eceff5e1: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_8345d2f810cef034, schema_89bc4017c2e23cd6, schema_a087b069daed224f), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f92e78d2407b6f99: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "itemType", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "itemType" to schema_53c82495b0f8c1eb, "parentItemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_441bce375b64f3d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f948b0004158f5ef: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "initialSize", "projectLocation"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_281d24bbbaa46745, "disabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "disabledBuiltInMcpTools" to schema_fdad254a8bac8914, "initialInstructions" to schema_36fea325bf1aca70, "initialSize" to schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "mcpServers" to schema_7f86e779ad379105, "mentionHandoff" to schema_d2dd3595e1b5e5dc, "modelSwitchItemId" to schema_36fea325bf1aca70, "presentationMode" to schema_6508684ba659826b, "previousTurnModel" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "projectPluginOverrides" to schema_6db96506f253ef73, "prompt" to schema_38d1a07d3b9b1c82, "providerSwitch" to schema_06461b14925bc6d2, "questionAnswer" to schema_4d59c815dfec80c4, "segments" to schema_4392338ffc80bed7, "sessionRef" to schema_25df6feb29c4a959, "threadId" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("thread.start.provider-switch"))
}

internal val schema_f958c6e1fa6d616c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("canLinkToGlobal", "effectiveSkillIds", "invocation", "issues", "skills"), properties = mapOf("canLinkToGlobal" to schema_feeb8bb50144d96d, "effectiveSkillIds" to schema_0f732b9fceb2c6ac, "invocation" to schema_7a20e2f82d6f16d6, "issues" to schema_ee5346688873f70f, "skills" to schema_4df989d5459165c8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f96ab4911dae8c83: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("control", "kind", "version"), properties = mapOf("control" to schema_c3a191d9ad55837f, "kind" to schema_6eed5e1fa2ae0e54, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_f97770a7e3ba8e29: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("account", "kind", "nameWithOwner"), properties = mapOf("account" to schema_5646cf57ff3aebe0, "kind" to schema_cc1f68c41f086183, "nameWithOwner" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
