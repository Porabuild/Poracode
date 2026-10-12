package com.poracode.app.ui.components

import com.poracode.app.model.RemoteJson
import com.poracode.app.model.ThreadConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Neutral toy relations — two selectors with holes, one family binding both
 * common controls to the member UID and one binding them to the saved config.
 * No provider payload appears anywhere in this suite; the algorithm must pass
 * without one.
 */
class ModelFamilySelectionTest {
    private companion object {
        val duoMembers = listOf(
            "duo-alpha-beta",
            "duo-alpha-beta-fast",
            "duo-alpha-beta-hi",
            "duo-bravo-beta",
            "duo-bravo-delta",
        )
        val pairMembers = listOf(
            "pair-charlie-beta",
            "pair-charlie-delta",
            "pair-echo-beta",
            "pair-echo-delta",
        )
        val accepted = listOf("solo") + duoMembers + pairMembers

        val duoFamilies = """
            [{
              "model":"duo-alpha-beta","label":"Duo",
              "selectors":[
                {"id":"lead","labelKey":"modelSelection.lead","options":[
                  {"id":"alpha","label":"Alpha"},{"id":"bravo","label":"Bravo"}]},
                {"id":"mate","labelKey":"modelSelection.sidekick","options":[
                  {"id":"beta","label":"Beta"},{"id":"delta","label":"Delta"}]}
              ],
              "bindings":{"effort":"model","fast":"model"},
              "members":[
                {"model":"duo-alpha-beta","selections":{"lead":"alpha","mate":"beta"},"effort":"low","fast":false},
                {"model":"duo-alpha-beta-fast","selections":{"lead":"alpha","mate":"beta"},"effort":"low","fast":true},
                {"model":"duo-alpha-beta-hi","selections":{"lead":"alpha","mate":"beta"},"effort":"high","fast":false},
                {"model":"duo-bravo-beta","selections":{"lead":"bravo","mate":"beta"},"effort":"low","fast":false},
                {"model":"duo-bravo-delta","selections":{"lead":"bravo","mate":"delta"},"effort":"low","fast":false}
              ]
            },{
              "model":"pair-charlie-beta","label":"Pair",
              "selectors":[
                {"id":"lead","labelKey":"modelSelection.lead","options":[
                  {"id":"charlie","label":"Charlie"},{"id":"echo","label":"Echo"}]},
                {"id":"mate","labelKey":"modelSelection.sidekick","options":[
                  {"id":"beta","label":"Beta"},{"id":"delta","label":"Delta"}]}
              ],
              "bindings":{"effort":"config","fast":"config"},
              "members":[
                {"model":"pair-charlie-beta","selections":{"lead":"charlie","mate":"beta"}},
                {"model":"pair-charlie-delta","selections":{"lead":"charlie","mate":"delta"}},
                {"model":"pair-echo-beta","selections":{"lead":"echo","mate":"beta"}},
                {"model":"pair-echo-delta","selections":{"lead":"echo","mate":"delta"}}
              ]
            }]
        """.trimIndent()

        fun families(payload: String = duoFamilies) =
            ProjectedModelFamilies.project(RemoteJson.parseToJsonElement(payload), accepted)
    }

    @Test
    fun collapsesRepresentedMembersIntoOneRowPerFamilyAndKeepsRawRows() {
        val rows = families().collapsePicker(accepted) { it }

        val kept = rows.filterIsInstance<FamilyPickerRow.Kept<*>>()
        val familyRows = rows.filterIsInstance<FamilyPickerRow.FamilyRow>()
        assertEquals(listOf("solo"), kept.map { it.option })
        assertEquals(listOf("Duo", "Pair"), familyRows.map { it.family.label })
        // The Duo row takes the representative's inventory position.
        assertEquals("duo-alpha-beta", familyRows.first().family.model)
        assertEquals(3, rows.size)
    }

