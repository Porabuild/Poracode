package com.poracode.app.ui.richchat

import com.poracode.app.model.GitStateJsonAdapter
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteSessionConfigOption
import com.poracode.app.model.RemoteSessionConfigSelectGroup
import com.poracode.app.model.RemoteSessionConfigSelectValue
import com.poracode.app.model.ThreadConfig
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Live ACP session controls overlaying the existing rich-chat composer catalog:
 * the negotiated ladder wins only for the model the native session actually
 * negotiated (a missing selector included — authoritative empty), retirement
 * and absence fall back to the static snapshot, empty selects are valid empty
 * inventory, wrong control types stay unprojected, and booleans never drive
 * the toggles.
 */
class RichChatLiveSessionControlsTest {
    @Test
    fun liveFiveStepEffortLadderReplacesStaticThreeOnlyForTheNativeModel() {
        val status = status(staticThreeEffortCapabilities())
        val live = RichChatLiveSessionControls.from(
            listOf(
                select(
                    role = "model",
                    currentValue = "fusion-alpha",
                    values = listOf(value("fusion-alpha"), value("fusion-beta")),
                ),
                select(
                    role = "effort",
                    currentValue = "low",
                    values = listOf(
                        value("low", "Low"),
                        value("medium", "Medium"),
                        value("high", "High"),
                        value("xhigh", "XHigh"),
                        value("max", "Max"),
                    ),
                ),
            ),
        )
        val catalog = RichChatComposerControlCatalog(
            status,
            ThreadConfig(model = "fusion-alpha", effort = "low"),
            live = live,
        )

        // The Fusion repro: live ladder carries all five native tiers, not the static three.
        assertEquals(
            listOf("low", "medium", "high", "xhigh", "max"),
            catalog.effortOptions("fusion-alpha").map { it.id },
        )
        assertEquals("Low", catalog.effortLabel("fusion-alpha", "low"))
        // Unprobed-model static ladder is untouched for any other model.
        assertEquals(
            listOf("medium", "high", "max"),
            catalog.effortOptions("fusion-beta").map { it.id },
        )
        // Five tiers render as a menu, not a segmented row.
        assertFalse(usesSegmentedComposerChoice(catalog.effortOptions("fusion-alpha")))
    }

    @Test
    fun optimisticModelSwitchKeepsStaticLadderUntilNativeInventoryConfirms() {
        val status = status(staticThreeEffortCapabilities())
        val live = RichChatLiveSessionControls.from(
            listOf(
                select(
                    role = "model",
                    currentValue = "fusion-alpha",
                    values = listOf(value("fusion-alpha"), value("fusion-beta")),
                ),
                select(
                    role = "effort",
                    currentValue = "low",
                    values = listOf(
                        value("low"),
                        value("medium"),
                        value("high"),
                        value("xhigh"),
                        value("max"),
                    ),
                ),
            ),
        )
        val catalog = RichChatComposerControlCatalog(
            status,
            ThreadConfig(model = "fusion-alpha", effort = "low"),
            live = live,
        )

        // Alpha's native five-step ladder must not follow the optimistic draft
        // onto Beta; Beta keeps the static ladder (with its own default) until
        // a confirmed native Beta inventory arrives.
        val switched = catalog.applyModel(
            ThreadConfig(model = "fusion-alpha", effort = "low"),
            "fusion-beta",
        )
        assertEquals("fusion-beta", switched.model)
        assertEquals(
            listOf("medium", "high", "max"),
            catalog.effortOptions(switched.model).map { it.id },
        )
        assertEquals("medium", switched.effort)
        // Selecting back onto the native current model restores the live ladder.
        assertEquals(
            listOf("low", "medium", "high", "xhigh", "max"),
            catalog.effortOptions("fusion-alpha").map { it.id },
        )
    }

