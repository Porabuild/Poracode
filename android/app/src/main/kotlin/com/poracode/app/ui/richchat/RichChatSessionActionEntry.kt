package com.poracode.app.ui.richchat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import com.poracode.app.R
import com.poracode.app.session.richchat.RichChatOperationFailure
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.ui.richchat.devin.richChatSessionActionContributor
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

/** Stable panel owner outside the transient add menu; stale session results are discarded. */
@Composable
internal fun RichChatSessionActionEntry(
    contextKey: String,
    agentKind: String,
    actionIds: List<String>,
    invokingActionId: String?,
    enabled: Boolean,
    onInvoke: suspend (String, JsonObject, Boolean) -> RichChatOperationResult<JsonObject>,
    onInsertIntoComposer: (String) -> Unit,
    content: @Composable (List<RichChatSessionActionEntryTarget>, (RichChatSessionActionPanelKind) -> Unit) -> Unit,
) {
    val contributor = richChatSessionActionContributor(agentKind)
    val entries = contributor?.entries(actionIds).orEmpty()
    val liveKey by rememberUpdatedState(contextKey)
    val liveEnabled by rememberUpdatedState(enabled)
    key(contextKey) {
        var activePanel by remember { mutableStateOf<RichChatSessionActionPanelKind?>(null) }
        var failure by remember { mutableStateOf<RichChatOperationFailure?>(null) }
        var suggestion by remember { mutableStateOf<String?>(null) }
        var missingSuggestion by remember { mutableStateOf(false) }
        var rulesState by remember { mutableStateOf<RichChatListingState>(RichChatListingState.Idle) }
        val scope = rememberCoroutineScope()

        fun invoke(panel: RichChatSessionActionPanelKind, form: RichChatSessionActionForm) {
            if (!liveEnabled || invokingActionId != null) return
            val target = entries.firstOrNull { it.panel == panel } ?: return
            val leaf = contributor ?: return
            failure = null
            scope.launch {
                val result = onInvoke(target.actionId, leaf.payloadFor(panel, form), panel == RichChatSessionActionPanelKind.ReviseCommand)
                if (liveKey != contextKey) return@launch
                when (result) {
                    is RichChatOperationResult.Success -> when (panel) {
                        RichChatSessionActionPanelKind.ReviseCommand -> {
                            suggestion = leaf.reviseSuggestion(result.value)
                            missingSuggestion = suggestion == null
                        }
                        RichChatSessionActionPanelKind.ListRules -> {
                            rulesState = try {
                                RichChatListingState.Entries(decodeRichChatListingLines(leaf, panel, result.value))
                            } catch (_: RichChatSessionActionResultException) {
                                RichChatListingState.Failed
                            }
                        }
                    }
                    is RichChatOperationResult.Failed -> {
                        failure = result.failure
                        if (panel == RichChatSessionActionPanelKind.ListRules) rulesState = RichChatListingState.Failed
                    }
                    RichChatOperationResult.Stale -> Unit
                }
            }
        }

        content(entries) { panel ->
            if (liveEnabled && invokingActionId == null) {
                failure = null
                suggestion = null
                missingSuggestion = false
                activePanel = panel
                if (panel == RichChatSessionActionPanelKind.ListRules) {
                    rulesState = RichChatListingState.Loading
                    invoke(panel, RichChatSessionActionForm())
                }
            }
        }
        when (activePanel) {
            RichChatSessionActionPanelKind.ReviseCommand -> RichChatSessionReviseSheet(
                suggestion = suggestion,
                missingSuggestion = missingSuggestion,
                isPending = invokingActionId != null,
                enabled = enabled,
                failureText = richChatFailureText(failure),
                onDismiss = { if (invokingActionId == null) activePanel = null },
                onSubmit = { command, note ->
                    invoke(RichChatSessionActionPanelKind.ReviseCommand, RichChatSessionActionForm(command, note))
                },
                onInsert = { text ->
                    if (liveEnabled) {
                        onInsertIntoComposer(text)
                        activePanel = null
                    }
                },
                onDiscard = { activePanel = null },
            )
            RichChatSessionActionPanelKind.ListRules -> RichChatSessionListingSheet(
                title = stringResource(R.string.rich_chat_session_rules_title),
                emptyText = stringResource(R.string.rich_chat_session_rules_empty),
                state = rulesState,
                onDismiss = { activePanel = null },
            )
            null -> Unit
        }
    }
}
