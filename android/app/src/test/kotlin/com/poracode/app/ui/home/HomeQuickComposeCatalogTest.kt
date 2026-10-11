package com.poracode.app.ui.home

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.GitMutationOutcome
import com.poracode.app.model.GitStateJsonAdapter
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.WslProjectLocation
import com.poracode.app.protocol.git.GitProcedure
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.session.replay.HostReplayCacheUi
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeQuickComposeCatalogTest {
    @Test
    fun presentationScopedCapabilitiesDriveSafeModelControls() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[{"id":"terminal-model","label":"Terminal"}],
                "presentationModes":["terminal","gui"],
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
                  "thinkingModels":["gui-b"],
                  "approvalPolicies":[{"id":"default","label":"Default"},{"id":"never","label":"Full access"}],
                  "slashCommands":[{
                    "id":"review","label":"Review","section":"skills",
                    "skillName":"Review","skillInvocation":"/review",
                    "skillProvider":"local","skillScope":"project"
                  }]
                }}
              }
            }
            """,
        )
        val catalog = HomeQuickComposeCatalog(
            status,
            ThreadPresentationMode.Gui,
            ThreadConfig(model = "gui-a"),
        )

        assertEquals(listOf("gui-a", "gui-b"), catalog.models.map { it.id })
        assertEquals(listOf("low"), catalog.effortOptions("gui-a").map { it.id })
        assertEquals(listOf("long"), catalog.contextOptions("gui-b").map { it.id })
        assertEquals(listOf("default", "never"), catalog.approvalPolicies.map { it.id })
        assertTrue(catalog.supportsFast("gui-a"))
        assertFalse(catalog.supportsFast("gui-b"))
        assertTrue(catalog.supportsThinking("gui-b"))
        assertEquals("/review", catalog.slashCommands.single().invocation)
        assertEquals("Review", catalog.slashCommands.single().skill?.name)

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
        assertFalse(changed.thinking == true)
    }

    @Test
    fun wslAgentsAreFilteredToTheProjectDistro() {
        val ubuntu = status("codex", AgentStatusEntry.ENV_WSL, "Ubuntu", "Ubuntu")
        val debian = status("codex", AgentStatusEntry.ENV_WSL, "Debian", "Debian")
        val replay = HostReplayCacheUi(
            agentWslStatuses = listOf(ubuntu, debian),
            agentWslLoaded = true,
        )

        assertEquals(
            listOf("Debian"),
            homeQuickComposeAgents(
                WslProjectLocation(
                    distro = "Debian",
                    linuxPath = "/srv/project",
                    uncPath = "\\\\wsl$\\Debian\\srv\\project",
                ),
                replay,
                ThreadPresentationMode.Gui,
            ).map { it.label },
        )
    }

    @Test
    fun legacyPosixAgentStatusRemainsEligibleForBothPresentationModes() {
        val legacy = status("codex", "", "", "Codex")
        val replay = HostReplayCacheUi(agentMergedStatuses = mapOf(legacy.identityKey to legacy))

        assertEquals(
            listOf("Codex"),
            homeQuickComposeAgents(
                PosixProjectLocation("/srv/project"),
                replay,
                ThreadPresentationMode.Gui,
            ).map { it.label },
        )
        assertTrue(supportsPresentation(legacy, ThreadPresentationMode.Terminal))
    }

    @Test
    fun newWorktreeRequestUsesGeneratedOperationWithoutInventingPath() {
        val request = homeQuickComposeAddWorktreeRequest(project(), " feature/mobile ")

        assertEquals(GitProcedure.AddWorktree, request.procedure)
        assertEquals("feature/mobile", request.payload["branch"]?.jsonPrimitive?.content)
        assertTrue(request.payload["createBranch"]?.jsonPrimitive?.content == "true")
        assertFalse(request.payload.containsKey("path"))
        assertFalse(request.requiresConfirmation)
    }

    @Test
    fun createdWorktreeRequiresHostReturnedPath() {
        val outcome = GitMutationOutcome.Applied(
            RemoteJson.parseToJsonElement("{\"path\":\"/tmp/feature\"}"),
        )

        assertEquals(
            HomeQuickComposeWorktree("/tmp/feature", "feature", isNew = true),
            homeQuickComposeWorktreeFromOutcome(outcome, " feature "),
        )
        assertNull(
            homeQuickComposeWorktreeFromOutcome(
                GitMutationOutcome.Applied(RemoteJson.parseToJsonElement("{}")),
                "feature",
            ),
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun newWorktreeRequestRejectsBlankBranch() {
        homeQuickComposeAddWorktreeRequest(project(), "  ")
    }

    @Test
    fun familyRelationsCollapseTheModelMenuAndResolveEditsAtomically() {
        val catalog = HomeQuickComposeCatalog(
            status(familyTerminalStatus),
            ThreadPresentationMode.Terminal,
            ThreadConfig(model = "solo"),
        )

        // 10 raw choices project to three rows: solo plus one row per family.
        assertEquals(
            listOf("solo", "duo-alpha-beta", "pair-charlie-beta"),
            catalog.models.map { it.id },
        )
        assertEquals(listOf("low", "high"), catalog.effortOptions("duo-alpha-beta").map { it.id })
        assertTrue(catalog.supportsFast("duo-alpha-beta"))
        // (alpha, beta, high, fast) has no member: the Fast control is unavailable.
        assertFalse(catalog.supportsFast("duo-alpha-beta-hi"))
        assertFalse(catalog.supportsThinking("duo-alpha-beta"))

        val fresh = catalog.applyModel(
            ThreadConfig(model = "solo", effort = "low", fast = true),
            "duo-alpha-beta",
        )
        assertEquals("duo-alpha-beta", fresh.model)
        assertEquals("", fresh.effort)
        assertEquals(false, fast(fresh))

        // Clicking the family row while already inside preserves the actual member.
        val inside = ThreadConfig(model = "duo-bravo-beta", effort = "", fast = false)
        assertEquals(inside, catalog.applyModel(inside, "duo-alpha-beta"))

        val bravo = catalog.applySelector(inside, "lead", "bravo")
        assertEquals("duo-bravo-beta", bravo.model)
        assertEquals("", bravo.effort)
        assertEquals(false, fast(bravo))
        // (alpha, delta, low, false) is a hole: the edit is refused untouched.
        val alphaBeta = ThreadConfig(model = "duo-alpha-beta", effort = "", fast = false)
        assertEquals(alphaBeta, catalog.applySelector(alphaBeta, "mate", "delta"))

        assertEquals("duo-alpha-beta-hi", catalog.applyEffort(alphaBeta, "high").model)
        assertEquals("duo-alpha-beta-fast", catalog.applyFast(alphaBeta, true).model)
        val noSibling = ThreadConfig(model = "duo-alpha-beta-hi")
        assertEquals(noSibling, catalog.applyFast(noSibling, true))
    }

    @Test
    fun familyDisplayDerivesStateAndRestoreKeepsExactUidAndSeeds() {
        val catalog = HomeQuickComposeCatalog(
            status(familyTerminalStatus),
            ThreadPresentationMode.Terminal,
            ThreadConfig(model = "duo-alpha-beta-fast", effort = "", fast = false),
        )

        // A raw Fast UID plus inert stored fast:false displays Fast — derived,
        // never persisted — while the exact UID stays the saved model.
        assertTrue(catalog.displayFast(ThreadConfig(model = "duo-alpha-beta-fast")) == true)
        assertEquals("low", catalog.displayEffort(ThreadConfig(model = "duo-alpha-beta-fast")))
        val memberConfig = ThreadConfig(model = "duo-alpha-beta-fast", effort = "", fast = false)
        assertEquals("duo-alpha-beta", catalog.displaySelectionId(memberConfig))

        // Restore: the exact UID and stored seeds survive normalization unchanged.
        assertEquals(memberConfig, catalog.normalize(memberConfig))

        // A meaningful legacy override is preserved for supervisor rejection,
        // never silently repaired into a valid tuple.
        val meaningful = ThreadConfig(model = "duo-alpha-beta", effort = "high")
        val normalizedMeaningful = catalog.normalize(meaningful)
        assertEquals("duo-alpha-beta", normalizedMeaningful.model)
        assertEquals("high", normalizedMeaningful.effort)
        assertTrue(catalog.selectorMenus(meaningful).isEmpty())

        // Callback → draft → save → reload: the sheet's explicit Fast toggle
        // resolves the atomic tuple and both save and reload keep it exactly.
        val saved = catalog.normalize(ThreadConfig(model = "duo-alpha-beta-fast", fast = false))
        val edited = catalog.applyFast(saved, false)
        assertEquals("duo-alpha-beta", edited.model)
        assertEquals("", edited.effort)
        val storedDraft = catalog.normalize(edited)
        assertEquals("duo-alpha-beta", storedDraft.model)
        assertEquals("", storedDraft.effort)
        assertEquals(false, fast(storedDraft))
        val reloaded = HomeQuickComposeCatalog(
            status(familyTerminalStatus),
            ThreadPresentationMode.Terminal,
            storedDraft,
        )
        assertEquals(storedDraft, reloaded.normalize(storedDraft))
    }

    @Test
    fun guiPresentationCarriesConfigBoundRelationWithoutRootLeak() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[{"id":"terminal-model","label":"Terminal"}],
                "fastModels":["terminal-model"],
                "modelFamilies":$duoOnlyFamily,
                "presentationCapabilities":{"gui":{
                  "models":[
                    {"id":"pair-charlie-beta","label":"Charlie + Beta"},
                    {"id":"pair-charlie-delta","label":"Charlie + Delta"},
                    {"id":"pair-echo-beta","label":"Echo + Beta"},
                    {"id":"pair-echo-delta","label":"Echo + Delta"},
                    {"id":"solo","label":"Solo"}
                  ],
                  "efforts":["low","high"],
                  "fastModels":["solo"],
                  "modelFamilies":$pairOnlyFamily
                }}
              }
            }
            """,
        )
        val catalog = HomeQuickComposeCatalog(
            status,
            ThreadPresentationMode.Gui,
            ThreadConfig(model = "pair-charlie-beta", effort = "low", fast = true),
        )

        // The root Terminal relation never leaks: no Duo row, no encoded seeds.
        assertEquals(
            listOf("pair-charlie-beta", "solo"),
            catalog.models.map { it.id },
        )
        assertTrue(catalog.selectorMenus(ThreadConfig(model = "terminal-model")).isEmpty())

        // Config-bound selectors patch only the model; carriers are retained.
        val carriers = ThreadConfig(
            model = "pair-charlie-beta",
            effort = "low",
            contextSize = "short",
            fast = true,
            thinking = false,
        )
        val switched = catalog.applySelector(carriers, "lead", "echo")
        assertEquals("pair-echo-beta", switched.model)
        assertEquals(carriers.copy(model = "pair-echo-beta"), switched)
        assertEquals(
            carriers.copy(model = "pair-echo-beta"),
            catalog.applyModel(carriers, "pair-echo-beta"),
        )
        // Inside the family, the row click keeps the actual selected pair.
        assertEquals(carriers, catalog.applyModel(carriers, "pair-charlie-beta"))

        // Effort/Fast stay ordinary independent carriers.
        assertEquals(carriers.copy(effort = "high"), catalog.applyEffort(carriers, "high"))
        assertTrue(catalog.supportsFast("solo"))
        assertTrue(catalog.displayFast(carriers) == true)
    }

    @Test
    fun guiOverrideWithoutFamiliesKeepsTheRawMenuDespiteRootRelation() {
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[{"id":"member-a","label":"Member A"}],
                "modelFamilies":$duoOnlyFamily,
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
        val catalog = HomeQuickComposeCatalog(
            status,
            ThreadPresentationMode.Gui,
            ThreadConfig(model = "member-a"),
        )

        // The override declares no relation: raw choices, no collapse.
        assertEquals(listOf("member-a", "member-b"), catalog.models.map { it.id })
    }

    private fun fast(config: ThreadConfig): Boolean = config.fast == true

    private val duoOnlyFamily =
        """
        [{"model":"duo-alpha-beta","label":"Duo","selectors":[
          {"id":"lead","labelKey":"modelSelection.lead","options":[{"id":"alpha","label":"Alpha"}]}],
         "bindings":{"effort":"model","fast":"model"},
         "members":[
           {"model":"member-a","selections":{"lead":"alpha"},"effort":"low","fast":false},
           {"model":"member-b","selections":{"lead":"alpha"},"effort":"low","fast":true}
         ]}]
        """.trimIndent()

    private val pairOnlyFamily =
        """
        [{"model":"pair-charlie-beta","label":"Pair","selectors":[
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
         ]}]
        """.trimIndent()

    private val pairOnlyFamilyTrimmed = """
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

    private val familyTerminalStatus =
        """
        {
          "kind":"provider","label":"Provider","installed":true,
          "authState":"authenticated","envKind":"posix",
          "capabilities":{
            "models":[
              {"id":"solo","label":"Solo"},
              {"id":"duo-alpha-beta","label":"Alpha + Beta"},
              {"id":"duo-alpha-beta-fast","label":"Alpha + Beta Fast"},
              {"id":"duo-alpha-beta-hi","label":"Alpha + Beta High"},
              {"id":"duo-bravo-beta","label":"Bravo + Beta"},
              {"id":"duo-bravo-delta","label":"Bravo + Delta"},
              {"id":"pair-charlie-beta","label":"Pair Charlie Beta"},
              {"id":"pair-charlie-delta","label":"Pair Charlie Delta"},
              {"id":"pair-echo-beta","label":"Pair Echo Beta"},
              {"id":"pair-echo-delta","label":"Pair Echo Delta"}
            ],
            "efforts":["low","high"],
            "modelEfforts":{"solo":["low","high"]},
            "fastModels":["solo"],
            "modelFamilies":[
              {"model":"duo-alpha-beta","label":"Duo","selectors":[
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
              ]},
              $pairOnlyFamilyTrimmed
            ]
          }
        }
        """.trimIndent()

    private fun project() = RemoteProject(
        id = "project",
        name = "Project",
        location = PosixProjectLocation("/workspace/project"),
        createdAt = "2026-01-01T00:00:00Z",
    )

    private fun status(
        raw: String,
    ): AgentStatusEntry = GitStateJsonAdapter.decodeAgentStatus(
        RemoteJson.parseToJsonElement(raw) as JsonObject,
    ) ?: error("fixture did not decode")

    private val hiddenDefaultsStatus = status(
        """
        {
          "kind":"provider","label":"Provider","installed":true,
          "authState":"authenticated","envKind":"posix",
          "capabilities":{
            "models":[
              {"id":"recommended","label":"Recommended"},
              {"id":"retired-a","label":"Retired A"},
              {"id":"retired-b","label":"Retired B"},
              {"id":"kept","label":"Kept"}
            ],
            "defaultHiddenModels":["retired-a","retired-b"]
          }
        }
        """,
    )

    @Test
    fun defaultHiddenModelsFilterThePickerWhileTheConfiguredModelStaysListed() {
        assertEquals(
            listOf("recommended", "kept"),
            HomeQuickComposeCatalog(
                hiddenDefaultsStatus,
                ThreadPresentationMode.Gui,
                ThreadConfig(model = "recommended"),
            ).models.map { it.id },
        )
        // The configured hidden model is re-admitted at its advertised
        // position — exactly the current selection, never the whole set.
        assertEquals(
            listOf("recommended", "retired-a", "kept"),
            HomeQuickComposeCatalog(
                hiddenDefaultsStatus,
                ThreadPresentationMode.Gui,
                ThreadConfig(model = "retired-a"),
            ).models.map { it.id },
        )
    }

    @Test
    fun userVisibilityOverrideBeatsProviderDefaultsWithExactEmptyMeaningShowAll() {
        // The configured model is deliberately one no list hides, so each
        // assertion reads the pure filter effect.
        fun modelIds(userHiddenModels: JsonObject?): List<String> = HomeQuickComposeCatalog(
            hiddenDefaultsStatus,
            ThreadPresentationMode.Gui,
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
    fun hiddenFamilyRowsLeaveTheChooserUntilAConfiguredMemberRevivesThem() {
        val relation = """
            {"model":"duo-alpha-beta","label":"Duo","selectors":[
              {"id":"lead","labelKey":"modelSelection.lead","options":[
                {"id":"alpha","label":"Alpha"},{"id":"bravo","label":"Bravo"}]},
              {"id":"mate","labelKey":"modelSelection.sidekick","options":[
                {"id":"beta","label":"Beta"},{"id":"delta","label":"Delta"}]}
            ],
            "bindings":{"effort":"model","fast":"model"},
            "members":[
              {"model":"duo-alpha-beta","selections":{"lead":"alpha","mate":"beta"},"effort":"low","fast":false},
              {"model":"duo-bravo-beta","selections":{"lead":"bravo","mate":"beta"},"effort":"low","fast":false}
            ]}
        """.trimIndent()
        val status = status(
            """
            {
              "kind":"provider","label":"Provider","installed":true,
              "authState":"authenticated","envKind":"posix",
              "capabilities":{
                "models":[
                  {"id":"solo","label":"Solo"},
                  {"id":"duo-alpha-beta","label":"Alpha + Beta"},
                  {"id":"duo-bravo-beta","label":"Bravo + Beta"}
                ],
                "defaultHiddenModels":["duo-alpha-beta","duo-bravo-beta"],
                "modelFamilies":[$relation]
              }
            }
            """,
        )
        // Every member hidden: the family row disappears instead of
        // advertising an empty relation.
        val withoutMember = HomeQuickComposeCatalog(
            status,
            ThreadPresentationMode.Gui,
            ThreadConfig(model = "solo"),
        )
        assertEquals(listOf("solo"), withoutMember.models.map { it.id })
        // The configured hidden member is re-admitted: its family row revives
        // (the hidden representative substitutes) and the exact member stays
        // resumable through the untouched relation.
        val withMember = HomeQuickComposeCatalog(
            status,
            ThreadPresentationMode.Gui,
            ThreadConfig(model = "duo-bravo-beta"),
        )
        assertEquals(listOf("solo", "duo-bravo-beta"), withMember.models.map { it.id })
        assertEquals("Duo", withMember.models[1].label)
        assertEquals("duo-bravo-beta", withMember.displaySelectionId(ThreadConfig(model = "duo-bravo-beta")))
        val resumed = withMember.applyModel(ThreadConfig(model = "duo-bravo-beta"), "duo-bravo-beta")
        assertEquals("duo-bravo-beta", resumed.model)
    }

    private fun status(
        kind: String,
        envKind: String,
        envDistro: String,
        label: String,
    ): AgentStatusEntry = AgentStatusEntry(
        identityKey = AgentStatusEntry.identityKey(kind, envKind, envDistro),
        kind = kind,
        label = label,
        installed = true,
        version = null,
        authState = "authenticated",
        envKind = envKind,
        envDistro = envDistro,
    )
}
