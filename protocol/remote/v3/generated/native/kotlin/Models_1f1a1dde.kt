// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D13U2DKind_70ab564010 {
    @SerialName("remove-threads") REMOVEU2DTHREADS,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D13_65b6b00dc3(
    @SerialName("action") val action: RoutethreadU2DCommandRequestU2DOptionU2D13U2DAction_e9d06fff5d,
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D13U2DKind_70ab564010,
    @SerialName("removeOwnedWorktrees") val removeOwnedWorktrees: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("threadIds") val threadIds: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("action", "RoutethreadU2DCommandRequestU2DOptionU2D13U2DAction_e9d06fff5d", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D13U2DKind_70ab564010", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("removeOwnedWorktrees", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadIds", "List<String>", true, false, null, null, null, null, 1, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D14U2DKind_53ceafeed2 {
    @SerialName("archive") ARCHIVE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D14_431be1ab7e(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D14U2DKind_53ceafeed2,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D14U2DKind_53ceafeed2", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D15U2DKind_c7bfc39efc {
    @SerialName("unarchive") UNARCHIVE,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D15_a93ba7bf23(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D15U2DKind_c7bfc39efc,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D15U2DKind_c7bfc39efc", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D16_370ff0ec0a(
    @SerialName("kind") val kind: RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D17_2062bc5ac9(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D7U2DKind_701d7d6274,
    @SerialName("placement") val placement: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e,
    @SerialName("projectId") val projectId: String,
    @SerialName("targetThreadId") val targetThreadId: String,
    @SerialName("threadIds") val threadIds: List<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D7U2DKind_701d7d6274", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("placement", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetThreadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadIds", "List<String>", true, false, null, null, null, null, 1, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D18U2DKind_8e7b4d097a {
    @SerialName("reorder-flat") REORDERU2DFLAT,
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D18_efd9410c75(
    @SerialName("kind") val kind: RoutethreadU2DCommandRequestU2DOptionU2D18U2DKind_8e7b4d097a,
    @SerialName("placement") val placement: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e,
    @SerialName("projectId") val projectId: String,
    @SerialName("targetThreadId") val targetThreadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RoutethreadU2DCommandRequestU2DOptionU2D18U2DKind_8e7b4d097a", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("placement", "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("targetThreadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class RoutethreadU2DCommandRequestU2DOptionU2D19_69af29ff38(
    @SerialName("kind") val kind: RouteprojectU2DCommandRequestU2DOptionU2D8U2DKind_96cd458fa9,
    @SerialName("workspaceId") val workspaceId: RemoteField<String>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("kind", "RouteprojectU2DCommandRequestU2DOptionU2D8U2DKind_96cd458fa9", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("workspaceId", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_587e72c508 {
    @SerialName("fork") FORK,
}
