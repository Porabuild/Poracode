package com.poracode.app.chat

import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.WindowsProjectLocation
import com.poracode.app.model.WslProjectLocation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
import org.junit.Test

class RichChatFilePolicyTest {

    private val posix = PosixProjectLocation("/repo/app")
    private val windows = WindowsProjectLocation("C:\\repo\\app")
    private val wsl = WslProjectLocation(
        distro = "Ubuntu",
        linuxPath = "/repo/app",
        uncPath = "//wsl.localhost/Ubuntu/repo/app",
    )

    // -- source safety ---------------------------------------------------

    @Test
    fun safeSourcesAcceptLocalRefs() {
        assertTrue(RichChatFilePolicy.isSafeFileSource("out/a.zip"))
        assertTrue(RichChatFilePolicy.isSafeFileSource("/abs/out.zip"))
        assertTrue(RichChatFilePolicy.isSafeFileSource("C:\\repo\\out.zip"))
        assertTrue(RichChatFilePolicy.isSafeFileSource("\\\\server\\share\\out.zip"))
        assertTrue(RichChatFilePolicy.isSafeFileSource("file:///repo/out.zip"))
        assertTrue(RichChatFilePolicy.isSafeFileSource("poracode-local://local/repo/out.zip"))
    }

    @Test
    fun safeSourcesRejectWebAndOpaqueSchemes() {
        assertFalse(RichChatFilePolicy.isSafeFileSource("https://host/out.zip"))
        assertFalse(RichChatFilePolicy.isSafeFileSource("javascript:alert(1)"))
        assertFalse(RichChatFilePolicy.isSafeFileSource("data:text/plain,hi"))
        assertFalse(RichChatFilePolicy.isSafeFileSource("poracode-local://other/out.zip"))
        assertFalse(RichChatFilePolicy.isSafeFileSource("out\u0001.zip"))
        assertFalse(RichChatFilePolicy.isSafeFileSource(""))
    }

    // -- localPath: decode once, keep authority ---------------------------

    @Test
    fun localPathDecodesSchemesOnce() {
        assertEquals("/repo/out file.zip", RichChatFilePolicy.localPath("file:///repo/out%20file.zip"))
        // %2520 decodes exactly once -> literal %20 stays encoded
        assertEquals("/repo/a%20b.zip", RichChatFilePolicy.localPath("file:///repo/a%2520b.zip"))
        assertEquals(
            "/repo/out.zip",
            RichChatFilePolicy.localPath("poracode-local://local/repo/out.zip"),
        )
        // file:// authority survives as UNC host
        assertEquals("//server/share/out.zip", RichChatFilePolicy.localPath("file://server/share/out.zip"))
        // file:///C:/x -> drive path, not /C:/x
        assertEquals("C:/repo/out.zip", RichChatFilePolicy.localPath("file:///C:/repo/out.zip"))
        // Bare paths keep literal %20
        assertEquals("out a%20b.zip", RichChatFilePolicy.localPath("out a%20b.zip"))
    }

    @Test
    fun localPathRejectsMalformedAndUnsafe() {
        assertNull(RichChatFilePolicy.localPath("file:///repo/%2e%2e/etc.zip"))
        assertNull(RichChatFilePolicy.localPath("file:///repo/a%2.zip"))
        assertNull(RichChatFilePolicy.localPath("file:///repo/%zz.zip"))
        assertNull(RichChatFilePolicy.localPath("file:///repo/%c0%ae/etc.zip"))
        assertNull(RichChatFilePolicy.localPath("poracode-local://local"))
        assertNull(RichChatFilePolicy.localPath("poracode-local://foreign/repo/out.zip"))
    }

    @Test
    fun percentDecodeIsStrictUtf8() {
        // Literal Unicode + escapes: café%20 -> "café " not mojibake
        assertEquals("café out.zip", RichChatFilePolicy.percentDecodeOnce("café%20out.zip"))
        // Overlong/invalid UTF-8 rejects, never replacement chars
        assertNull(RichChatFilePolicy.percentDecodeOnce("a%ff%fe.zip"))
        // Truncated escape rejects
        assertNull(RichChatFilePolicy.percentDecodeOnce("out%2"))
        assertNull(RichChatFilePolicy.percentDecodeOnce("out%"))
    }

    // -- artifact gate -----------------------------------------------------

