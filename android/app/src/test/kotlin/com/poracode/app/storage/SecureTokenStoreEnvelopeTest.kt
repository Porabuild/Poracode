package com.poracode.app.storage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Explicit v0/v1 migration/invalidation tests per versioning checklist.
 * Version is in the envelope, not the filename.
 */
class SecureTokenStoreEnvelopeTest {
    @Test
    fun filenameIsUnversioned() {
        assertEquals("remote_access_token.enc", KeystoreSecureTokenStore.TOKEN_FILE_NAME)
        assertTrue(!KeystoreSecureTokenStore.TOKEN_FILE_NAME.contains("v1"))
        assertTrue(!KeystoreSecureTokenStore.TOKEN_FILE_NAME.contains("v0"))
    }

    @Test
    fun encodeDecodeV1() {
        val encoded = KeystoreSecureTokenStore.encodeEnvelope(1, "ciphertext-base64")
        assertEquals("v1:ciphertext-base64", encoded)
        val decoded = KeystoreSecureTokenStore.decodeEnvelope(encoded)
        assertTrue(decoded is TokenEnvelope.Valid)
        val valid = decoded as TokenEnvelope.Valid
        assertEquals(1, valid.version)
        assertEquals("ciphertext-base64", valid.ciphertext)
    }

    @Test
    fun decodeLegacyV0BareCiphertext() {
        val decoded = KeystoreSecureTokenStore.decodeEnvelope("legacyBase64Ciphertext==")
        assertTrue(decoded is TokenEnvelope.Valid)
        val valid = decoded as TokenEnvelope.Valid
        assertEquals(0, valid.version)
        assertEquals("legacyBase64Ciphertext==", valid.ciphertext)
    }

    @Test
    fun unknownFutureVersionInvalidated() {
        val decoded = KeystoreSecureTokenStore.decodeEnvelope("v2:something")
        assertEquals(TokenEnvelope.Invalid, decoded)
    }

    @Test
    fun emptyV1BodyInvalidated() {
        assertEquals(
            TokenEnvelope.Invalid,
            KeystoreSecureTokenStore.decodeEnvelope("v1:"),
        )
    }

    @Test
    fun emptyRawInvalidated() {
        assertEquals(
            TokenEnvelope.Invalid,
            KeystoreSecureTokenStore.decodeEnvelope("   "),
        )
    }

    @Test
    fun dataStoreNameUnversioned() {
        assertEquals("poracode_connection", ConnectionMetadataStore.DATA_STORE_NAME)
        assertTrue(!ConnectionMetadataStore.DATA_STORE_NAME.contains("v1"))
    }
}
