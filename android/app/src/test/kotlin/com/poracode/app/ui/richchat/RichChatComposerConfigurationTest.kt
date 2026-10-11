package com.poracode.app.ui.richchat

import com.poracode.app.model.GitStateJsonAdapter
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.ThreadConfig
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatComposerConfigurationTest {
    @Test
    fun guiCapabilityCatalogDrivesSafeModelDependentConfiguration() {
        val status = status(
            """
            {
              "kind":"codex","label":"Codex","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[{"id":"terminal-model","label":"Terminal"}],
                "presentationCapabilities":{"gui":{
                  "models":[
                    {"id":"gui-a","label":"GUI A"},
                    {"id":"gui-b","label":"GUI B"}
                  ],
                  "efforts":["low","high"],
                  "modelEfforts":{"gui-a":["low"],"gui-b":["high"]},
                  "defaultEffort":"high",
                  "contextSizes":["short","long"],
                  "modelContextSizes":{"gui-a":["short"],"gui-b":["long"]},
                  "fastModels":["gui-a"],
                  "thinkingModels":["gui-b"]
                }},
                "modes":["agent","plan"],
                "approvalPolicies":["default","never"]
              }
            }
            """,
        )
        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "gui-a"))

        assertEquals(listOf("gui-a", "gui-b"), catalog.models.map { it.id })
        assertEquals(listOf("low"), catalog.effortOptions("gui-a").map { it.id })
        assertEquals(listOf("long"), catalog.contextOptions("gui-b").map { it.id })
        assertEquals(listOf("agent", "plan"), catalog.modes.map { it.id })
        assertEquals(listOf("default", "never"), catalog.approvalPolicies.map { it.id })
        assertTrue(catalog.supportsFast("gui-a"))
        assertFalse(catalog.supportsFast("gui-b"))

        val changed = catalog.applyModel(
            ThreadConfig(
                model = "gui-a",
                effort = "low",
                contextSize = "short",
                fast = true,
                thinking = false,
            ),
            "gui-b",
        )
        assertEquals("gui-b", changed.model)
        assertEquals("high", changed.effort)
        assertEquals("long", changed.contextSize)
        assertFalse(changed.fast == true)
        assertTrue(changed.thinking == true)

        val normalized = catalog.normalize(
            ThreadConfig(
                model = "gui-a",
                effort = "future",
                contextSize = "future",
                fast = true,
                thinking = true,
                mode = "future",
                approvalPolicy = "future",
            ),
        )
        assertEquals("low", normalized.effort)
        assertEquals("short", normalized.contextSize)
        assertEquals("agent", normalized.mode)
        assertEquals("default", normalized.approvalPolicy)
        assertTrue(normalized.fast == true)
        assertFalse(normalized.thinking == true)
    }

    @Test
    fun selectedGuiRuntimeVariantReplacesBroadCapabilities() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{"runtimeLabel":"acp","models":[{"id":"broad"}]},
              "runtimeVariants":{"acp":{
                "presentationMode":"gui",
                "capabilities":{"models":[{"id":"specific","label":"Specific"}]}
              }}
            }
            """,
        )

        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "specific"))

        assertEquals(listOf("specific"), catalog.models.map { it.id })
        assertEquals("Specific", catalog.modelLabel("specific"))
    }

    @Test
    fun serverRefreshUpdatesOnlyAnUneditedComposerConfiguration() {
        val original = ThreadConfig(model = "model-a", effort = "low")
        val refreshed = ThreadConfig(model = "model-b", effort = "high")
        val edited = original.copy(fast = true)

        assertEquals(
            refreshed,
            synchronizeComposerConfiguration(original, original, refreshed),
        )
        assertEquals(
            edited,
            synchronizeComposerConfiguration(edited, original, refreshed),
        )
    }

    @Test
    fun compactComposerUsesSegmentsOnlyForShortChoiceLists() {
        assertTrue(
            usesSegmentedComposerChoice(
                listOf(
                    RichChatComposerOption("agent", "Agent"),
                    RichChatComposerOption("plan", "Plan"),
                ),
            ),
        )
        assertFalse(
            usesSegmentedComposerChoice(
                listOf(
                    RichChatComposerOption("one", "One"),
                    RichChatComposerOption("two", "Two"),
                    RichChatComposerOption("three", "Three"),
                    RichChatComposerOption("four", "Four"),
                ),
            ),
        )
    }

    @Test
    fun currentModelRemainsSelectableWhenHostDoesNotAdvertiseIt() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix","capabilities":{}
            }
            """,
        )

        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "custom-model"))

        assertEquals(listOf("custom-model"), catalog.models.map { it.id })
        assertEquals("Custom Model", catalog.modelLabel("custom-model"))
        assertEquals("GPT 5", catalog.modelLabel("gpt-5"))
        assertTrue(status.capabilities.isEmpty())
        assertTrue(status.raw.containsKey("capabilities"))
    }

    @Test
    fun slashCommandsExposeSkillMetadataAndFilterByDraft() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{"slashCommands":[
                {"id":"review","label":"Review code","description":"Review the change"},
                {"id":"skill:docs","label":"Docs skill","section":"skills",
                 "skillName":"docs","skillInvocation":"${'$'}docs","skillProvider":"built-in",
                 "skillScope":"global"}
              ]}
            }
            """,
        )
        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "default"))

        assertEquals(listOf("review", "docs"), catalog.slashCommands.map { it.displayId })
        assertEquals(listOf("docs"), catalog.slashSuggestions("/doc").map { it.displayId })
        assertEquals("\$docs", catalog.slashCommands.last().skill?.invocation)
        assertTrue(catalog.slashSuggestions("plain").isEmpty())
    }

    @Test
    fun groupedModelCapabilitiesProjectHeadingsInDeclaredOrder() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[
                  {"id":"adaptive","label":"Adaptive"},
                  {"id":"claude-opus-4-5","label":"Claude Opus 4.5"},
                  {"id":"claude-opus-4-5-thinking","label":"Claude Opus 4.5 Thinking"},
                  {"id":"swe-2-high","label":"SWE-2"},
                  {"id":"fusion-a","label":"Fusion (A + B)"},
                  {"id":"fusion-b","label":"Fusion (C + D)"}
                ],
                "subProviders":[
                  {"id":"adaptive","label":"Adaptive"},
                  {"id":"claude-opus-4-5","label":"Claude Opus 4.5"},
                  {"id":"swe-2","label":"SWE-2"}
                ],
                "modelSubProvider":{
                  "adaptive":"adaptive",
                  "claude-opus-4-5":"claude-opus-4-5",
                  "claude-opus-4-5-thinking":"claude-opus-4-5",
                  "swe-2-high":"swe-2",
                  "fusion-a":"fusion",
                  "fusion-b":"fusion"
                }
              }
            }
            """,
        )
        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "adaptive"))

        assertEquals(
            listOf(
                // Singleton whose heading merely restates its model: heading suppressed, model kept.
                "M:adaptive",
                // Multi-member group keeps its heading even though one member restates the label.
                "H:claude-opus-4-5:Claude Opus 4.5",
                "M:claude-opus-4-5",
                "M:claude-opus-4-5-thinking",
                "M:swe-2-high",
                // Undeclared group appended last by first appearance, label humanized.
                "H:fusion:Fusion",
                "M:fusion-a",
                "M:fusion-b",
            ),
            catalog.modelEntries.projected(),
        )
        // The flat projection behind the menu is untouched: order and label lookups preserved.
        assertEquals(
            listOf(
                "adaptive",
                "claude-opus-4-5",
                "claude-opus-4-5-thinking",
                "swe-2-high",
                "fusion-a",
                "fusion-b",
            ),
            catalog.models.map { it.id },
        )
        assertEquals("SWE-2", catalog.modelLabel("swe-2-high"))
    }

    @Test
    fun flatModelMenuProjectsWithoutHeadings() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{"models":[
                {"id":"alpha","label":"Alpha"},
                {"id":"beta","label":"Beta"}
              ]}
            }
            """,
        )
        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "alpha"))

        assertEquals(listOf("M:alpha", "M:beta"), catalog.modelEntries.projected())
    }

    @Test
    fun namespacePrefixDerivesGroupsWhenNoExplicitMapping() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[
                  {"id":"other","label":"Other"},
                  {"id":"kimi-code/one","label":"Kimi One"},
                  {"id":"kimi-code:two","label":"Kimi Two"},
                  {"id":"vendor/one","label":"Vendor One"}
                ],
                "subProviders":[{"id":"declared","label":"Declared"}],
                "modelSubProvider":{"vendor/one":"declared"}
              }
            }
            """,
        )
        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "other"))

        // Ungrouped leads; declared groups render before derived ones; the / and : namespace
        // prefixes share one derived group; an explicit mapping beats the namespace fallback
        // ("vendor/one" joins the declared group).
        assertEquals(
            listOf(
                "M:other",
                "H:declared:Declared",
                "M:vendor/one",
                "H:kimi-code:Kimi Code",
                "M:kimi-code/one",
                "M:kimi-code:two",
            ),
            catalog.modelEntries.projected(),
        )
    }

    @Test
    fun singletonHeadingSuppressesOnlyRestatedLabels() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[
                  {"id":"premium-flagship","label":"GPT X"},
                  {"id":"solo-model","label":"Solo"}
                ],
                "subProviders":[
                  {"id":"premium","label":"Premium"},
                  {"id":"solo","label":" SOLO "}
                ],
                "modelSubProvider":{"premium-flagship":"premium","solo-model":"solo"}
              }
            }
            """,
        )
        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "premium-flagship"))

        // "Premium" adds information above "GPT X" so it stays; " SOLO " restates its sole
        // model's label (ignoring case and surrounding whitespace) so only the model renders.
        assertEquals(
            listOf(
                "H:premium:Premium",
                "M:premium-flagship",
                "M:solo-model",
            ),
            catalog.modelEntries.projected(),
        )
    }

    @Test
    fun groupedMenuKeepsSelectionAndSearchControlsWorking() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[
                  {"id":"custom-model","label":"Custom Model"},
                  {"id":"g1-member","label":"G1 Member"}
                ],
                "subProviders":[{"id":"g1","label":"G1"}],
                "modelSubProvider":{"g1-member":"g1"},
                "efforts":["low","high"],
                "modelEfforts":{"g1-member":["low","high"]},
                "defaultEffort":"low",
                "slashCommands":[{"id":"docs","label":"Docs"}]
              }
            }
            """,
        )
        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "custom-model"))

        // An unadvertised current model is still selectable and leads the grouped menu.
        assertEquals(
            listOf("M:custom-model", "H:g1:G1", "M:g1-member"),
            catalog.modelEntries.projected(),
        )
        val changed = catalog.applyModel(ThreadConfig(model = "custom-model"), "g1-member")
        assertEquals("g1-member", changed.model)
        assertEquals("low", changed.effort)
        // Slash-command search filtering is untouched by the grouping.
        assertEquals(listOf("docs"), catalog.slashSuggestions("/doc").map { it.displayId })
        assertTrue(catalog.slashSuggestions("plain").isEmpty())
    }

    private fun List<RichChatComposerModelEntry>.projected(): List<String> = map { entry ->
        when (entry) {
            is RichChatComposerModelEntry.Heading -> "H:${entry.groupId}:${entry.label}"
            is RichChatComposerModelEntry.Model -> "M:${entry.option.id}"
        }
    }

    @Test
    fun guiFamilyRelationCollapsesRowsAndPatchesOnlyTheModel() {
        val status = status(guiFamilyStatus)
        val carriers = ThreadConfig(
            model = "pair-charlie-beta",
            effort = "low",
            contextSize = "short",
            fast = true,
            thinking = false,
        )
        val catalog = RichChatComposerControlCatalog(status, carriers)

        // Four pair rows collapse into one labeled family row.
        assertEquals(
            listOf("solo", "pair-charlie-beta"),
            catalog.models.map { it.id },
        )
        assertEquals("Pair", catalog.modelLabel("pair-echo-delta"))
        assertEquals("pair-charlie-beta", catalog.displaySelectionId(carriers))

        // Both selector menus render with distinct reachable options.
        val menus = catalog.selectorMenus(carriers)
        assertEquals(listOf("lead", "mate"), menus.map { it.selectorId })
        assertEquals(
            listOf("modelSelection.lead", "modelSelection.sidekick"),
            menus.map { it.labelKey },
        )
        assertEquals(listOf("charlie", "echo"), menus.first().options.map { it.id })

        // Lead/Sidekick edits patch only the model; independent carriers stay.
        assertEquals(
            carriers.copy(model = "pair-echo-beta"),
            catalog.applySelector(carriers, "lead", "echo"),
        )
        assertEquals(
            carriers.copy(model = "pair-charlie-delta"),
            catalog.applySelector(carriers, "mate", "delta"),
        )
        assertEquals(
            carriers.copy(model = "pair-echo-beta"),
            catalog.applyModel(carriers, "pair-echo-beta"),
        )
        // Inside the family, the row click keeps the actual selected pair.
        assertEquals(carriers, catalog.applyModel(carriers, "pair-charlie-beta"))

        // Effort/Fast remain the ordinary independent native carriers.
        assertEquals(carriers.copy(effort = "high"), catalog.applyEffort(carriers, "high"))
        assertEquals(carriers.copy(fast = false), catalog.applyFast(carriers, false))
        assertTrue(catalog.supportsFast("solo"))
        assertTrue(catalog.displayFast(carriers) == true)
        assertEquals("low", catalog.displayEffort(carriers))
    }

    @Test
    fun liveInventoryNarrowsTheRelationAndRetiredCurrentStaysRaw() {
        val live = RichChatLiveSessionControls(
            model = RichChatLiveSessionSelect(
                currentValue = "pair-charlie-beta",
                options = listOf(
                    RichChatComposerOption("pair-charlie-beta", "Charlie + Beta"),
                    RichChatComposerOption("solo", "Solo"),
                ),
                valueGroups = emptyMap(),
                groupLabels = emptyMap(),
            ),
            effort = null,
            context = null,
            fastSupported = false,
            thinkingSupported = false,
        )
        val catalog = RichChatComposerControlCatalog(
            status(guiFamilyStatus),
            ThreadConfig(model = "pair-charlie-beta"),
            live = live,
        )

        // Only live-accepted members survive the intersection.
        assertEquals(listOf("pair-charlie-beta", "solo"), catalog.models.map { it.id })
        assertTrue(catalog.selectorMenus(ThreadConfig(model = "pair-echo-beta")).isEmpty())

        // A retired current family member keeps its raw leading row and loses
        // family semantics instead of being re-parented or substituted.
        val retired = RichChatComposerControlCatalog(
            status(guiFamilyStatus),
            ThreadConfig(model = "pair-echo-delta"),
            live = live,
        )
        assertEquals(
            listOf("pair-echo-delta", "pair-charlie-beta", "solo"),
            retired.models.map { it.id },
        )
        assertTrue(retired.selectorMenus(ThreadConfig(model = "pair-echo-delta")).isEmpty())
    }

    @Test
    fun guiOverrideWithoutFamiliesKeepsRawRowsDespiteRootRelation() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[{"id":"member-a","label":"Member A"}],
                "modelFamilies":[$pairRelation],
                "presentationCapabilities":{"gui":{
                  "models":[
                    {"id":"member-a","label":"Member A"},
                    {"id":"member-b","label":"Member B"}
                  ]
                }}
              }
            }
            """,
        )
        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "member-a"))

        assertEquals(listOf("member-a", "member-b"), catalog.models.map { it.id })
        assertTrue(catalog.selectorMenus(ThreadConfig(model = "member-a")).isEmpty())
    }

    private val pairRelation = """
        {"model":"pair-charlie-beta","label":"Pair","selectors":[
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
         ]}
    """.trimIndent()

    private val guiFamilyStatus =
        """
        {
          "kind":"provider","label":"Provider","installed":true,
          "authState":"authenticated","envKind":"posix",
          "capabilities":{
            "models":[{"id":"root-model","label":"Root"}],
            "presentationCapabilities":{"gui":{
              "models":[
                {"id":"solo","label":"Solo"},
                {"id":"pair-charlie-beta","label":"Charlie + Beta"},
                {"id":"pair-charlie-delta","label":"Charlie + Delta"},
                {"id":"pair-echo-beta","label":"Echo + Beta"},
                {"id":"pair-echo-delta","label":"Echo + Delta"}
              ],
              "efforts":["low","high"],
              "fastModels":["solo"],
              "modelFamilies":[$pairRelation]
            }}
          }
        }
        """.trimIndent()

    private val hiddenDefaultsStatus = status(
        """
        {
          "kind":"provider","label":"Provider","installed":true,
          "authState":"authenticated","envKind":"posix",
          "capabilities":{"presentationCapabilities":{"gui":{
            "models":[
              {"id":"recommended","label":"Recommended"},
              {"id":"retired-a","label":"Retired A"},
              {"id":"retired-b","label":"Retired B"},
              {"id":"kept","label":"Kept"}
            ],
            "efforts":["low"],
            "modelEfforts":{"recommended":["low"],"kept":["low"]},
            "defaultHiddenModels":["retired-a","retired-b"]
          }}}
        }
        """,
    )

    @Test
    fun defaultHiddenModelsFilterTheChooserWhileTheConfiguredModelStaysLabeledAndEditable() {
        val catalog = RichChatComposerControlCatalog(
            hiddenDefaultsStatus,
            ThreadConfig(model = "recommended"),
        )
        assertEquals(listOf("recommended", "kept"), catalog.models.map { it.id })
        // The configured hidden model is re-admitted at its advertised
        // position so the picker can label and represent it.
        val retained = RichChatComposerControlCatalog(
            hiddenDefaultsStatus,
            ThreadConfig(model = "retired-a"),
        )
        assertEquals(listOf("recommended", "retired-a", "kept"), retained.models.map { it.id })
        assertEquals("Retired A", retained.modelLabel("retired-a"))
        // Hiding is a menu preference, never a capability change: the visible
        // rows keep selecting exactly.
        val changed = catalog.applyModel(ThreadConfig(model = "recommended"), "kept")
        assertEquals("kept", changed.model)
    }

    @Test
    fun userVisibilityOverrideBeatsProviderDefaultsWithExactEmptyMeaningShowAll() {
        // The configured model is deliberately one no list hides, so each
        // assertion reads the pure filter effect.
        fun modelIds(userHiddenModels: JsonObject?): List<String> =
            RichChatComposerControlCatalog(
                hiddenDefaultsStatus,
                ThreadConfig(model = "kept"),
                userHiddenModels = userHiddenModels,
            ).models.map { it.id }

        // Exact empty list: the user chose show all — defaults step aside.
        assertEquals(
            listOf("recommended", "retired-a", "retired-b", "kept"),
            modelIds(RemoteJson.parseToJsonElement("""{"provider":[]}""") as JsonObject),
        )
        // A saved provider list replaces the defaults outright.
        assertEquals(
            listOf("retired-a", "retired-b", "kept"),
            modelIds(RemoteJson.parseToJsonElement("""{"provider":["recommended"]}""") as JsonObject),
        )
        // The plain per-agent list applies before the defaults.
        assertEquals(
            listOf("recommended", "retired-b", "kept"),
            modelIds(RemoteJson.parseToJsonElement("""{"provider":["retired-a"]}""") as JsonObject),
        )
        // No user list: the provider defaults apply.
        assertEquals(listOf("recommended", "kept"), modelIds(null))
    }

    @Test
    fun hiddenRepresentativeStillHighlightsTheVisibleFamilyRow() {
        val configuration = ThreadConfig(model = "pair-echo-beta")
        val catalog = RichChatComposerControlCatalog(
            status(guiFamilyStatus), configuration,
            userHiddenModels = RemoteJson.parseToJsonElement(
                """{"provider":["pair-charlie-beta"]}""",
            ) as JsonObject,
        )
        assertEquals("pair-charlie-delta", catalog.displaySelectionId(configuration))
        assertEquals("pair-echo-beta", configuration.model)
    }

    @Test
    fun modelRowsCarryCatalogPricingWhileFamilyRowsClaimNoPrice() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{"presentationCapabilities":{"gui":{
                "models":[
                  {"id":"solo","label":"Solo","description":"0.5/2 per Mtok"},
                  {"id":"duo-alpha-beta","label":"Alpha + Beta","description":"1/5 per Mtok"},
                  {"id":"duo-alpha-beta-fast","label":"Alpha + Beta Fast","description":"2/8 per Mtok"}
                ],
                "efforts":["low"],
                "modelFamilies":[{
                  "model":"duo-alpha-beta","label":"Duo Family","selectors":[
                    {"id":"mate","labelKey":"modelSelection.sidekick","options":[
                      {"id":"std","label":"Standard"},{"id":"fast","label":"Fast"}]}
                  ],
                  "bindings":{"effort":"config","fast":"model"},
                  "members":[
                    {"model":"duo-alpha-beta","selections":{"mate":"std"},"fast":false},
                    {"model":"duo-alpha-beta-fast","selections":{"mate":"fast"},"fast":true}
                  ]
                }]
              }}}
            }
            """,
        )
        val catalog = RichChatComposerControlCatalog(status, ThreadConfig(model = "solo"))
        assertEquals(listOf("solo", "duo-alpha-beta"), catalog.models.map { it.id })
        assertEquals("0.5/2 per Mtok", catalog.models[0].modelDescription)
        // The projected family row stands for every member: it never claims
        // the representative's cost as the family's price.
        assertNull(catalog.models[1].modelDescription)
        assertEquals("Duo Family", catalog.modelLabel("duo-alpha-beta"))
    }

    private fun status(raw: String) = GitStateJsonAdapter.decodeAgentStatus(
        RemoteJson.parseToJsonElement(raw) as JsonObject,
    ) ?: error("fixture did not decode")
}
