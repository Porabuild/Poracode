package com.poracode.sshbridge;

import static org.junit.Assert.assertEquals;

import java.io.IOException;
import net.schmizz.sshj.userauth.UserAuthException;
import org.junit.Test;

public class SshBridgePluginTest {
    @Test
    public void classifiesAuthenticationFailuresSeparatelyFromTransportFailures() {
        assertEquals(
            "SSH_AUTHENTICATION_FAILED",
            SshBridgePlugin.connectErrorCode(new UserAuthException("Permission denied"))
        );
        assertEquals(
            "SSH_AUTHENTICATION_FAILED",
            SshBridgePlugin.connectErrorCode(
                new IllegalStateException(new UserAuthException("No authentication methods succeeded"))
            )
        );
        assertEquals(
            "SSH_CONNECT_FAILED",
            SshBridgePlugin.connectErrorCode(new IOException("Connection refused"))
        );
    }
}
