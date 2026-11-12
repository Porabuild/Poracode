// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_000753aa3ed87d21: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session.exited")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_0174a8d738e73980: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "paused"), properties = mapOf("items" to schema_e005a5ac28cf7191, "paused" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_018e665246931443: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("status", "tabId"), properties = mapOf("reason" to schema_bf0b727f7b1c6d07, "status" to schema_c1f357f1f88472e8, "tabId" to schema_2d0b6ec9f2b2decf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_01baf573c6016ec3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_499c88c1c549e934, schema_7f9f5a0d72de0d9a, schema_f8ba039a2f32fad1, schema_135f7ef79d6fe306, schema_e6cfd13a746cd290), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_01e21946e943d3eb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent"), JsonPrimitive("plan"), JsonPrimitive("autopilot")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_01f71c4e26e7ecde: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("stdio")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0200f968d21b338b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ready")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_020cad6f356d7c67: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^[a-z0-9][a-z0-9-]{0,31}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_02179e6a4b6545d5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("defaultBranch", "dispatchable", "inputs", "ref", "triggers", "workflowId"), properties = mapOf("defaultBranch" to schema_bf0b727f7b1c6d07, "dispatchable" to schema_feeb8bb50144d96d, "inputs" to schema_c44733d5a3f1db00, "ref" to schema_bf0b727f7b1c6d07, "triggers" to schema_0f732b9fceb2c6ac, "workflowId" to schema_3d06117798bf5171), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_024bd48f0f66abbd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "remote", "url"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "remote" to schema_36fea325bf1aca70, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0288aefad61e0244: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "commit", "isMain", "path"), properties = mapOf("branch" to schema_bf0b727f7b1c6d07, "commit" to schema_bf0b727f7b1c6d07, "isMain" to schema_feeb8bb50144d96d, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_02f5d10d12c9f077: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "sourceScope"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "sourceScope" to schema_b160fc20dd335dc3), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_02f62ff4e29426df: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8103808258c2d166, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_030ab3973aced8b3: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_60a0e6f594cb3154, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_034741cb26a53fe4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("remove")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_03762dd017f2a872: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_cd9a361e554145c9, schema_e30d1bfa71891ffd, schema_0e5eb227708be551, schema_73d7644dc835b94d, schema_4734a988c0fc7988, schema_404d099c5c6a9b12, schema_cb09d6f7d6659d21), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_039b848cf1c1ad6c: RemoteSchema by lazy {
    RemoteSchema(type = "integer", defaultValue = JsonPrimitive(50), minimum = 1.0, maximum = 200.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_039d29a220abcf97: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectPullRequestLists", "projects", "pullRequestKeyByBranch", "pullRequests", "revision", "targets"), properties = mapOf("projectPullRequestLists" to schema_d8ae5c3a60a788cd, "projects" to schema_7ded875dbc20840e, "pullRequestKeyByBranch" to schema_e51d77fd6734b53a, "pullRequests" to schema_fcec19cd11bed7c3, "revision" to schema_56aa0e45cbdce0d0, "targets" to schema_7675a7cd6ae22dbd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_03b0a880c77f4089: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("watch"), properties = mapOf("watch" to schema_5093c62d05bf0072), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_03fdf2ff7afe440b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("clear-group")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_04569d9eea76ae2b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth-wait")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_045e333a691dd990: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "record", "threads"), properties = mapOf("kind" to schema_1f4518886240126e, "record" to schema_1be5ac91cc4357cb, "threads" to schema_07e53f0185035761), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0463d43632698ad7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("refresh_token")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0465e7aaae9c70d7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("value"), properties = mapOf("group" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "value" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_046f6b1ae10fa4ef: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("new-thread")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_04879beede8bfc96: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_281d24bbbaa46745, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_04de8f3da1a2ece8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("connectTicket", "forward"), properties = mapOf("connectTicket" to schema_36fea325bf1aca70, "enterPath" to schema_36fea325bf1aca70, "forward" to schema_247ec4acb49e6522), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0534fb6201293569: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("sound", "statuses"), properties = mapOf("sound" to schema_feeb8bb50144d96d, "statuses" to schema_72130deafac7a5ba), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_053ca1a8a132e83a: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 500, items = schema_b83973a63f086da7, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_054db9731372b70d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("result"), properties = mapOf("result" to schema_e6958017dac6cd3b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_056e1da676eab3d9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "distribution", "id", "name", "version"), properties = mapOf("authors" to schema_0f732b9fceb2c6ac, "description" to schema_36fea325bf1aca70, "distribution" to schema_97a8dc6944322187, "icon" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "license" to schema_bf0b727f7b1c6d07, "name" to schema_36fea325bf1aca70, "repository" to schema_6bb6e13415c8cbba, "version" to schema_36fea325bf1aca70, "website" to schema_6bb6e13415c8cbba), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_05812a27bb4846c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId"), properties = mapOf("projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_05ab37f667d37cfc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("MERGEABLE"), JsonPrimitive("CONFLICTING"), JsonPrimitive("UNKNOWN")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
