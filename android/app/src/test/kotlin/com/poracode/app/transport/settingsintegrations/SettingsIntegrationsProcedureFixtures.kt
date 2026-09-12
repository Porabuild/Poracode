package com.poracode.app.transport.settingsintegrations

internal object SettingsIntegrationsProcedureFixtures {
    val resultByProcedure = mapOf(
        "scanSkills" to """{"skills":[],"effectiveSkillIds":[],"invocation":null,"issues":[],"canLinkToGlobal":false}""",
        "listSkillMarketplace" to """{"marketplace":"skills-sh","skills":[],"total":0}""",
        "setSkillEnabled" to null,
        "deleteSkill" to null,
        "importSkills" to """{"imported":["/repo/.agents/skills/demo"]}""",
        "installMarketplaceSkill" to """{"installed":"/repo/.agents/skills/demo"}""",
        "discoverExternalMcpServers" to """{"groups":[]}""",
        "probeMcpServer" to """{"status":"available","latencyMs":12,"environment":{"runtime":"wsl","projectScoped":true},"toolCount":2,"tools":["read","write"]}""",
        "getMcpOauthStatus" to """{"authenticatedUrls":["https://mcp.example.test"]}""",
        "beginMcpServerOauth" to """{"status":"authorized"}""",
        "waitMcpServerOauth" to """{"status":"authorized"}""",
        "clearMcpServerOauth" to null,
    )
}
