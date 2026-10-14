package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class RichQuestionAnswerPresentationTest {
    @Test
    fun resolvedQuestionRetainsItsQuestionAndSelectedAnswer() {
        val item = item("""{"questions":[{"header":"Test color","question":"Which color?","selected":[{"label":"Blue","description":"Use blue."}]}]}""")
        assertEquals("Test color\nWhich color?\nBlue\nUse blue.", RichChatUiLogic.itemText(item))
    }

    @Test
    fun multipleQuestionsAndCustomAnswersKeepTheirOrder() {
        val item = item("""{"questions":[{"header":"One","question":"Choose","selected":[{"label":"A"},{"label":"B"}]},{"header":"Two","question":"Explain","selected":[],"customAnswer":"日本語 answer"}]}""")
        assertEquals("One\nChoose\nA\nB\n\nTwo\nExplain\n日本語 answer", RichChatUiLogic.itemText(item))
    }

    private fun item(payload: String) = RichRuntimeItem(
        id = "answer",
        type = RichItemTypes.QUESTION_ANSWER,
        state = RichItemState.COMPLETED,
        payload = Json.parseToJsonElement(payload),
    )
}
