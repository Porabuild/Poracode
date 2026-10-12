package com.poracode.app.session.projects

import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectNotes

fun interface ProjectNotesClock {
    fun nowIso8601(): String
}

data class ProjectNotesEntry(
    val notes: ProjectNotes? = null,
    val lastConfirmed: ProjectNotes? = null,
    val loading: Boolean = false,
    val pendingSave: Boolean = false,
    val saving: Boolean = false,
    val localRevision: Long = 0,
    val confirmedRevision: Long = 0,
    val changeEpoch: Long = 0,
    val failure: ProjectOperationFailure? = null,
)

data class ProjectNotesState(
    /** Neither notes nor request state is persisted; host identity is always part of the key. */
    val entries: Map<ProjectIdentity, ProjectNotesEntry> = emptyMap(),
)