    @Test
    fun artifactGateMatchesSharedSet() {
        assertTrue(RichChatFilePolicy.isArtifactPath("out/release.zip"))
        assertTrue(RichChatFilePolicy.isArtifactPath("out/report.pdf"))
        assertTrue(RichChatFilePolicy.isArtifactPath("out/data.csv"))
        assertFalse(RichChatFilePolicy.isArtifactPath("out/app.ts"))
        assertFalse(RichChatFilePolicy.isArtifactPath("out/README.md"))
        // Bare path dotfile `.zip` stays inert
        assertFalse(RichChatFilePolicy.isArtifactPath(".zip"))
        assertFalse(RichChatFilePolicy.isArtifactPath("out/file.png"))
    }

    // -- markdown link parsing ---------------------------------------------

    @Test
    fun markdownLinkParsesStandaloneForms() {
        assertEquals(
            "zip" to "out/a.zip",
            RichChatFilePolicy.markdownLink("[zip](out/a.zip)"),
        )
        assertEquals(
            "f" to "out/a b.zip",
            RichChatFilePolicy.markdownLink("[f](<out/a b.zip>)"),
        )
        assertEquals(
            "f" to "out/a%20b.zip",
            RichChatFilePolicy.markdownLink("[f](out/a%20b.zip)"),
        )
        // Escaped parens collapse once at parse: literal ) reaches the path
        assertEquals(
            "f" to "out/a)b.zip",
            RichChatFilePolicy.markdownLink("[f](out/a\\)b.zip)"),
        )
        assertNull(RichChatFilePolicy.markdownLink("[f](out/a.zip) trailing"))
        assertNull(RichChatFilePolicy.markdownLink("text [f](out/a.zip)"))
        assertNull(RichChatFilePolicy.markdownLink("![img](out/a.png)"))
        // Angle destinations consume the final ) exactly
        assertEquals("f" to "out.zip", RichChatFilePolicy.markdownLink("[f](<out.zip>)"))
    }

    @Test
    fun markdownFileRefDecodesDestinationOnce() {
        // URL schemes decode through localPath; bare destinations decode once
        val ref = RichChatFilePolicy.markdownFileRef("[x](out%20dir/report.pdf)".let {
            RichChatFilePolicy.markdownLink(it)!!.second
        })
        assertEquals("out dir/report.pdf", ref?.path)
        assertEquals("report.pdf", ref?.fileName)
        // Encoded traversal rejects after decoding
        val evil = RichChatFilePolicy.markdownLink("[x](%2e%2e/etc/passwd.zip)")!!.second
        assertNull(RichChatFilePolicy.markdownFileRef(evil))
    }

    // -- typed file refs -----------------------------------------------------

    @Test
    fun typedFileRefBypassesArtifactGateButNotSafety() {
        // Typed files accept any safe local path, even non-artifact extensions
        val ref = RichChatFilePolicy.typedFileRef("/repo/out.bin", "build.bin")
        assertEquals("/repo/out.bin", ref?.path)
        assertEquals("build.bin", ref?.fileName)
        assertTrue(ref!!.isTypedFile)
        // Traversal is rejected at classification time, not only at resolve
        assertNull(RichChatFilePolicy.typedFileRef("../out.zip", null))
        assertNull(RichChatFilePolicy.typedFileRef("https://host/out.zip", null))
        assertNull(RichChatFilePolicy.typedFileRef("a/../out.zip", null))
    }

    // -- resolve: containment vs external -------------------------------------

    @Test
    fun resolveClassifiesAccessCorrectly() {
        // Relative -> project
        assertEquals(
            RichChatFileAccess.Project("out/a.zip"),
            RichChatFilePolicy.resolve("out/a.zip", posix),
        )
        // Contained absolute -> project-relative
        assertEquals(
            RichChatFileAccess.Project("out/a.zip"),
            RichChatFilePolicy.resolve("/repo/app/out/a.zip", posix),
        )
        // Windows case-insensitive containment
        assertEquals(
            RichChatFileAccess.Project("out/a.zip"),
            RichChatFilePolicy.resolve("c:/repo/app/out/a.zip", windows),
        )
        // Outside absolute -> external
        assertEquals(
            RichChatFileAccess.External("/other/a.zip"),
            RichChatFilePolicy.resolve("/other/a.zip", posix),
        )
        // UNC outside a windows drive root -> external (UNC preserved)
        assertEquals(
            RichChatFileAccess.External("//server/share/a.zip"),
            RichChatFilePolicy.resolve("\\\\server\\share\\a.zip", windows),
        )
    }

    @Test
    fun resolveWslComparesLinuxAndUncRoots() {
        // Inside the WSL Linux root -> project
        assertEquals(
            RichChatFileAccess.Project("out/a.zip"),
            RichChatFilePolicy.resolve("/repo/app/out/a.zip", wsl),
        )
        // Inside the UNC bridge -> project too
        assertEquals(
            RichChatFileAccess.Project("out/a.zip"),
            RichChatFilePolicy.resolve("//wsl.localhost/Ubuntu/repo/app/out/a.zip", wsl),
        )
    }

