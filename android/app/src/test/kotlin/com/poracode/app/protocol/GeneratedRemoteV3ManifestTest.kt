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
        assertEquals(ProtocolConstants.REMOTE_PROTOCOL_VERSION, manifest.getInt("protocolVersion"))
        assertEquals(2, manifest.getInt("bindingFormatVersion"))
        assertEquals(3, manifest.getInt("generatorVersion"))
        // Manifest format 5 adds background-task reduce and follow-up queue
        // (format 4 added the terminal hardware-key encoder; format 3 the
        // terminal-cursor machine; format 2 the pairing machine).
        assertEquals(5, manifest.getInt("formatVersion"))
        assertEquals(ProtocolConstants.REMOTE_PROTOCOL_VERSION, RemoteContractMetadata.protocolVersion)
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

    @Test
    fun format4ManifestIsRefusedByFormat5Reader() {
        val current = JSONObject(readManifest())
        org.junit.Assert.assertTrue(
            GeneratedRemoteV3Contract.isCompatibleWithNativeBundleManifest(
                current.getInt("protocolVersion"),
                current.getInt("bindingFormatVersion"),
                current.getInt("generatorVersion"),
                current.getInt("formatVersion"),
            ),
        )
        org.junit.Assert.assertFalse(
            GeneratedRemoteV3Contract.isCompatibleWithNativeBundleManifest(
                current.getInt("protocolVersion"),
                current.getInt("bindingFormatVersion"),
                current.getInt("generatorVersion"),
                4,
            ),
        )
    }

    @Test
    fun format4ReaderRefusesFormat5GeneratedMachinePayload() {
        val current = JSONObject(readManifest())
        // The current payload is the format-5 machine set: it carries the two
        // machines format 5 added, which a format-4 reader has no codecs for.
        org.junit.Assert.assertEquals(5, current.getInt("formatVersion"))
        val machines = current.getJSONArray("stateMachines")
        val names = buildSet {
            repeat(machines.length()) { index ->
                add(machines.getJSONObject(index).getString("id"))
            }
        }
        org.junit.Assert.assertTrue(
            names.containsAll(setOf("backgroundTaskReduce", "followUpQueue")),
        )
        // Old-reader direction: a reader built before format 5 knows only
        // format 4 and must refuse this format-5 bundle, while the format-5
        // reader accepts it. Exact equality, never a range check.
        org.junit.Assert.assertFalse(
            GeneratedRemoteV3Contract.isCompatibleWithNativeBundleManifest(
                current.getInt("protocolVersion"),
                current.getInt("bindingFormatVersion"),
                current.getInt("generatorVersion"),
                current.getInt("formatVersion"),
                expectedFormatVersion = 4,
            ),
        )
        org.junit.Assert.assertTrue(
            GeneratedRemoteV3Contract.isCompatibleWithNativeBundleManifest(
                current.getInt("protocolVersion"),
                current.getInt("bindingFormatVersion"),
                current.getInt("generatorVersion"),
                current.getInt("formatVersion"),
                expectedFormatVersion = 5,
            ),
        )
    }

    private fun readManifest(): String = javaClass.classLoader!!.getResourceAsStream(
        "generated/native/native-bindings.json",
    )?.bufferedReader()?.use { it.readText() }
        ?: error("Missing generated/native/native-bindings.json")

    private fun locateNativeDirectory(): File = listOf(
        File("../protocol/remote/v3/generated/native"),
        File("../../protocol/remote/v3/generated/native"),
    ).firstOrNull { it.isDirectory }
        ?: error("Cannot locate shared generated native directory from ${File(".").absolutePath}")
}
