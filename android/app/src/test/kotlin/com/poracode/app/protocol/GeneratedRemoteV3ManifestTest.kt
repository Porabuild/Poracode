package com.poracode.app.protocol

import com.poracode.remote.v3.generated.RemoteContractMetadata
import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class GeneratedRemoteV3ManifestTest {
    @Test
    fun manifestVersionsAndKotlinSourcesAreCompatibleAndComplete() {
        val raw = javaClass.classLoader!!.getResourceAsStream(
            "generated/native/native-bindings.json",
        )?.bufferedReader()?.use { it.readText() }
            ?: error("Missing generated/native/native-bindings.json")
        val manifest = JSONObject(raw)
        assertEquals(8, manifest.getInt("protocolVersion"))
        assertEquals(2, manifest.getInt("bindingFormatVersion"))
        assertEquals(3, manifest.getInt("generatorVersion"))
        assertEquals(1, manifest.getInt("formatVersion"))
        assertEquals(8, RemoteContractMetadata.protocolVersion)
        assertEquals(2, RemoteContractMetadata.bindingFormatVersion)
        assertEquals(3, RemoteContractMetadata.generatorVersion)

        val files = manifest.getJSONObject("languages")
            .getJSONObject("kotlin")
            .getJSONArray("files")
        val declared = buildSet {
            repeat(files.length()) { index ->
                add(files.getJSONObject(index).getString("path"))
            }
        }
        assertEquals(files.length(), declared.size)
        assertEquals(manifest.getJSONObject("counts").getInt("kotlinFiles"), declared.size)

        val nativeDirectory = locateNativeDirectory()
        val actual = File(nativeDirectory, "kotlin").walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .map { "kotlin/${it.relativeTo(File(nativeDirectory, "kotlin")).invariantSeparatorsPath}" }
            .toSet()
        assertEquals(declared, actual)
        Class.forName("com.poracode.remote.v3.generated.RemoteRootCodecs")
    }

    private fun locateNativeDirectory(): File = listOf(
        File("../protocol/remote/v3/generated/native"),
        File("../../protocol/remote/v3/generated/native"),
    ).firstOrNull { it.isDirectory }
        ?: error("Cannot locate shared generated native directory from ${File(".").absolutePath}")
}