    @Test
    fun invalidDescriptorsFallBackToTheRawInventory() {
        val dropped = families(
            """
            [
              {"model":"x","label":"X","selectors":[
                {"id":"lead","labelKey":"modelSelection.unknown","options":[{"id":"a","label":"A"}]}],
               "bindings":{"effort":"model","fast":"model"},
               "members":[{"model":"duo-alpha-beta","selections":{"lead":"a"},"effort":"low","fast":false}]}
            ]
            """.trimIndent(),
        )
        assertTrue(dropped.isEmpty)

        val duplicated = families(
            """
            [
              {"model":"duo-alpha-beta","label":"Duo","selectors":[
                {"id":"lead","labelKey":"modelSelection.lead","options":[{"id":"alpha","label":"Alpha"}]}],
               "bindings":{"effort":"model","fast":"model"},
               "members":[
                 {"model":"duo-alpha-beta","selections":{"lead":"alpha"},"effort":"low","fast":false},
                 {"model":"duo-alpha-beta-fast","selections":{"lead":"alpha"},"effort":"low","fast":false}
               ]}
            ]
            """.trimIndent(),
        )
        assertTrue(duplicated.isEmpty)
    }

    @Test
    fun membersOutsideTheAcceptedInventoryDisappearFromTheRelation() {
        val narrowed = ProjectedModelFamilies.project(
            RemoteJson.parseToJsonElement(duoFamilies),
            listOf("solo") + duoMembers,
        )
        // The Pair family lost every accepted member; Duo survives untouched.
        assertEquals(1, narrowed.families.size)
        assertEquals("Duo", narrowed.families.single().label)
        assertNull(narrowed.familyForModel("pair-charlie-beta"))

        val retiredDefault = ProjectedModelFamilies.project(
            RemoteJson.parseToJsonElement(duoFamilies),
            listOf("solo") + duoMembers.drop(1),
        )
        // A retired representative substitutes the first remaining member
        // inside the projection only.
        assertEquals("duo-alpha-beta-fast", retiredDefault.families.single().model)
    }

    @Test
    fun displayDerivesEncodedAxesFromTheMemberWithoutMeaningfulOverrides() {
        val projected = families()
        val member = projected.familyForModel("duo-alpha-beta-fast")!!
        val inert = ThreadConfig(model = "duo-alpha-beta-fast", effort = "", fast = false)
        assertTrue(projected.displayApplies(member, inert))
        assertEquals("low", projected.displayEffort(member, inert))
        // A raw Fast UID plus inert stored fast:false still displays Fast.
        assertEquals(true, projected.displayFast(member, inert))

        // Meaningful stored overrides keep the raw saved view.
        val meaningfulEffort = ThreadConfig(model = "duo-alpha-beta", effort = "high")
        val ref = projected.familyForModel("duo-alpha-beta")!!
        assertFalse(projected.displayApplies(ref, meaningfulEffort))
        assertEquals("high", projected.displayEffort(ref, meaningfulEffort))
        val meaningfulFast = ThreadConfig(model = "duo-alpha-beta", fast = true)
        assertFalse(projected.displayApplies(ref, meaningfulFast))

        // Config-bound families pass the saved carriers straight through.
        val pair = projected.familyForModel("pair-charlie-beta")!!
        val carriers = ThreadConfig(model = "pair-charlie-beta", effort = "low", fast = true)
        assertTrue(projected.displayApplies(pair, carriers))
        assertEquals("low", projected.displayEffort(pair, carriers))
        assertEquals(true, projected.displayFast(pair, carriers))
    }

    @Test
    fun familyRowClickPreservesTheActualSelectedMember() {
        val projected = families()
        val inside = ThreadConfig(model = "duo-bravo-beta", effort = "", fast = false)
        assertEquals(inside, projected.applyFamilyRowEdit(inside, "duo-alpha-beta"))
    }

    @Test
    fun familyRowPickAdoptsTheDeclaredDefaultAndOnlyRepresentativesCarryIt() {
        val projected = families()
        // A fresh family pick adopts the declared default member atomically.
        val outside = ThreadConfig(model = "solo", effort = "low", fast = true)
        val patched = projected.applyFamilyRowEdit(outside, "duo-alpha-beta")!!
        assertEquals("duo-alpha-beta", patched.model)
        assertEquals("", patched.effort)
        assertEquals(false, patched.fast)
        // Unrelated carriers are not erased as a side effect.
        assertEquals(outside.mode, patched.mode)

        // A family pick of another representative adopts that family's default;
        // its config-bound carriers are not touched.
        val other = projected.applyFamilyRowEdit(
            ThreadConfig(model = "duo-alpha-beta"),
            "pair-charlie-beta",
        )!!
        assertEquals("pair-charlie-beta", other.model)
        assertNull(other.effort)
        assertNull(other.fast)

        // Only representatives carry the family intent.
        assertNull(
            projected.applyFamilyRowEdit(ThreadConfig(model = "duo-alpha-beta"), "duo-bravo-beta"),
        )
        assertTrue(projected.isFamilyRow("duo-alpha-beta"))
        assertFalse(projected.isFamilyRow("duo-alpha-beta-hi"))
    }

