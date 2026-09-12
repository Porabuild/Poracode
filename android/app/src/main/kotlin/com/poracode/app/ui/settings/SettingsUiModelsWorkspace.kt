package com.poracode.app.ui.settings

import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.HostSettingsSnapshot
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Worktree location and pull-request automation defaults, host-scoped like [SettingsPreferencesDraft]. */
data class SettingsWorkspaceDraft(
    val worktreeStorageMode: String,
    val worktreeBasePath: String,
    val wslWorktreeBasePath: String,
    val prAutomationDefault: String,
    val prMergeMethod: String,
) {
    fun patchFrom(baseline: SettingsWorkspaceDraft): HostSettingsPatch? {
        val fields = buildJsonObject {
            if (worktreeStorageMode != baseline.worktreeStorageMode) {
                put("worktreeStorageMode", worktreeStorageMode)
            }
            if (worktreeBasePath != baseline.worktreeBasePath) {
                put("worktreeBasePath", worktreeBasePath)
            }
            if (wslWorktreeBasePath != baseline.wslWorktreeBasePath) {
                put("wslWorktreeBasePath", wslWorktreeBasePath)
            }
            if (prAutomationDefault != baseline.prAutomationDefault) {
                put("prAutomationDefault", prAutomationDefault)
            }
            if (prMergeMethod != baseline.prMergeMethod) {
                put("prMergeMethod", prMergeMethod)
            }
        }
        return fields.takeIf { it.isNotEmpty() }?.let(HostSettingsPatch::from)
    }

    companion object {
        const val STORAGE_GLOBAL = "global"
        const val STORAGE_PROJECT_RELATIVE = "project-relative"
        const val PR_AUTOMATION_OFF = "off"
        const val PR_AUTOMATION_FIX = "fix"
        const val PR_AUTOMATION_MERGE = "merge"
        const val PR_MERGE_METHOD_MERGE = "merge"
        const val PR_MERGE_METHOD_SQUASH = "squash"
        const val PR_MERGE_METHOD_REBASE = "rebase"
    }
}

internal fun projectWorkspace(snapshot: HostSettingsSnapshot?): SettingsWorkspaceDraft? {
    val settings = snapshot?.settings ?: return null
    return SettingsWorkspaceDraft(
        worktreeStorageMode = settings.string("worktreeStorageMode")
            ?: SettingsWorkspaceDraft.STORAGE_GLOBAL,
        worktreeBasePath = settings.string("worktreeBasePath").orEmpty(),
        wslWorktreeBasePath = settings.string("wslWorktreeBasePath").orEmpty(),
        prAutomationDefault = settings.string("prAutomationDefault")
            ?: SettingsWorkspaceDraft.PR_AUTOMATION_OFF,
        prMergeMethod = settings.string("prMergeMethod")
            ?: SettingsWorkspaceDraft.PR_MERGE_METHOD_MERGE,
    )
}
