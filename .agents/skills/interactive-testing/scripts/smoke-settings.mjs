import { join } from "node:path";
import assert from "node:assert/strict";

export async function runSettingsScenario({
  client,
  evaluate,
  waitForValue,
  screenshot,
  outDir,
  mode,
  startMcpProbeFixture,
  skillsSectionDeepDive,
  mcpServersSectionDeepDive,
  pluginsSectionDeepDive,
}) {
  const mcpFixture = await startMcpProbeFixture();
  try {
    // Context is independent of whether the launcher already dismissed Welcome.
    await evaluate(
      client,
      `(() => {
      const d = window.__poracodeDev;
      const app = d.stores.app.getState();
      const project = app.projects.find(candidate => candidate.id === "smoke-project");
      if (!project) throw new Error("Settings smoke fixture project is missing");
      window.__settingsSmokeOriginal = {
        servers: d.stores.sharedSettings.getState().mcpServers,
        view: app.view,
      };
      app.openDraft(project.id);
    })()`,
    );

    const configuredMcpServers = [
      {
        id: "smoke-mcp-connected",
        name: "smoke-connected",
        description: "Deterministic MCP probe fixture",
        enabled: true,
        timeoutMs: 30_000,
        transport: { type: "http", url: `${mcpFixture.origin}/mcp`, headers: {} },
      },
      {
        id: "smoke-mcp-auth",
        name: "smoke-auth",
        description: "Deterministic OAuth challenge fixture",
        enabled: true,
        timeoutMs: 30_000,
        transport: { type: "http", url: `${mcpFixture.origin}/auth`, headers: {} },
      },
    ];
    await evaluate(
      client,
      `window.__poracodeDev.stores.sharedSettings.getState().setMcpServers(${JSON.stringify(configuredMcpServers)})`,
    );
    const sections = [
      "profile",
      "general",
      "audio",
      "appearance",
      "terminal",
      "threads",
      "git",
      "worktrees",
      "notifications",
      "ai",
      "search",
      "shortcuts",
      "remoteAccess",
      "remoteServers",
      "agentsGeneral",
      "skills",
      "mcpServers",
      "plugins",
      "browser",
      "usage",
      "archived",
      "changelog",
      "about",
    ];
    let mcpListScreenshotPath;
    let mcpScreenshotPath;
    let mcpImportScreenshotPath;
    let pluginsScreenshotPath;
    let skillsScreenshotPath;
    let skillsImportScreenshotPath;
    let skillsImportDestinationsScreenshotPath;
    let skillsMarketplaceScreenshotPath;
    let skillsTargetsScreenshotPath;
    for (const section of sections) {
      await evaluate(
        client,
        `window.__poracodeDev.openSettings(${JSON.stringify(section)}); new Promise((resolve) => setTimeout(resolve, 200))`,
        true,
      );
      const state = await waitForValue(
        () =>
          evaluate(
            client,
            `(() => ({
            hasContent: Boolean(document.querySelector('[data-settings-scroll-area="true"]')),
            textLength: document.body.innerText.length,
            crash: /renderer crash|rendered more hooks/i.test(document.body.innerText),
          }))()`,
          ),
        (candidate) => candidate.hasContent && candidate.textLength > 0,
        `settings section ${section}`,
      );
      assert(
        state.hasContent && state.textLength > 0,
        `settings section ${section} did not render`,
      );
      assert(!state.crash, `settings section ${section} rendered a crash screen`);
      if (section === "skills") {
        await waitForValue(
          () =>
            evaluate(
              client,
              `(() => ({
              hasSearch: Boolean(document.querySelector('[aria-label="Search skills"]')),
              text: document.body.innerText,
            }))()`,
            ),
          (result) => result.hasSearch && (mode === "real" || result.text.includes("smoke-global")),
          "skills settings fixture",
        );
        if (mode === "mock") {
          ({
            skillsImportScreenshotPath,
            skillsImportDestinationsScreenshotPath,
            skillsMarketplaceScreenshotPath,
            skillsTargetsScreenshotPath,
          } = await skillsSectionDeepDive(client));
        }
        skillsScreenshotPath = join(outDir, "smoke-02-skills.png");
        await screenshot(client, skillsScreenshotPath);
      }
      if (section === "mcpServers") {
        if (mode === "mock") {
          ({ mcpListScreenshotPath, mcpScreenshotPath, mcpImportScreenshotPath } =
            await mcpServersSectionDeepDive(client, mcpFixture));
        }
      }
      if (section === "plugins") {
        ({ pluginsScreenshotPath } = await pluginsSectionDeepDive(client));
      }
    }
    const screenshotPath = join(outDir, "smoke-02-settings.png");
    await screenshot(client, screenshotPath);
    return {
      sections,
      screenshotPath,
      ...(mcpListScreenshotPath ? { mcpListScreenshotPath } : {}),
      ...(mcpScreenshotPath ? { mcpScreenshotPath } : {}),
      ...(mcpImportScreenshotPath ? { mcpImportScreenshotPath } : {}),
      ...(pluginsScreenshotPath ? { pluginsScreenshotPath } : {}),
      ...(skillsScreenshotPath ? { skillsScreenshotPath } : {}),
      ...(skillsImportScreenshotPath ? { skillsImportScreenshotPath } : {}),
      ...(skillsImportDestinationsScreenshotPath ? { skillsImportDestinationsScreenshotPath } : {}),
      ...(skillsMarketplaceScreenshotPath ? { skillsMarketplaceScreenshotPath } : {}),
      ...(skillsTargetsScreenshotPath ? { skillsTargetsScreenshotPath } : {}),
    };
  } finally {
    try {
      await evaluate(
        client,
        `(() => {
        const d = window.__poracodeDev;
        const original = window.__settingsSmokeOriginal;
        d.closeSettings();
        if (original) {
          d.stores.sharedSettings.getState().setMcpServers(original.servers);
          d.stores.app.setState({ view: original.view });
          delete window.__settingsSmokeOriginal;
        }
      })()`,
      );
    } finally {
      await mcpFixture.close();
    }
  }
}
