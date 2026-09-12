package com.poracode.app.protocol

import org.junit.Assert.assertThrows
import org.junit.Test

class CleartextPolicyTest {
    @Test
    fun allowsPrivateHttp() {
        CleartextPolicy.enforce("http://192.168.1.20:49152/")
        CleartextPolicy.enforce("http://10.0.2.2:49152/")
        CleartextPolicy.enforce("http://127.0.0.1:49152/")
    }

    @Test
    fun allowsHttpsAnywhere() {
        CleartextPolicy.enforce("https://example.com/")
        CleartextPolicy.enforce("https://8.8.8.8/")
    }

    @Test
    fun rejectsPublicHttp() {
        assertThrows(CleartextNotAllowedException::class.java) {
            CleartextPolicy.enforce("http://example.com/")
        }
        assertThrows(CleartextNotAllowedException::class.java) {
            CleartextPolicy.enforce("http://8.8.8.8/")
        }
    }

    @Test
    fun rejectsHostnamePrefixFalsePositives() {
        // Must not treat fc-/fe80- hostnames as private IPv6.
        assertThrows(CleartextNotAllowedException::class.java) {
            CleartextPolicy.enforce("http://fc-prod.example.com/")
        }
        assertThrows(CleartextNotAllowedException::class.java) {
            CleartextPolicy.enforce("http://10.example.com/")
        }
    }
}
