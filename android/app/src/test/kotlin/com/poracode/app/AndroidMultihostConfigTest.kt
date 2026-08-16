package com.poracode.app

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidMultihostConfigTest {
    @Test
    fun stableToolchainAndApiContractArePinned() {
        val app = projectFile("app/build.gradle.kts").readText()
        val root = projectFile("build.gradle.kts").readText()
        val wrapper = projectFile("gradle/wrapper/gradle-wrapper.properties").readText()
        val manifest = projectFile("app/src/main/AndroidManifest.xml").readText()
        listOf(
            "compileSdk = 37",
            "minSdk = 26",
            "targetSdk = 37",
            "version \"2.4.10\"",
            "compose-bom:2026.08.00",
            "adaptive:1.3.0",
            "lifecycle-runtime-ktx:2.11.0",
            "core-ktx:1.19.0",
            "kotlinx-coroutines-android:1.11.0",
            "kotlinx-serialization-json:1.11.0",
            "firebase-bom:34.16.0",
            "com.google.firebase:firebase-messaging",
            "FIREBASE_PUSH_CONFIGURED",
        ).forEach { expected -> assertTrue("Missing $expected", app.contains(expected)) }
        assertTrue(root.contains("version \"9.3.1\""))
        assertTrue(root.contains("com.google.gms.google-services\") version \"4.5.0\""))
        assertTrue(wrapper.contains("gradle-9.5.1-all.zip"))
        assertTrue(manifest.contains("android.permission.ACCESS_LOCAL_NETWORK"))
        assertTrue(manifest.contains("android.permission.POST_NOTIFICATIONS"))
        assertTrue(manifest.contains("PoracodeFirebaseMessagingService"))
        assertTrue(manifest.contains("android:allowBackup=\"false\""))
        assertTrue(app.contains("val firebaseConfigured = googleServicesConfig.isFile"))
        assertTrue(app.contains("if (firebaseConfigured)"))
        assertTrue(projectFile(".gitignore").readText().contains("app/google-services.json"))
    }

    @Test
    fun pushResourcesAreCompleteInAllLocales() {
        val resourceRoot = projectFile("app/src/main/res")
        val required = allNames(resourceRoot.resolve("values/strings.xml"))
            .filter { it.startsWith("push_") }.toSet()
        assertEquals(21, required.size)
        val locales = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        locales.forEach { locale ->
            val file = resourceRoot.resolve("values-$locale/push.xml")
            assertTrue("Missing $locale push.xml", file.isFile)
            val text = file.readText()
            val present = STRING_NAME.findAll(text).map { it.groupValues[1] }.toSet()
            assertEquals("Incomplete $locale push resources", required, present)
            assertTrue("Empty push translation in $locale", !EMPTY_STRING.containsMatchIn(text))
            // Cross-host confirmation names only the host display label; every
            // locale must keep the single %1$s placeholder in both strings.
            listOf("push_route_confirm_message", "push_route_confirm_description").forEach { name ->
                val value = STRING_BODY.findAll(text)
                    .firstOrNull { it.groupValues[1] == name }
                    ?.groupValues?.get(2)
                    ?: error("Missing $locale $name")
                assertTrue("Missing %1\$s in $locale $name", value.contains("%1\$s"))
            }
        }
    }

    @Test
    fun pushSourceDoesNotLogOrPutSecretsIntoNotificationIntents() {
        val pushRoot = projectFile("app/src/main/kotlin/com/poracode/app/push")
        val sources = pushRoot.walkTopDown().filter { it.extension == "kt" }
            .associate { it.name to it.readText() }
        assertTrue(sources.values.none { "android.util.Log" in it || "Log." in it })
        val service = requireNotNull(sources["PoracodeFirebaseMessagingService.kt"])
        assertTrue("accessToken" !in service)
        assertTrue("deviceToken" !in service)
        assertTrue("error" !in service.lowercase())
    }

    @Test
    fun hostAndPermissionResourcesAreCompleteInAllLocales() {
        val resourceRoot = projectFile("app/src/main/res")
        val required = requiredNames(resourceRoot.resolve("values/strings.xml"))
        assertEquals(21, required.size)
        val locales = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        locales.forEach { locale ->
            val file = resourceRoot.resolve("values-$locale/hosts.xml")
            assertTrue("Missing $locale hosts.xml", file.isFile)
            val text = file.readText()
            val present = STRING_NAME.findAll(text).map { it.groupValues[1] }.toSet()
            assertEquals("Incomplete $locale host resources", required, present)
            assertTrue("Missing placeholder in $locale rationale", text.contains("%1\$s"))
            assertTrue("Empty translation in $locale", !EMPTY_STRING.containsMatchIn(text))
        }
    }

    private fun requiredNames(file: File): Set<String> = STRING_NAME.findAll(file.readText())
        .map { it.groupValues[1] }
        .filter { it.startsWith("hosts_") || it.startsWith("local_network_permission_") }
        .toSet()

    private fun allNames(file: File): Set<String> = STRING_NAME.findAll(file.readText())
        .map { it.groupValues[1] }
        .toSet()

    private fun projectFile(path: String): File {
        var cursor: File? = File(".").absoluteFile
        while (cursor != null) {
            if (cursor.resolve("settings.gradle.kts").isFile && cursor.resolve("app").isDirectory) {
                return cursor.resolve(path)
            }
            cursor = cursor.parentFile
        }
        error("Cannot locate Android root for $path")
    }

    companion object {
        private val STRING_NAME = Regex("""<string\s+name="([^"]+)"""")
        private val STRING_BODY = Regex("""<string\s+name="([^"]+)"[^>]*>(.*?)</string>""")
        private val EMPTY_STRING = Regex("""<string\s+name="[^"]+"\s*>\s*</string>""")
    }
}
