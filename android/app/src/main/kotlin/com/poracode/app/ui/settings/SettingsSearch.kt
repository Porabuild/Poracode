package com.poracode.app.ui.settings

import androidx.compose.ui.graphics.vector.ImageVector
import com.poracode.app.R
import com.poracode.app.ui.theme.PoracodeIcons

internal sealed interface SettingsSearchTarget {
    data class Route(val route: SettingsRoute) : SettingsSearchTarget
    data object Workspaces : SettingsSearchTarget
    data object Schedules : SettingsSearchTarget
    data object Integrations : SettingsSearchTarget
    data object Advanced : SettingsSearchTarget
    data object Browser : SettingsSearchTarget
    data object Privacy : SettingsSearchTarget
    data object Support : SettingsSearchTarget
}

internal data class SettingsSearchEntry(
    val target: SettingsSearchTarget,
    val titleRes: Int,
    val icon: ImageVector,
    val keywords: List<String>,
    val requiresEnvironments: Boolean = false,
)

/**
 * Multi-term search across all Device & Desktop settings sections and nested fields,
 * mirroring iOS `NativeSettingsSearch`.
 */
internal object SettingsSearchIndex {
    private val entries: List<SettingsSearchEntry> = listOf(
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.General),
            titleRes = R.string.settings_device_general,
            icon = PoracodeIcons.Info,
            keywords = listOf("general", "language", "version", "shortcuts", "pinned", "home"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Workspaces,
            titleRes = R.string.home_workspaces_title,
            icon = PoracodeIcons.Layers,
            keywords = listOf("workspaces", "groups", "projects", "filter"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Appearance),
            titleRes = R.string.settings_device_appearance,
            icon = PoracodeIcons.ColorLens,
            keywords = listOf("appearance", "theme", "custom", "dark", "light", "system", "text", "font", "size", "color"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Notifications),
            titleRes = R.string.settings_device_notifications,
            icon = PoracodeIcons.Notifications,
            keywords = listOf("notifications", "push", "alerts", "sound", "attention"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Audio),
            titleRes = R.string.settings_device_audio,
            icon = PoracodeIcons.Mic,
            keywords = listOf("audio", "voice", "dictation", "microphone", "speech", "whisper", "hex"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Terminal),
            titleRes = R.string.settings_device_terminal,
            icon = PoracodeIcons.Terminal,
            keywords = listOf("terminal", "pty", "shell", "font", "size"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Git),
            titleRes = R.string.settings_device_git,
            icon = PoracodeIcons.Commit,
            keywords = listOf("git", "commit", "merge", "pr", "pull request", "branch"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.KeyboardShortcuts),
            titleRes = R.string.settings_keyboard_shortcuts,
            icon = PoracodeIcons.Keyboard,
            keywords = listOf("keyboard", "shortcuts", "hotkeys", "keybindings", "ctrl", "cmd"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.ReleaseNotes),
            titleRes = R.string.changelog_title,
            icon = PoracodeIcons.Newspaper,
            keywords = listOf("release", "notes", "changelog", "whats new", "updates"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Host),
            titleRes = R.string.settings_host_title,
            icon = PoracodeIcons.Computer,
            keywords = listOf("host", "desktop", "connection", "pairing", "device"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Profile),
            titleRes = R.string.settings_profile_title,
            icon = PoracodeIcons.Person,
            keywords = listOf("profile", "account", "activity", "costs"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Usage),
            titleRes = R.string.settings_usage_title,
            icon = PoracodeIcons.BarChart,
            keywords = listOf("usage", "quota", "limits", "tokens", "rate"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Schedules,
            titleRes = R.string.remote_integrations_schedules,
            icon = PoracodeIcons.Schedule,
            keywords = listOf("schedules", "cron", "automation", "timer"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Preferences),
            titleRes = R.string.settings_generation_title,
            icon = PoracodeIcons.AutoAwesome,
            keywords = listOf("ai", "helpers", "title", "commit", "conflict", "generation"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Memory),
            titleRes = R.string.settings_memory_title,
            icon = PoracodeIcons.Brain,
            keywords = listOf("memory", "capture", "dream", "sync", "skills", "notes"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Agents),
            titleRes = R.string.settings_agents_title,
            icon = PoracodeIcons.SmartToy,
            keywords = listOf("agents", "providers", "models", "claude", "codex", "gemini", "opencode"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Integrations,
            titleRes = R.string.settings_integrations_title,
            icon = PoracodeIcons.Extension,
            keywords = listOf("integrations", "github", "gitlab", "plugins", "skills"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.GlobalMcp),
            titleRes = R.string.settings_global_mcp_title,
            icon = PoracodeIcons.Extension,
            keywords = listOf("mcp", "servers", "tools", "oauth"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Environments),
            titleRes = R.string.environments_settings_title,
            icon = PoracodeIcons.Dns,
            keywords = listOf("environments", "ssh", "remote", "servers"),
            requiresEnvironments = true,
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.ArchivedThreads),
            titleRes = R.string.archived_threads_title,
            icon = PoracodeIcons.Archive,
            keywords = listOf("archived", "threads", "history", "closed"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Route(SettingsRoute.Workspace),
            titleRes = R.string.settings_workspace_defaults,
            icon = PoracodeIcons.CreateNewFolder,
            keywords = listOf("workspace", "worktrees", "defaults", "storage"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Browser,
            titleRes = R.string.browser_mirror_title,
            icon = PoracodeIcons.Public,
            keywords = listOf("browser", "mirror", "preview", "web"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Advanced,
            titleRes = R.string.advanced_ops_title,
            icon = PoracodeIcons.Build,
            keywords = listOf("advanced", "diagnostics", "logs", "operations"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Privacy,
            titleRes = R.string.settings_privacy,
            icon = PoracodeIcons.PrivacyTip,
            keywords = listOf("privacy", "policy", "legal"),
        ),
        SettingsSearchEntry(
            target = SettingsSearchTarget.Support,
            titleRes = R.string.settings_support,
            icon = PoracodeIcons.SupportAgent,
            keywords = listOf("support", "help", "feedback", "docs"),
        ),
    )

    fun search(
        query: String,
        environmentsAvailable: Boolean,
        resolveTitle: (Int) -> String,
    ): List<SettingsSearchEntry> {
        val terms = query.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (terms.isEmpty()) return emptyList()
        return entries.filter { entry ->
            if (entry.requiresEnvironments && !environmentsAvailable) return@filter false
            val title = resolveTitle(entry.titleRes).lowercase()
            val haystack = (entry.keywords + title).joinToString(" ")
            terms.all { term -> haystack.contains(term) }
        }
    }
}
