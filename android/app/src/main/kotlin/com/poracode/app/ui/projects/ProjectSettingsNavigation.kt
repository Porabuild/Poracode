package com.poracode.app.ui.projects

import androidx.annotation.StringRes
import com.poracode.app.R

internal enum class ProjectSettingsPage(@param:StringRes val title: Int) {
    Index(R.string.projects_settings),
    General(R.string.projects_general),
    Worktrees(R.string.projects_worktrees),
    Actions(R.string.projects_actions),
    Mcp(R.string.settings_global_mcp_title),
    Search(R.string.projects_search),
    Notes(R.string.projects_notes),
}