    @Test
    fun resolveRejectsTraversalAndSpecialPaths() {
        try {
            RichChatFilePolicy.resolve("../out.zip", posix)
            fail("traversal must throw")
        } catch (e: RichChatFilePolicyException) {
            assertEquals("traversal", e.reason)
        }
        // `..` never collapses mid-path either
        try {
            RichChatFilePolicy.resolve("/repo/app/../out.zip", posix)
            fail("mid traversal must throw")
        } catch (e: RichChatFilePolicyException) {
            assertEquals("traversal", e.reason)
        }
        // Root itself is invalid
        try {
            RichChatFilePolicy.resolve("/", posix)
            fail("root must throw")
        } catch (e: RichChatFilePolicyException) {
            assertEquals("root_is_not_file", e.reason)
        }
        // Remote locations refuse to read the wrong host
        val remote = PosixProjectLocation("/repo/app", remoteServerId = "srv-2")
        try {
            RichChatFilePolicy.resolve("/repo/app/out.zip", remote)
            fail("remoteServerId must throw")
        } catch (e: RichChatFilePolicyException) {
            assertEquals("unsupported_location", e.reason)
        }
        // POSIX "/" root contains every absolute descendant
        val root = PosixProjectLocation("/")
        assertEquals(
            RichChatFileAccess.Project("repo/app/out.zip"),
            RichChatFilePolicy.resolve("/repo/app/out.zip", root),
        )
        // UNC under a "/" root is never a descendant
        assertEquals(
            RichChatFileAccess.External("//server/share/a.zip"),
            RichChatFilePolicy.resolve("//server/share/a.zip", root),
        )
    }

    // -- filename + response semantics -----------------------------------------

    @Test
    fun sanitizedFileNameRejectsEscapes() {
        assertEquals("out.zip", RichChatFilePolicy.sanitizedFileName("out.zip"))
        assertEquals("download", RichChatFilePolicy.sanitizedFileName(".."))
        assertEquals("download", RichChatFilePolicy.sanitizedFileName("."))
        assertEquals("download", RichChatFilePolicy.sanitizedFileName(""))
        assertEquals("download", RichChatFilePolicy.sanitizedFileName("  "))
        // Separators and controls are stripped to a single safe basename
        assertEquals("evil.zip", RichChatFilePolicy.sanitizedFileName("a/b/../../evil.zip"))
        assertEquals("a b.zip", RichChatFilePolicy.sanitizedFileName("a\u0001b.zip".replace("\u0001", " ")))
    }

    @Test
    fun attachmentResponseRequiresBothHeaders() {
        assertTrue(
            RichChatFilePolicy.isAttachmentResponse(
                "attachment; filename=\"a.zip\"", "application/octet-stream",
            ),
        )
        assertFalse(
            RichChatFilePolicy.isAttachmentResponse("inline", "application/octet-stream"),
        )
        assertFalse(
            RichChatFilePolicy.isAttachmentResponse("attachment", "application/zip"),
        )
        assertFalse(RichChatFilePolicy.isAttachmentResponse(null, "application/octet-stream"))
        assertFalse(RichChatFilePolicy.isAttachmentResponse("attachment", null))
    }

    @Test
    fun localhostFileUrlResolvesToLocalRoot() {
        // file://localhost is the local root, never a UNC host.
        assertEquals(
            "/repo/app/out.zip",
            RichChatFilePolicy.localPath("file://localhost/repo/app/out.zip"),
        )
        assertEquals(
            "C:/repo/app/out.zip",
            RichChatFilePolicy.localPath("file://localhost/C:/repo/app/out.zip"),
        )
        val access = RichChatFilePolicy.resolve(
            RichChatFilePolicy.localPath("file://localhost/repo/app/out.zip")!!,
            posix,
        )
        assertEquals(RichChatFileAccess.Project("out.zip"), access)
    }

    @Test
    fun percentDecodeKeepsSurrogatePairs() {
        // Literal emoji mixed with a percent escape must survive intact.
        assertEquals(
            "out/📦 archive.zip",
            RichChatFilePolicy.percentDecodeOnce("out/📦%20archive.zip"),
        )
        assertEquals(
            "out/📦 archive.zip",
            RichChatFilePolicy.percentDecodeOnce("out/%F0%9F%93%A6%20archive.zip"),
        )
    }
}
