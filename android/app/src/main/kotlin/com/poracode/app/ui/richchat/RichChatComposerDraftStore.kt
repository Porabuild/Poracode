package com.poracode.app.ui.richchat

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * In-memory composer draft store keyed by presented thread id (`connectionId:threadId`
 * or raw `threadId`). Keeps unsent drafts alive across thread switches on tablet/foldable
 * and drives the subtle draft badge on thread rows.
 */
class RichChatComposerDraftStore {
    private val mutableDrafts = MutableStateFlow<Map<String, String>>(emptyMap())
    val drafts: StateFlow<Map<String, String>> = mutableDrafts.asStateFlow()

    fun get(threadKey: String): String = mutableDrafts.value[threadKey].orEmpty()

    fun set(threadKey: String, text: String) {
        if (threadKey.isBlank()) return
        val current = mutableDrafts.value
        val existing = current[threadKey]
        if (text.isBlank()) {
            if (existing != null) mutableDrafts.value = current - threadKey
        } else if (existing != text) {
            mutableDrafts.value = current + (threadKey to text)
        }
    }

    fun clear(threadKey: String) {
        if (threadKey in mutableDrafts.value) {
            mutableDrafts.value = mutableDrafts.value - threadKey
        }
    }

    fun hasDraft(threadKey: String): Boolean = !mutableDrafts.value[threadKey].isNullOrBlank()
}
