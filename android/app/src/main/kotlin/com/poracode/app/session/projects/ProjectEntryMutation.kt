package com.poracode.app.session.projects

sealed interface ProjectEntryMutation {
    val path: String

    data class Create(
        override val path: String,
        val type: Type,
    ) : ProjectEntryMutation

    data class Rename(
        override val path: String,
        val nextName: String,
    ) : ProjectEntryMutation

    data class Move(
        override val path: String,
        val nextParentPath: String?,
    ) : ProjectEntryMutation

    data class Delete(override val path: String) : ProjectEntryMutation

    enum class Type(val wireName: String) { File("file"), Directory("directory") }
}

internal fun ProjectEntryMutation.invalidates(openPath: String): Boolean = when (this) {
    is ProjectEntryMutation.Create -> false
    else -> openPath == path || openPath.startsWith("${path.trimEnd('/', '\\')}/")
}
