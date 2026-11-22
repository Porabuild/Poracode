package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichRuntimeItem
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatInspectorPolicyTest {
    @Test
    fun inspectorCapabilityAdaptsAcrossPhoneFoldableAndTablet() {
        val phone = RichChatInspectorCapability.resolve(widthDp = 412f, heightDp = 915f)
        assertFalse(phone.supportsInspector)
        assertFalse(phone.docksInspector)

        val foldable = RichChatInspectorCapability.resolve(widthDp = 673f, heightDp = 841f)
        assertTrue(foldable.supportsInspector)
        assertFalse(foldable.docksInspector)

        val tablet = RichChatInspectorCapability.resolve(widthDp = 1040f, heightDp = 800f)
        assertTrue(tablet.supportsInspector)
        assertTrue(tablet.docksInspector)
    }

    @Test
    fun tabLayoutSplitsOverflowWhenPanelIsNarrow() {
        val allTabs = RichChatRightPanelTab.entries
        val narrow = RichChatPanelTabLayout.split(allTabs, widthDp = 340f, reservesExpand = true)
        assertTrue(narrow.inline.size >= 2)
        assertEquals(allTabs.size, narrow.inline.size + narrow.overflow.size)

        val wide = RichChatPanelTabLayout.split(allTabs, widthDp = 440f, reservesExpand = false)
        assertTrue(wide.inline.size >= narrow.inline.size)
    }

    @Test
    fun composerDraftStorePersistsClearsAndTracksPresence() {
        val store = RichChatComposerDraftStore()
        assertFalse(store.hasDraft("conn:1"))
        store.set("conn:1", "hello world")
        assertTrue(store.hasDraft("conn:1"))
        assertEquals("hello world", store.get("conn:1"))
        store.set("conn:1", "   ")
        assertFalse(store.hasDraft("conn:1"))
        store.set("conn:2", "draft")
        store.clear("conn:2")
        assertFalse(store.hasDraft("conn:2"))
    }

    @Test
    fun findMatcherMatchesTextCaseInsensitively() {
        val items = listOf(
            RichRuntimeItem(
                id = "m1",
                type = "assistant_message",
                state = RichItemState.COMPLETED,
                streams = mapOf("assistant_text" to "Hello Poracode World"),
            ),
            RichRuntimeItem(
                id = "m2",
                type = "assistant_message",
                state = RichItemState.COMPLETED,
                streams = mapOf("assistant_text" to "Unrelated line"),
            ),
        )
        assertEquals(listOf("m1"), RichChatFindMatcher.matchingItemIds(items, "poracode"))
        assertEquals(emptyList<String>(), RichChatFindMatcher.matchingItemIds(items, "   "))
    }
}