    @Test
    fun exactPickSelectsTheExactRepresentativeNeverAFamilyNoOp() {
        val projected = families()
        // The favorite-of-representative case: High is selected and the exact
        // pick of the Medium representative restores that exact member.
        val exact = projected.applyModelEdit(
            ThreadConfig(model = "duo-alpha-beta-hi", effort = "", fast = false),
            "duo-alpha-beta",
        )!!
        assertEquals("duo-alpha-beta", exact.model)
        assertEquals("", exact.effort)
        assertEquals(false, exact.fast)

        // Even when the exact pick names the member already selected, a
        // deliberate click is still an edit and rewrites the inert seeds.
        val selected = projected.applyModelEdit(
            ThreadConfig(model = "duo-alpha-beta", effort = "", fast = false),
            "duo-alpha-beta",
        )!!
        assertEquals("duo-alpha-beta", selected.model)
        assertEquals("", selected.effort)
        assertEquals(false, selected.fast)

        // Config-bound families patch only the model, carriers untouched.
        val independent = projected.applyModelEdit(
            ThreadConfig(model = "pair-charlie-delta", effort = "low", fast = true),
            "pair-charlie-beta",
        )!!
        assertEquals("pair-charlie-beta", independent.model)
        assertEquals("low", independent.effort)
        assertEquals(true, independent.fast)
    }

    @Test
    fun selectorEditsResolveSingleAxisTuplesAndRefuseHoles() {
        val projected = families()
        val current = ThreadConfig(model = "duo-alpha-beta", effort = "", fast = false)

        val bravo = projected.applySelectorEdit(current, "lead", "bravo")!!
        assertEquals("duo-bravo-beta", bravo.model)
        assertEquals("", bravo.effort)
        assertEquals(false, bravo.fast)

        // (alpha, delta, low, false) has no member: the hole stays a hole.
        assertNull(projected.applySelectorEdit(current, "mate", "delta"))
        assertNull(projected.applySelectorEdit(current, "unknown", "alpha"))
        assertNull(projected.applySelectorEdit(ThreadConfig(model = "solo"), "lead", "bravo"))
    }

    @Test
    fun encodedEffortAndFastEditsResolveSingleAxisTuples() {
        val projected = families()
        val current = ThreadConfig(model = "duo-alpha-beta", effort = "", fast = false)

        assertEquals(
            "duo-alpha-beta-hi",
            projected.applyEffortEdit(current, "high")?.model,
        )
        assertEquals(
            "duo-alpha-beta-fast",
            projected.applyFastEdit(current, true)?.model,
        )
        assertEquals(
            "duo-alpha-beta",
            projected.applyFastEdit(ThreadConfig(model = "duo-alpha-beta-fast"), false)?.model,
        )

        // (alpha, beta, high, fast) and (alpha, beta, low+opposite on hi) are holes.
        assertNull(projected.applyEffortEdit(ThreadConfig(model = "duo-alpha-beta-fast"), "high"))
        assertNull(projected.applyFastEdit(ThreadConfig(model = "duo-alpha-beta-hi"), true))

        // Config-bound and non-family edits stay ordinary independent carriers.
        val pair = ThreadConfig(model = "pair-charlie-beta", effort = "low", fast = false)
        assertEquals(
            pair.copy(effort = "high"),
            projected.applyEffortEdit(pair, "high"),
        )
        assertEquals(pair.copy(fast = true), projected.applyFastEdit(pair, true))
        val solo = ThreadConfig(model = "solo", effort = "low")
        assertEquals(solo.copy(effort = "high"), projected.applyEffortEdit(solo, "high"))
    }

