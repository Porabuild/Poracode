package com.poracode.app.ui.richchat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichNativeVisualDocumentTest {
    @Test
    fun parsesNativeVisualV2AndEvaluatesFormulaTree() {
        val json = """
            {
              "description": "Cost calculator",
              "inputs": [
                { "id": "users", "label": "Users", "min": 1, "max": 100, "step": 1, "value": 10 }
              ],
              "blocks": [
                {
                  "type": "outputs",
                  "title": "Summary",
                  "items": [
                    {
                      "label": "Total",
                      "value": { "op": "multiply", "args": [{ "input": "users" }, 5] },
                      "format": { "style": "currency", "currency": "USD" }
                    }
                  ]
                },
                {
                  "type": "checklist",
                  "items": [{ "id": "c1", "label": "Ship", "checked": true }]
                }
              ]
            }
        """.trimIndent()
        val doc = NativeVisualDocument.parse("poracode-visual-v2 Budget", json)
        assertNotNull(doc)
        assertEquals("Budget", doc!!.title)
        assertEquals(1, doc.inputs.size)
        assertEquals(2, doc.blocks.size)
        val outputs = doc.blocks[0] as NativeVisualDocument.Block.Outputs
        val total = outputs.items[0].value.evaluate(mapOf("users" to 12.0))
        assertEquals(60.0, total, 0.001)
    }

    @Test
    fun expandsInlineMathAndParsesTaskListItems() {
        val math = RichMathAndTaskHelper.expandInlineMath("Area is $\\pi r^2$ and $\\alpha \\le \\beta$.")
        assertTrue(math.contains("π"))
        assertTrue(math.contains("²"))
        assertTrue(math.contains("α ≤ β"))

        val checked = RichMathAndTaskHelper.parseListItem("  [x] Done item")
        assertEquals(1, checked.depth)
        assertEquals(true, checked.taskChecked)
        assertEquals("Done item", checked.text)

        val unchecked = RichMathAndTaskHelper.parseListItem("[ ] Todo item")
        assertEquals(0, unchecked.depth)
        assertEquals(false, unchecked.taskChecked)
        assertEquals("Todo item", unchecked.text)
    }
}
