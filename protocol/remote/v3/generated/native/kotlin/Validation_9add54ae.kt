// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_000753aa3ed87d21: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session.exited")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0013f55d4acc3d55: RemoteSchema by lazy {
    RemoteSchema(type = "integer", defaultValue = JsonPrimitive(3), minimum = 2.0, maximum = 20.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_003a95dd16c24c10: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("true"), JsonPrimitive("false")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_00876431431924e0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 1024, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0093611cbbbd16a0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("destinationScope", "marketplace", "marketplaceSkillId"), properties = mapOf("availability" to schema_9c8337f42f233534, "destinationScope" to schema_ac6ea0fc110d7efb, "marketplace" to schema_118f67a0fa6bb27d, "marketplaceSkillId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "replace" to schema_f8b6dd8128e8bfe0, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_00b1d6328e3a57b5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deletions", "insertions", "path", "staged", "status"), properties = mapOf("deletions" to schema_3d06117798bf5171, "insertions" to schema_3d06117798bf5171, "oldPath" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07, "staged" to schema_feeb8bb50144d96d, "status" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_00ebeb8fef40c2a6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("scroll")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_00f4768be29103a9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authState", "authUsesProviderLogin", "capabilities", "installed", "presentationMode"), properties = mapOf("authLogoutSupported" to schema_feeb8bb50144d96d, "authMethods" to schema_cd0a57f27ae4fccb, "authState" to schema_2363c4dd0a78ce9d, "authUsesProviderLogin" to schema_feeb8bb50144d96d, "capabilities" to schema_de2055b6e4e71688, "installationSource" to schema_36fea325bf1aca70, "installed" to schema_feeb8bb50144d96d, "loginCommand" to schema_36fea325bf1aca70, "loginCommandDisplay" to schema_36fea325bf1aca70, "preferTerminalLogin" to schema_feeb8bb50144d96d, "presentationMode" to schema_6508684ba659826b, "providerMetadata" to schema_197c2b8c01d7f4ed, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_010485e0a27ea254: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_5465dd986b32b774, "path" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_012b6b31ad80d567: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpoint"), properties = mapOf("checkpoint" to schema_938414fbfa27a773), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0138c350a16e9103: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("create-tab")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_014d2dfae880067a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentFinished", "agentId", "location", "threadId", "transcriptDir"), properties = mapOf("agentFinished" to schema_feeb8bb50144d96d, "agentId" to schema_36fea325bf1aca70, "location" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70, "transcriptDir" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0170ad7cfc4d502b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("updatedAt", "windows", "wsl"), properties = mapOf("detecting" to schema_feeb8bb50144d96d, "updatedAt" to schema_36fea325bf1aca70, "windows" to schema_6b6133f7ff53b2a8, "wsl" to schema_6b6133f7ff53b2a8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0174a8d738e73980: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "paused"), properties = mapOf("items" to schema_e005a5ac28cf7191, "paused" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_018e665246931443: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("status", "tabId"), properties = mapOf("reason" to schema_bf0b727f7b1c6d07, "status" to schema_c1f357f1f88472e8, "tabId" to schema_2d0b6ec9f2b2decf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_01b65e34c5bdc081: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("day", "totals"), properties = mapOf("day" to schema_bf0b727f7b1c6d07, "totals" to schema_e0fa095c6a9a1aed), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_01baf573c6016ec3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_499c88c1c549e934, schema_7f9f5a0d72de0d9a, schema_f8ba039a2f32fad1, schema_135f7ef79d6fe306, schema_e6cfd13a746cd290), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
