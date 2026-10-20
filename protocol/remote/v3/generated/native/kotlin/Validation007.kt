// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_7ac95086b2ca282e: RemoteSchema by lazy {
    RemoteSchema(type = "string", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_7b212bbb531a3d31: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("doc", "todos", "updatedAt"), properties = mapOf("doc" to schema_6e4ad578250cef79, "todos" to schema_e7c244bd461f7229, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7bbdba78cb64cd5f: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_e3fc8b89f137aafe, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7bc7b4d15b02f31d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("tasks", "threadId", "type"), properties = mapOf("tasks" to schema_00675d64d428c3d1, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_2c10059100ccb9e8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_7dccd2754fedc801: RemoteSchema by lazy {
    RemoteSchema(defaultValue = JsonNull, unionKind = "anyOf", options = listOf(schema_95e237e57720296e, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7dce940bfe881c07: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "kind", "taskId"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "kind" to schema_32b2db2eaac8458c, "lastProgressAt" to schema_f696f11685898ba7, "progress" to schema_dfc3f3726c991dbe, "startedAt" to schema_f696f11685898ba7, "stopAction" to schema_4f399075769723a3, "taskId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_7e8114c3dda52277: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session-5h"), JsonPrimitive("daily"), JsonPrimitive("weekly"), JsonPrimitive("weekly-opus"), JsonPrimitive("weekly-sonnet"), JsonPrimitive("weekly-fable"), JsonPrimitive("monthly"), JsonPrimitive("extra-usage"), JsonPrimitive("cursor-auto"), JsonPrimitive("cursor-api")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7eb7e8f44a304273: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("basePath" to schema_bf0b727f7b1c6d07, "mode" to schema_953c573b196de65a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7ee0d4255fd8c330: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f0fc2dd36a6993f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8ca5860ab0ec6478, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f27390751296eea: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^pc_media_[A-Za-z0-9_-]{43}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_7fdc1b397391e8f3: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0a5d0a388502828c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7fe780499159088a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("done")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8015752827e2b146: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("completedTurnsLimit" to schema_be268483fb86810f, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "notices" to schema_f67f6cbe63879b24, "omitScrollback" to schema_feeb8bb50144d96d, "projection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "runtimePage" to schema_8795ea0289d608d6, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_80f7976aee3c4505: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_ab08aad343958c81, schema_b9d24da8425fcc77), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_825afc62b855f7e6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("actions"), properties = mapOf("actions" to schema_c286f4704a09cde8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_828172bf1752b0f1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("marketplace"), properties = mapOf("marketplace" to schema_118f67a0fa6bb27d, "query" to schema_e5bbd3e940039349, "sort" to schema_1eaf563a1e9fa631), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_829c74ec0aec2226: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("desktop-event")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_82e8027595898a28: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("conclusion", "id", "name", "status", "steps"), properties = mapOf("completedAt" to schema_bf0b727f7b1c6d07, "conclusion" to schema_bf0b727f7b1c6d07, "id" to schema_3d06117798bf5171, "name" to schema_bf0b727f7b1c6d07, "startedAt" to schema_bf0b727f7b1c6d07, "status" to schema_bf0b727f7b1c6d07, "steps" to schema_f1a8832c8ce43a2f, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_82e9f889c9c5a99f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("fixed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_82fdb789883e6159: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId"), properties = mapOf("kind" to schema_6801e053c0220116, "tabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_83384e1a092392f6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("key", "kind"), properties = mapOf("key" to schema_35c107fafb96bccf, "kind" to schema_14221269d858a2f5), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_833ba85e740a223b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive(".")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_83671e64288686fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hash"), properties = mapOf("appVersion" to schema_a016251474d39e0d, "hash" to schema_ec221fdc1494d0b1), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_838adcbcaff5f551: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "type"), properties = mapOf("cursorSync" to schema_3975ceeb3762f594, "id" to schema_36fea325bf1aca70, "type" to schema_c64b38404fc9a1d4), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_839da5c7aa9ba993: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("author", "body", "createdAt", "id"), properties = mapOf("author" to schema_a99c73e81a312991, "body" to schema_bf0b727f7b1c6d07, "createdAt" to schema_bf0b727f7b1c6d07, "id" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_83c7c01b4046dd13: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("command", "type"), properties = mapOf("args" to schema_aac2a4e83d2823be, "command" to schema_36fea325bf1aca70, "cwd" to schema_36fea325bf1aca70, "env" to schema_c3ac2139868061bb, "type" to schema_01f71c4e26e7ecde), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8423ce6905ffd393: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("external")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8428abfcec0a8b32: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environment"), properties = mapOf("environment" to schema_d832acd230fbc919), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_84503a3e631d0429: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("groups", "id", "type", "values"), properties = mapOf("category" to schema_bf0b727f7b1c6d07, "currentValue" to schema_bf0b727f7b1c6d07, "groups" to schema_a8f9536c8e956810, "id" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "role" to schema_09201de15f15ed50, "type" to schema_36b9fe91ec45bcd5, "values" to schema_f46da48437a0c164), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_849e43bfc063f1bb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("invocation", "kind", "name", "provider", "scope"), properties = mapOf("invocation" to schema_36fea325bf1aca70, "kind" to schema_2a65cef1bc5905f9, "name" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "pluginId" to schema_36fea325bf1aca70, "pluginName" to schema_36fea325bf1aca70, "provider" to schema_36fea325bf1aca70, "scope" to schema_ac6ea0fc110d7efb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_84af3e97516dc824: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("experimentId"), properties = mapOf("experimentId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_84c6a19f87f29012: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 8, items = schema_941a12a3ce0aadca, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_84ccfb83d8334510: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("every", "kind", "unit"), properties = mapOf("every" to schema_dcf7bba14632f6b7, "kind" to schema_6cf695d23ae995e6, "unit" to schema_e4a434d61cd0f65f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8532cee498146283: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("text"), properties = mapOf("text" to schema_769c50c6909920b7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_85b37e87f5d8365a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("batches", "completedTurns", "contextUsage", "kind", "runtimeResumeCursor", "snapshotSeq", "thread"), properties = mapOf("backgroundTasks" to schema_00675d64d428c3d1, "batches" to schema_e0fc3c3d350deb38, "completedTurns" to schema_4c20b501501c0ba4, "completedTurnsNextCursor" to schema_df704162f3d15808, "contextUsage" to schema_e47ad2358cf0df53, "followUpQueue" to schema_91dcfb42aac98166, "kind" to schema_e1a91348d83820fb, "runtimeNotice" to schema_1468dfe9a2db9c9d, "runtimeResumeCursor" to schema_36fea325bf1aca70, "runtimeStateCurrent" to schema_feeb8bb50144d96d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "thread" to schema_8df7c9ec623a5efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

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

internal val schema_861b7e521ad93c4b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("applicationId", "decision", "permission", "type"), properties = mapOf("applicationId" to schema_bab85ee50a59610a, "decision" to schema_ff4e0a6efa5fd888, "permission" to schema_f6dd22a2a9de3244, "type" to schema_592634b8956b6cd0), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_892eceb2acf00deb: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("brew" to schema_36fea325bf1aca70, "builtIn" to schema_685dee710cb094fd, "homebrewCask" to schema_36fea325bf1aca70, "installer" to schema_540ab9236f8c36ab, "latestVersionUrls" to schema_c2e8606952666d2c, "npm" to schema_36fea325bf1aca70, "preferPackageManagerOnWindows" to schema_d3ebc3c9a3e4d5bc, "verifyBuiltInVersionChange" to schema_feeb8bb50144d96d, "windowsNpmInstallArgs" to schema_0f732b9fceb2c6ac, "winget" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8951a961f885eeda: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts", "available", "device", "generatedAt", "lifetimeTokens", "models", "peakDayTokens", "providers", "scope", "timezoneOffsetMinutes", "tokenHeatmap", "unavailableProviders", "windowDays"), properties = mapOf("accounts" to schema_d0fa817300598095, "available" to schema_feeb8bb50144d96d, "costs" to schema_70dc157e5476457b, "device" to schema_26f96950d20651b3, "generatedAt" to schema_3d06117798bf5171, "lifetimeTokens" to schema_56aa0e45cbdce0d0, "models" to schema_195974ed118a4217, "peakDay" to schema_bf0b727f7b1c6d07, "peakDayTokens" to schema_56aa0e45cbdce0d0, "providers" to schema_d0fa817300598095, "scope" to schema_b99ee3af304513c2, "timezoneOffsetMinutes" to schema_3d06117798bf5171, "tokenHeatmap" to schema_c1094a243b47f83c, "unavailableProviders" to schema_0f732b9fceb2c6ac, "windowDays" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8971fe1e2b13c08e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("version"), properties = mapOf("appearance" to schema_9ea58f9bfc61ade7, "fontScale" to schema_debc0ac62b48b9e2, "networkEnabled" to schema_feeb8bb50144d96d, "reduceMotion" to schema_feeb8bb50144d96d, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_8b16df449d9a1954: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("modes", "versions"), properties = mapOf("modes" to schema_c052748939bdd575, "versions" to schema_5f5ea22d1d79751d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_8babf8e3864040e4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("updatedAt", "windows", "wsl"), properties = mapOf("updatedAt" to schema_36fea325bf1aca70, "windows" to schema_da4425e4d35d8e9f, "wsl" to schema_da4425e4d35d8e9f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8bcac1a2041bc3a6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("previewId", "version"), properties = mapOf("previewId" to schema_d855999aed5e6438, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_8be22931a515cd6d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_7ac92dcb7485437b, schema_455b16a806252fd5, schema_e7cab2d2c052144f, schema_09f700fdeb3e5213), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_8c04d0a06a161126: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "text"), properties = mapOf("kind" to schema_3ad514880db80c82, "text" to schema_5ae95e3b3c8a9ee1), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_8ca5860ab0ec6478: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cacheRead", "cacheWrite", "cacheWrite1h", "effectiveFrom", "id", "input", "model", "output", "reviewedAt", "source"), properties = mapOf("cacheRead" to schema_f696f11685898ba7, "cacheWrite" to schema_f696f11685898ba7, "cacheWrite1h" to schema_f696f11685898ba7, "effectiveFrom" to schema_bf0b727f7b1c6d07, "id" to schema_bf0b727f7b1c6d07, "input" to schema_f696f11685898ba7, "model" to schema_bf0b727f7b1c6d07, "output" to schema_f696f11685898ba7, "reviewedAt" to schema_bf0b727f7b1c6d07, "source" to schema_6bb6e13415c8cbba), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_8d889103a9834b21: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "sourceThreadId", "title"), properties = mapOf("kind" to schema_587e72c508e2943a, "sourceThreadId" to schema_36fea325bf1aca70, "throughItemId" to schema_36fea325bf1aca70, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
