package com.poracode.app.ui.richchat.devin

import com.poracode.app.ui.richchat.RichChatSessionActionPanelContributor

/**
 * Composition point for provider session-action panels on Android — the
 * counterpart of the desktop renderer's provider session-controls registry.
 *
 * The shared composer UI only consumes the neutral
 * [RichChatSessionActionPanelContributor] capability; this file is the single
 * place where provider leaves are registered. Each leaf answers
 * [RichChatSessionActionPanelContributor.matchesAgentKind] itself (its base
 * kind plus every `kind:<instance>` profile), so adding a provider means
 * adding its leaf to the list — no shared panel, runtime, or transport file
 * changes.
 */
internal val richChatSessionActionLeaves: List<RichChatSessionActionPanelContributor> =
    listOf(DevinSessionActionPanels)

/** The leaf presenting session actions for [agentKind], or null when none does. */
internal fun richChatSessionActionContributor(
    agentKind: String,
): RichChatSessionActionPanelContributor? =
    richChatSessionActionLeaves.firstOrNull { it.matchesAgentKind(agentKind) }
