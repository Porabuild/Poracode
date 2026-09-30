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