    @Test
    fun liveModelMenuProjectsExactIdsNativeLabelsAndDeclaredGroups() {
        val status = status(staticThreeEffortCapabilities())
        val live = RichChatLiveSessionControls.from(
            listOf(
                select(
                    role = "model",
                    currentValue = "fusion-alpha",
                    name = "Session model",
                    values = listOf(
                        value("fusion-alpha", "Fusion Alpha", group = "fusion"),
                        value("fusion-beta", "Fusion Beta", group = "fusion"),
                        value("solo", "Solo", group = "solo"),
                        value("unassigned"),
                    ),
                    groups = listOf(
                        RemoteSessionConfigSelectGroup("fusion", "Fusion Pairs"),
                        RemoteSessionConfigSelectGroup("solo", "solo"),
                    ),
                ),
            ),
        )
        val catalog = RichChatComposerControlCatalog(
            status,
            ThreadConfig(model = "fusion-alpha"),
            live = live,
        )

        // Exact live ids only; the native labels are payload content.
        assertEquals(
            listOf("fusion-alpha", "fusion-beta", "solo", "unassigned"),
            catalog.models.map { it.id },
        )
        assertEquals("Fusion Alpha", catalog.modelLabel("fusion-alpha"))
        // Ungrouped lead, then groups in declared order; the singleton group
        // whose heading restates its model drops the heading.
        assertEquals(
            listOf(
                "M:unassigned",
                "H:fusion:Fusion Pairs",
                "M:fusion-alpha",
                "M:fusion-beta",
                "M:solo",
            ),
            catalog.modelEntries.projected(),
        )
        // Only exact live ids are offered; the stale static pair id never leaks in.
        assertFalse(catalog.models.any { it.id == "static-model" })
    }

    @Test
    fun absentOrRetiredInventoryKeepsTheStaticCatalogEverywhere() {
        val status = status(staticThreeEffortCapabilities())
        val configuration = ThreadConfig(model = "static-model", effort = "high")

        val plain = RichChatComposerControlCatalog(status, configuration)
        val absent = RichChatComposerControlCatalog(status, configuration, live = null)
        val retired = RichChatComposerControlCatalog(
            status,
            configuration,
            live = RichChatLiveSessionControls.from(null),
        )
        val overallEmpty = RichChatComposerControlCatalog(
            status,
            configuration,
            live = RichChatLiveSessionControls.from(emptyList()),
        )

        assertEquals(plain.models.map { it.id }, absent.models.map { it.id })
        assertEquals(plain.effortOptions("static-model"), absent.effortOptions("static-model"))
        assertEquals(plain.modes, absent.modes)
        // A retired inventory decodes to null controls — indistinguishable from absence.
        assertEquals(plain.models.map { it.id }, retired.models.map { it.id })
        assertEquals(plain.effortOptions("static-model"), retired.effortOptions("static-model"))
        // An overall empty inventory carries no native model id, so the
        // static/legacy declared controls stand — observed-empty metadata stays
        // distinct from a missing or retired inventory.
        assertEquals(plain.models.map { it.id }, overallEmpty.models.map { it.id })
        assertEquals(plain.effortOptions("static-model"), overallEmpty.effortOptions("static-model"))
        assertEquals(plain.modes, overallEmpty.modes)
    }

    @Test
    fun emptyNativeInventoryIsAuthoritativeAndOverlaysNothing() {
        val live = RichChatLiveSessionControls.from(emptyList())

        // The retained inventory is honestly empty (non-null), so the composer
        // can tell a real "no controls" session from an old host — but with no
        // recognized controls there is nothing live to overlay either.
        org.junit.Assert.assertNotNull(live)
        assertNull(live!!.model)
        assertNull(live.effort)
        assertNull(live.context)
        assertFalse(live.fastSupported)
        assertFalse(live.thinkingSupported)
    }

