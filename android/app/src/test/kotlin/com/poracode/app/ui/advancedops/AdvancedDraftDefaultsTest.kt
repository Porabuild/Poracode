package com.poracode.app.ui.advancedops

import org.junit.Assert.assertEquals
import org.junit.Test

class AdvancedDraftDefaultsTest {
    @Test
    fun generationActionsReceiveTheDeviceContentLanguage() {
        val draft = advancedDraftDefaults(AdvancedAction.GenerateCommitMessage, "Japanese")

        assertEquals("Japanese", draft.text(AdvancedField.Language))
    }

    @Test
    fun nonGenerationActionsDoNotReceiveAnUnrelatedLanguageField() {
        val draft = advancedDraftDefaults(AdvancedAction.CreateCheckpoint, "Japanese")

        assertEquals("", draft.text(AdvancedField.Language))
    }
}
