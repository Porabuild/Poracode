// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
typealias ProcedurebrowseHostDirectoryResultU2DParentPath_2d0b6ec9f2 = ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b?

@Serializable
data class ProcedurebrowseHostDirectoryResult_94eb65eaca(
    @SerialName("entries") val entries: List<ProcedurebrowseHostDirectoryResultU2DEntriesU2DItem_d0ecd43b5f>,
    @SerialName("homePath") val homePath: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("parentPath") val parentPath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("truncated") val truncated: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("entries", "List<ProcedurebrowseHostDirectoryResultU2DEntriesU2DItem_d0ecd43b5f>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("homePath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentPath", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("truncated", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecancelExtractContextRequest_09b78d9c1d(
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureclearMcpServerOauthRequest_db8efd22aa(
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1U2DKind_3cd19b85f5 {
    @SerialName("url") URL,
}

@Serializable
data class ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e(
    @SerialName("kind") val kind: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1U2DKind_3cd19b85f5,
    @SerialName("url") val url: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1U2DKind_3cd19b85f5", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff(
    @SerialName("host") val host: String,
    @SerialName("login") val login: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("host", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("login", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DKind_cc1f68c41f {
    @SerialName("github") GITHUB,
}

@Serializable
data class ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3(
    @SerialName("account") val account: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff,
    @SerialName("kind") val kind: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DKind_cc1f68c41f,
    @SerialName("nameWithOwner") val nameWithOwner: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("account", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DKind_cc1f68c41f", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("nameWithOwner", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedurecloneRepoRequestU2DSource_76b2c94b29.Serializer::class)
sealed interface ProcedurecloneRepoRequestU2DSource_76b2c94b29 {
    data class Option1(val value: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e) : ProcedurecloneRepoRequestU2DSource_76b2c94b29
    data class Option2(val value: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3) : ProcedurecloneRepoRequestU2DSource_76b2c94b29
    object Serializer : KSerializer<ProcedurecloneRepoRequestU2DSource_76b2c94b29> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedurecloneRepoRequestU2DSource_76b2c94b29")
        override fun deserialize(decoder: Decoder): ProcedurecloneRepoRequestU2DSource_76b2c94b29 {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedurecloneRepoRequestU2DSource_76b2c94b29 supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedurecloneRepoRequestU2DSource_76b2c94b29>>()
            RemoteUnionCodec.tryOption(matches, 1, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("url")))) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, RemoteUnionCodec.matchesProperty(element, "kind", listOf(JsonPrimitive("github")))) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3>(element)) }
            return RemoteUnionCodec.single("ProcedurecloneRepoRequestU2DSource_76b2c94b29", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedurecloneRepoRequestU2DSource_76b2c94b29) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedurecloneRepoRequestU2DSource_76b2c94b29 supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
data class ProcedurecloneRepoRequest_482895ec91(
    @SerialName("name") val name: String,
    @SerialName("parentLocation") val parentLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("source") val source: ProcedurecloneRepoRequestU2DSource_76b2c94b29,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parentLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("source", "ProcedurecloneRepoRequestU2DSource_76b2c94b29", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurecloneRepoResult_6a0c18e639(
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DPolicy_5e585becfd {
    @SerialName("crew-only") CREWU2DONLY,
    @SerialName("crew-first") CREWU2DFIRST,
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9(
    @SerialName("agentKind") val agentKind: String,
    @SerialName("contextSize") val contextSize: RemoteField<String> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<String> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("model") val model: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, 128, null, null, null, null, listOf()),
            RemoteFieldDescriptor("contextSize", "String", false, false, null, null, 1, 64, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "String", false, false, null, null, 1, 64, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, 256, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1 = Boolean

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItem_63a5f0fcba(
    @SerialName("brief") val brief: RemoteField<String> = RemoteField.Missing,
    @SerialName("fallbacks") val fallbacks: RemoteField<List<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9>> = RemoteField.Missing,
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
    @SerialName("noEdits") val noEdits: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = RemoteField.Missing,
    @SerialName("parallel") val parallel: RemoteField<Long> = RemoteField.Missing,
    @SerialName("selection") val selection: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("brief", "String", false, false, null, null, null, 160, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fallbacks", "List<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9>", false, false, null, null, null, null, null, 3, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, null, null, null, null, "^[a-z0-9][a-z0-9-]{0,31}$", null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, 1, 24, null, null, null, null, listOf()),
            RemoteFieldDescriptor("noEdits", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("parallel", "Long", false, false, 1.0, 4.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("selection", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72 = Double

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1_c18ccc2aa3(
    @SerialName("crewId") val crewId: RemoteField<String> = RemoteField.Missing,
    @SerialName("name") val name: RemoteField<String> = RemoteField.Missing,
    @SerialName("policy") val policy: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DPolicy_5e585becfd,
    @SerialName("roles") val roles: List<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItem_63a5f0fcba>,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("crewId", "String", false, false, null, null, 1, 64, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", false, false, null, null, 1, 40, null, null, null, null, listOf()),
            RemoteFieldDescriptor("policy", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DPolicy_5e585becfd", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("roles", "List<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItem_63a5f0fcba>", true, false, null, null, null, null, 1, 6, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D2_7053ed3816(
    @SerialName("version") val version: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.PASSTHROUGH, listOf(
            RemoteFieldDescriptor("version", "Long", true, false, 2.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e.Serializer::class)
sealed interface ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e {
    data class Option1(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1_c18ccc2aa3) : ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e
    data class Option2(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D2_7053ed3816) : ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e
    object Serializer : KSerializer<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e")
        override fun deserialize(decoder: Decoder): ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e>>()
            RemoteUnionCodec.tryOption(matches, 1, element is JsonObject) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1_c18ccc2aa3>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, element is JsonObject) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D2_7053ed3816>(element)) }
            return RemoteUnionCodec.first("ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1_c18ccc2aa3>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D2_7053ed3816>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

typealias ProcedureconnectThreadVoiceRequestU2DConfigU2DCrew_46a8742e57 = ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e?

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996(
    @SerialName("distro") val distro: String,
    @SerialName("kind") val kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("distro", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DImportedFrom_3471186f13(
    @SerialName("importedAt") val importedAt: String,
    @SerialName("path") val path: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("importedAt", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2 = Map<String, Boolean>

@Serializable
enum class ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9 {
    @SerialName("agent") AGENT,
    @SerialName("plan") PLAN,
    @SerialName("autopilot") AUTOPILOT,
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D1_adaa80878b(
    @SerialName("contextSize") val contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("effort") val effort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D2_d1624ea0ec(
    @SerialName("contextSize") val contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fast") val fast: Boolean,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D3_2840caeaed(
    @SerialName("contextSize") val contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("thinking") val thinking: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D4_94dda13e1c(
    @SerialName("contextSize") val contextSize: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("effort") val effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = RemoteField.Missing,
    @SerialName("fast") val fast: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("thinking") val thinking: RemoteField<Boolean> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("contextSize", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effort", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fast", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("thinking", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable(with = ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc.Serializer::class)
sealed interface ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc {
    data class Option1(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D1_adaa80878b) : ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc
    data class Option2(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D2_d1624ea0ec) : ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc
    data class Option3(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D3_2840caeaed) : ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc
    data class Option4(val value: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D4_94dda13e1c) : ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc
    object Serializer : KSerializer<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc> {
        override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc")
        override fun deserialize(decoder: Decoder): ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc {
            val jsonDecoder = decoder as? JsonDecoder ?: throw SerializationException("ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc supports JSON only")
            val element = jsonDecoder.decodeJsonElement()
            val matches = mutableListOf<RemoteUnionMatch<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc>>()
            RemoteUnionCodec.tryOption(matches, 1, element is JsonObject) { Option1(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D1_adaa80878b>(element)) }
            RemoteUnionCodec.tryOption(matches, 2, element is JsonObject) { Option2(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D2_d1624ea0ec>(element)) }
            RemoteUnionCodec.tryOption(matches, 3, element is JsonObject) { Option3(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D3_2840caeaed>(element)) }
            RemoteUnionCodec.tryOption(matches, 4, element is JsonObject) { Option4(jsonDecoder.json.decodeFromJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D4_94dda13e1c>(element)) }
            return RemoteUnionCodec.first("ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc", matches)
        }
        override fun serialize(encoder: Encoder, value: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc) {
            val jsonEncoder = encoder as? JsonEncoder ?: throw SerializationException("ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc supports JSON only")
            val element = when (value) {
                is Option1 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D1_adaa80878b>(value.value)
                is Option2 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D2_d1624ea0ec>(value.value)
                is Option3 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D3_2840caeaed>(value.value)
                is Option4 -> jsonEncoder.json.encodeToJsonElement<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D4_94dda13e1c>(value.value)
            }
            jsonEncoder.encodeJsonElement(element)
        }
    }
}

@Serializable
enum class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DKind_452e07a326 {
    @SerialName("family-member") FAMILYU2DMEMBER,
}

@Serializable
enum class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6 {
    @SerialName("terminal") TERMINAL,
    @SerialName("gui") GUI,
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwner_a8eb5a0e02(
    @SerialName("agentInstanceId") val agentInstanceId: RemoteField<String> = RemoteField.Missing,
    @SerialName("agentKind") val agentKind: String,
    @SerialName("presentationMode") val presentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("agentInstanceId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("agentKind", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3(
    @SerialName("inertValues") val inertValues: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc,
    @SerialName("kind") val kind: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DKind_452e07a326,
    @SerialName("model") val model: String,
    @SerialName("owner") val owner: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwner_a8eb5a0e02,
    @SerialName("version") val version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.REJECT, listOf(
            RemoteFieldDescriptor("inertValues", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DKind_452e07a326", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("owner", "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwner_a8eb5a0e02", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("version", "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