    @Test
    fun emptySelectorAndMissingEffortSelectorAreAuthoritativeEmptyForTheNativeModel() {
        val status = status(staticThreeEffortCapabilities())
        val noEffortDescriptor = RichChatLiveSessionControls.from(
            listOf(
                select(
                    role = "model",
                    currentValue = "fusion-alpha",
                    values = listOf(value("fusion-alpha"), value("fusion-beta")),
                ),
            ),
        )
        val emptyLadder = RichChatLiveSessionControls.from(
            listOf(
                select(
                    role = "model",
                    currentValue = "fusion-alpha",
                    values = listOf(value("fusion-alpha"), value("fusion-beta")),
                ),
                select(role = "effort", currentValue = "low", values = emptyList()),
            ),
        )
        val catalog = RichChatComposerControlCatalog(
            status,
            ThreadConfig(model = "fusion-alpha", effort = "low"),
            live = noEffortDescriptor,
        )
        val emptyLadderCatalog = RichChatComposerControlCatalog(
            status,
            ThreadConfig(model = "fusion-alpha", effort = "low"),
            live = emptyLadder,
        )

        // A known native model makes its effort selector authoritative: a
        // missing selector or empty values mean no ladder for that model —
        // no static fallback, no default effort.
        assertEquals(emptyList<RichChatComposerOption>(), catalog.effortOptions("fusion-alpha"))
        assertEquals(emptyList<RichChatComposerOption>(), emptyLadderCatalog.effortOptions("fusion-alpha"))
        assertNull(
            catalog.applyModel(ThreadConfig(model = "fusion-alpha", effort = "low"), "fusion-alpha")
                .effort,
        )
        assertNull(
            emptyLadderCatalog
                .applyModel(ThreadConfig(model = "fusion-alpha", effort = "low"), "fusion-alpha")
                .effort,
        )
        // An optimistic pick of another model keeps the static ladder untouched.
        assertEquals(
            listOf("medium", "high", "max"),
            catalog.effortOptions("fusion-beta").map { it.id },
        )
    }

    @Test
    fun wrongTypeDescriptorsStayUnprojectedAndBooleansNeverDriveToggles() {
        val live = RichChatLiveSessionControls.from(
            listOf(
                // Wrong control type for the role — never a faithful control.
                boolDescriptor(role = "model", currentValue = null),
                boolDescriptor(role = "effort", currentValue = true),
                boolDescriptor(role = "context", currentValue = null),
                boolDescriptor(role = "mode", currentValue = true),
                // Booleans are observation-only: even a well-tagged fast/thinking
                // boolean from a bad host never drives the toggles.
                boolDescriptor(role = "fast", currentValue = true),
                boolDescriptor(role = "thinking", currentValue = false),
                // Unrecognized role and control type stay inventory-only.
                RemoteSessionConfigOption(
                    type = "slider",
                    id = "custom",
                    role = "custom-role",
                    currentValue = null,
                ),
            ),
        )

        assertNull(live!!.model)
        assertNull(live.effort)
        assertNull(live.context)
        assertFalse(live.fastSupported)
        assertFalse(live.thinkingSupported)
    }

    @Test
    fun emptyValueEntriesAreValidChoicesAndNotDropped() {
        val live = RichChatLiveSessionControls.from(
            listOf(
                select(
                    role = "model",
                    currentValue = "fusion-alpha",
                    values = listOf(value("fusion-alpha", "Fusion Alpha"), value("")),
                ),
            ),
        )
        val catalog = RichChatComposerControlCatalog(
            status(staticThreeEffortCapabilities()),
            ThreadConfig(model = "fusion-alpha"),
            live = live,
        )

        // An empty value id is a valid advertised choice, not a parse defect.
        assertEquals(listOf("fusion-alpha", ""), live!!.model!!.options.map { it.id })
        assertEquals(listOf("fusion-alpha", ""), catalog.models.map { it.id })
    }

    @Test
    fun liveEffortLadderCanonicalizesAliasesAndSortsWeakestToStrongest() {
        val live = RichChatLiveSessionControls.from(
            listOf(
                select(
                    role = "effort",
                    currentValue = "Extra-High",
                    values = listOf(
                        value("xhigh", "XHigh"),
                        value("low", "Low"),
                        value("extra-high", "Extra High"),
                        value("none", "None"),
                        value("on"),
                    ),
                ),
            ),
        )

        // Alias collapses onto xhigh; unknown tier keeps discovery order after
        // the known ladder; the native current value canonicalizes with them.
        assertEquals(
            listOf("none", "low", "xhigh", "on"),
            live!!.effort!!.options.map { it.id },
        )
        assertEquals("xhigh", live.effort!!.currentValue)
        assertEquals(listOf("None", "Low", "XHigh", "On"), live.effort!!.options.map { it.label })
    }