    @Test
    fun explicitFamilyEditsOverwriteInertSeedsButMeaningfulContextBlocksThem() {
        val projected = families()
        // A deliberate family edit intentionally replaces the encoded seeds
        // (explicit reset) — including a raw Fast state.
        val fastUid = ThreadConfig(model = "duo-alpha-beta-fast")
        val offFast = projected.applyFastEdit(fastUid, false)!!
        assertEquals("duo-alpha-beta", offFast.model)
        assertEquals("", offFast.effort)
        assertEquals(false, offFast.fast)

        // A meaningful stored effort is likewise overwritten by an explicit
        // edit, never silently kept beneath the resolved tuple.
        val meaningful = ThreadConfig(model = "duo-alpha-beta", effort = "high")
        val overwritten = projected.applySelectorEdit(meaningful, "lead", "bravo")!!
        assertEquals("duo-bravo-beta", overwritten.model)
        assertEquals("", overwritten.effort)
        assertEquals(false, overwritten.fast)

        // Meaningful thinking/context cannot ride beneath a resolved patch.
        assertNull(
            projected.applyModelEdit(
                ThreadConfig(model = "duo-alpha-beta", thinking = true),
                "duo-alpha-beta-hi",
            ),
        )
        assertNull(
            projected.applySelectorEdit(
                ThreadConfig(model = "duo-alpha-beta", contextSize = "long"),
                "lead",
                "bravo",
            ),
        )
        assertNull(
            projected.applyFastEdit(
                ThreadConfig(model = "duo-alpha-beta", contextSize = "long"),
                true,
            ),
        )
    }

    @Test
    fun rawModelEditsStayPlainPatchesAndUnknownIdsAreUnavailable() {
        val projected = families()
        val solo = ThreadConfig(model = "solo", effort = "low")
        assertEquals(solo.copy(model = "solo"), projected.applyModelEdit(solo, "solo"))
        assertNull(projected.applyModelEdit(solo, "not-in-inventory"))
    }

    @Test
    fun selectorMenusFilterToReachableCoordinatesAndDropSingleChoiceMenus() {
        val projected = families()
        val menus = projected.selectorMenus(
            projected.familyForModel("duo-alpha-beta")!!,
            ThreadConfig(model = "duo-alpha-beta"),
        )
        // The mate axis has no (alpha, delta, low, false) sibling, so only the
        // lead menu survives, filtered to its reachable options.
        assertEquals(listOf("lead"), menus.map { it.selectorId })
        assertEquals(listOf("alpha", "bravo"), menus.single().options.map { it.id })
        assertEquals("alpha", menus.single().selectionId)

        val pair = projected.familyForModel("pair-charlie-beta")!!
        val pairMenus = projected.selectorMenus(pair, ThreadConfig(model = "pair-charlie-beta"))
        assertEquals(listOf("lead", "mate"), pairMenus.map { it.selectorId })
    }

    @Test
    fun encodedLaddersAndFastAvailabilityFollowTheCurrentTuple() {
        val projected = families()
        val alphaBeta = projected.familyForModel("duo-alpha-beta")!!
        assertEquals(listOf("low", "high"), EffortOrder.sortIds(projected.encodedEfforts(alphaBeta)))
        assertTrue(projected.fastAvailable(alphaBeta))

        val high = projected.familyForModel("duo-alpha-beta-hi")!!
        assertTrue(projected.encodedEfforts(high).contains("high"))
        // No opposite-Fast sibling: the Fast control is unavailable.
        assertFalse(projected.fastAvailable(high))
    }

    @Test
    fun overlappingFamilyKeepsTheRawFallbackForTheLaterDescriptor() {
        val overlapping = ProjectedModelFamilies.project(
            RemoteJson.parseToJsonElement(
                """
                [
                  {"model":"duo-alpha-beta","label":"Duo","selectors":[
                    {"id":"lead","labelKey":"modelSelection.lead","options":[{"id":"alpha","label":"Alpha"}]}],
                   "bindings":{"effort":"model","fast":"model"},
                   "members":[{"model":"duo-alpha-beta","selections":{"lead":"alpha"},"effort":"low","fast":false}]},
                  {"model":"pair-charlie-beta","label":"Overlap","selectors":[
                    {"id":"lead","labelKey":"modelSelection.lead","options":[{"id":"alpha","label":"Alpha"}]}],
                   "bindings":{"effort":"model","fast":"model"},
                   "members":[{"model":"duo-alpha-beta","selections":{"lead":"alpha"},"effort":"low","fast":false}]}
                ]
                """.trimIndent(),
            ),
            listOf("duo-alpha-beta", "solo"),
        )
        assertEquals(1, overlapping.families.size)
        assertEquals("Duo", overlapping.families.single().label)
    }
}