    @Test
    fun selectBackedTogglesScopeToTheNativeModelAndFallBackToStaticElsewhere() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[{"id":"static-model","label":"Static"}],
                "efforts":["medium","high","max"],
                "fastModels":["static-model"]
              }
            }
            """,
        )
        val live = RichChatLiveSessionControls.from(
            listOf(
                select(
                    role = "model",
                    currentValue = "live-alpha",
                    values = listOf(value("live-alpha"), value("live-beta")),
                ),
                select(
                    role = "fast",
                    currentValue = "on",
                    values = listOf(value("on"), value("off")),
                ),
                boolDescriptor(role = "thinking", currentValue = false),
            ),
        )
        val catalog = RichChatComposerControlCatalog(
            status,
            ThreadConfig(model = "live-alpha", fast = true, thinking = true),
            live = live,
        )

        // The select-backed fast control exists for the negotiated model…
        assertTrue(catalog.supportsFast("live-alpha"))
        // …whose toggle truth stays the current ThreadConfig boolean, never the
        // select's native value ids…
        assertTrue(catalog.normalize(ThreadConfig(model = "live-alpha", fast = true)).fast == true)
        assertFalse(catalog.normalize(ThreadConfig(model = "live-alpha", fast = false)).fast == true)
        // …while the boolean thinking descriptor is ignored, clearing the toggle
        // for the native model instead of faking support.
        assertFalse(catalog.supportsThinking("live-alpha"))
        // Other models keep the static membership truth.
        assertTrue(catalog.supportsFast("static-model"))
        assertFalse(catalog.supportsThinking("static-model"))
        assertFalse(catalog.supportsFast("live-beta"))
        assertFalse(catalog.supportsThinking("live-beta"))
    }

    @Test
    fun nativeModeTagsNeverReplaceTheStaticModeEnum() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{"modes":["agent","plan"],"efforts":["high"]}
            }
            """,
        )
        val live = RichChatLiveSessionControls.from(
            listOf(
                // Provider approval-policy vocabulary, not ThreadConfig.mode ids.
                select(
                    role = "mode",
                    currentValue = "smart",
                    values = listOf(
                        value("smart", "Smart"),
                        value("bypass", "Bypass"),
                        value("ask", "Ask"),
                    ),
                ),
                boolDescriptor(role = "mode", currentValue = true),
            ),
        )
        val catalog = RichChatComposerControlCatalog(
            status,
            ThreadConfig(model = "default", mode = "plan"),
            live = live,
        )

        // The static mode enum stands until the host ships a binding mapping;
        // native mode ids never leak into the mode options or the saved config.
        assertEquals(listOf("agent", "plan"), catalog.modes.map { it.id })
        assertEquals(
            "plan",
            catalog.normalize(ThreadConfig(model = "default", mode = "plan")).mode,
        )
    }

    // -- helpers --

    /** Static three-tier snapshot standing in for the bounded detection probe. */
    private fun staticThreeEffortCapabilities(): String = """
        {
          "kind":"provider","label":"Provider","installed":true,
          "authState":"authenticated","envKind":"posix",
          "capabilities":{
            "models":[{"id":"static-model","label":"Static"}],
            "efforts":["medium","high","max"],
            "defaultEffort":"medium"
          }
        }
    """

    private fun select(
        role: String,
        currentValue: String?,
        name: String? = null,
        values: List<RemoteSessionConfigSelectValue> = emptyList(),
        groups: List<RemoteSessionConfigSelectGroup> = emptyList(),
    ) = RemoteSessionConfigOption(
        type = "select",
        id = role,
        name = name,
        role = role,
        currentValue = currentValue?.let { kotlinx.serialization.json.JsonPrimitive(it) },
        values = values,
        groups = groups,
    )

    private fun value(
        id: String,
        name: String? = null,
        group: String? = null,
    ) = RemoteSessionConfigSelectValue(
        value = id,
        name = name,
        group = group,
    )

    private fun boolDescriptor(role: String, currentValue: Boolean?) = RemoteSessionConfigOption(
        type = "boolean",
        id = role,
        role = role,
        currentValue = currentValue?.let { kotlinx.serialization.json.JsonPrimitive(it) },
    )

    private fun List<RichChatComposerModelEntry>.projected(): List<String> = map { entry ->
        when (entry) {
            is RichChatComposerModelEntry.Heading -> "H:${entry.groupId}:${entry.label}"
            is RichChatComposerModelEntry.Model -> "M:${entry.option.id}"
        }
    }

    private fun status(raw: String) = GitStateJsonAdapter.decodeAgentStatus(
        RemoteJson.parseToJsonElement(raw) as JsonObject,
    ) ?: error("fixture did not decode")
}
