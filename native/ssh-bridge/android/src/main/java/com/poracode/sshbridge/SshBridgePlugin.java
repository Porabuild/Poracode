package com.poracode.sshbridge;

import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.Provider;
import java.security.PublicKey;
import java.security.Security;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.common.Buffer;
import net.schmizz.sshj.common.SecurityUtils;
import net.schmizz.sshj.connection.channel.direct.LocalPortForwarder;
import net.schmizz.sshj.connection.channel.direct.Parameters;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.sftp.SFTPClient;
import net.schmizz.sshj.transport.verification.HostKeyVerifier;
import net.schmizz.sshj.transport.verification.FingerprintVerifier;
import net.schmizz.sshj.userauth.UserAuthException;
import net.schmizz.sshj.userauth.keyprovider.KeyProvider;
import net.schmizz.sshj.xfer.InMemorySourceFile;
import org.bouncycastle.jce.provider.BouncyCastleProvider;

@CapacitorPlugin(name = "SshBridge")
public class SshBridgePlugin extends Plugin {
    private static final int MAX_OUTPUT_BYTES = 256 * 1024;
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private final Map<String, ConnectionState> connections = new ConcurrentHashMap<>();

    private static final class ConnectionState {
        final SSHClient client;
        volatile ServerSocket forwardSocket;
        volatile Thread forwardThread;

        ConnectionState(SSHClient client) {
            this.client = client;
        }

        void close() {
            try {
                if (forwardSocket != null) forwardSocket.close();
            } catch (IOException ignored) {}
            if (forwardThread != null) forwardThread.interrupt();
            try {
                client.disconnect();
            } catch (IOException ignored) {}
            try {
                client.close();
            } catch (IOException ignored) {}
        }
    }

    private static final class CapturingVerifier implements HostKeyVerifier {
        String fingerprint;
        String algorithm;

        @Override
        public boolean verify(String hostname, int port, PublicKey key) {
            try {
                Buffer.PlainBuffer buffer = new Buffer.PlainBuffer();
                buffer.putPublicKey(key);
                byte[] digest = MessageDigest.getInstance("SHA-256").digest(buffer.getCompactData());
                fingerprint = "SHA256:" + Base64.encodeToString(digest, Base64.NO_WRAP | Base64.NO_PADDING);
                algorithm = key.getAlgorithm();
                return true;
            } catch (Exception error) {
                return false;
            }
        }

        @Override
        public List<String> findExistingAlgorithms(String hostname, int port) {
            return Collections.emptyList();
        }
    }

    @PluginMethod
    public void probeHostKey(PluginCall call) {
        execute(() -> {
            String host = requiredString(call, "host");
            Integer port = call.getInt("port", 22);
            if (host == null || port == null) return;
            CapturingVerifier verifier = new CapturingVerifier();
            try (SSHClient client = configuredClient(verifier)) {
                client.connect(host, port);
                JSObject result = new JSObject();
                result.put("fingerprint", verifier.fingerprint);
                result.put("algorithm", verifier.algorithm);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(message(error, "Unable to probe SSH host key."), "SSH_PROBE_FAILED", asException(error));
            }
        });
    }

    @PluginMethod
    public void connect(PluginCall call) {
        execute(() -> {
            String connectionId = requiredString(call, "connectionId");
            String host = requiredString(call, "host");
            String username = requiredString(call, "username");
            String fingerprint = requiredString(call, "hostKeyFingerprint");
            Integer port = call.getInt("port", 22);
            JSObject authentication = call.getObject("authentication");
            if (connectionId == null || host == null || username == null || fingerprint == null || port == null || authentication == null) {
                if (authentication == null) call.reject("Missing SSH authentication.", "SSH_INVALID_INPUT");
                return;
            }
            disconnect(connectionId);
            SSHClient client = null;
            try {
                client = configuredClient(FingerprintVerifier.getInstance(fingerprint));
                client.connect(host, port);
                authenticate(client, username, authentication, connectionId);
                connections.put(connectionId, new ConnectionState(client));
                call.resolve();
            } catch (Exception error) {
                if (client != null) {
                    try { client.close(); } catch (IOException ignored) {}
                }
                call.reject(message(error, "Unable to connect over SSH."), connectErrorCode(error), asException(error));
            }
        });
    }

    @PluginMethod
    public void run(PluginCall call) {
        execute(() -> {
            String connectionId = requiredString(call, "connectionId");
            String script = requiredString(call, "script");
            if (connectionId == null || script == null) return;
            ConnectionState state = connections.get(connectionId);
            if (state == null) {
                call.reject("SSH connection is not active.", "SSH_NOT_CONNECTED");
                return;
            }
            int timeoutMs = call.getInt("timeoutMs", 60_000);
            try (Session session = state.client.startSession()) {
                Session.Command command = session.exec(buildScriptCommand(call.getArray("args")));
                command.getOutputStream().write(script.getBytes(StandardCharsets.UTF_8));
                command.getOutputStream().close();
                CompletableFuture<String> stdout = readBounded(command.getInputStream());
                CompletableFuture<String> stderr = readBounded(command.getErrorStream());
                command.join(timeoutMs, TimeUnit.MILLISECONDS);
                Integer status = command.getExitStatus();
                int exitCode = status == null ? 255 : status;
                JSObject result = new JSObject();
                result.put("stdout", stdout.get(5, TimeUnit.SECONDS));
                result.put("stderr", stderr.get(5, TimeUnit.SECONDS));
                result.put("exitCode", exitCode);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(message(error, "Remote SSH command failed."), "SSH_COMMAND_FAILED", asException(error));
            }
        });
    }

    @PluginMethod
    public void upload(PluginCall call) {
        execute(() -> {
            String connectionId = requiredString(call, "connectionId");
            String remotePath = requiredString(call, "remotePath");
            String base64 = requiredString(call, "base64");
            if (connectionId == null || remotePath == null || base64 == null) return;
            ConnectionState state = connections.get(connectionId);
            if (state == null) {
                call.reject("SSH connection is not active.", "SSH_NOT_CONNECTED");
                return;
            }
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                try (SFTPClient sftp = state.client.newSFTPClient()) {
                    sftp.put(new InMemorySourceFile() {
                        @Override public String getName() { return "runtime.tar.gz"; }
                        @Override public long getLength() { return bytes.length; }
                        @Override public InputStream getInputStream() { return new ByteArrayInputStream(bytes); }
                    }, remotePath);
                }
                call.resolve();
            } catch (Exception error) {
                call.reject(message(error, "SSH upload failed."), "SSH_UPLOAD_FAILED", asException(error));
            }
        });
    }

    @PluginMethod
    public void forward(PluginCall call) {
        execute(() -> {
            String connectionId = requiredString(call, "connectionId");
            Integer remotePort = call.getInt("remotePort");
            if (connectionId == null || remotePort == null) return;
            ConnectionState state = connections.get(connectionId);
            if (state == null) {
                call.reject("SSH connection is not active.", "SSH_NOT_CONNECTED");
                return;
            }
            try {
                if (state.forwardSocket != null) state.forwardSocket.close();
                ServerSocket socket = new ServerSocket();
                socket.setReuseAddress(true);
                socket.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
                int localPort = socket.getLocalPort();
                LocalPortForwarder forwarder = state.client.newLocalPortForwarder(
                    new Parameters("127.0.0.1", localPort, "127.0.0.1", remotePort),
                    socket
                );
                Thread thread = new Thread(() -> {
                    try {
                        forwarder.listen();
                    } catch (IOException error) {
                        if (!socket.isClosed()) android.util.Log.w("SshBridge", "SSH forwarder stopped", error);
                    }
                }, "poracode-ssh-forward-" + connectionId);
                thread.setDaemon(true);
                state.forwardSocket = socket;
                state.forwardThread = thread;
                thread.start();
                JSObject result = new JSObject();
                result.put("endpoint", "http://127.0.0.1:" + localPort + "/");
                result.put("localPort", localPort);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(message(error, "Unable to open SSH tunnel."), "SSH_FORWARD_FAILED", asException(error));
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String connectionId = requiredString(call, "connectionId");
        if (connectionId == null) return;
        execute(() -> {
            disconnect(connectionId);
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        for (ConnectionState state : connections.values()) state.close();
        connections.clear();
    }

    private SSHClient configuredClient(HostKeyVerifier verifier) {
        ensureBouncyCastleProvider();
        SSHClient client = new SSHClient();
        client.setConnectTimeout(CONNECT_TIMEOUT_MS);
        client.setTimeout(60_000);
        client.addHostKeyVerifier(verifier);
        return client;
    }

    private static synchronized void ensureBouncyCastleProvider() {
        Provider current = Security.getProvider(BouncyCastleProvider.PROVIDER_NAME);
        if (!(current instanceof BouncyCastleProvider)) {
            Security.removeProvider(BouncyCastleProvider.PROVIDER_NAME);
            if (Security.insertProviderAt(new BouncyCastleProvider(), 1) < 0) {
                throw new IllegalStateException("Unable to install the Bouncy Castle provider.");
            }
        }
        SecurityUtils.setSecurityProvider(BouncyCastleProvider.PROVIDER_NAME);
    }

    private void authenticate(SSHClient client, String username, JSObject authentication, String connectionId) throws Exception {
        String kind = authentication.optString("kind", "");
        if ("password".equals(kind)) {
            client.authPassword(username, authentication.getString("password"));
            return;
        }
        if (!"private-key".equals(kind)) throw new IllegalArgumentException("Unsupported SSH authentication method.");
        String privateKey = authentication.getString("privateKey");
        String passphrase = authentication.optString("passphrase", "");
        File keyFile = new File(getContext().getCacheDir(), "ssh-key-" + connectionId);
        try {
            try (FileOutputStream output = new FileOutputStream(keyFile)) {
                output.write(privateKey.getBytes(StandardCharsets.UTF_8));
            }
            KeyProvider provider;
            try {
                provider = passphrase.isEmpty()
                    ? client.loadKeys(keyFile.getAbsolutePath())
                    : client.loadKeys(keyFile.getAbsolutePath(), passphrase);
            } catch (IOException error) {
                throw new UserAuthException(error);
            }
            client.authPublickey(username, provider);
        } finally {
            if (keyFile.exists() && !keyFile.delete()) {
                android.util.Log.w("SshBridge", "Could not delete temporary SSH key");
            }
        }
    }

    private static CompletableFuture<String> readBounded(InputStream stream) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int read;
                while ((read = stream.read(buffer)) >= 0) {
                    int remaining = MAX_OUTPUT_BYTES - output.size();
                    if (remaining > 0) output.write(buffer, 0, Math.min(read, remaining));
                }
                return new String(output.toByteArray(), StandardCharsets.UTF_8);
            } catch (IOException error) {
                throw new RuntimeException(error);
            }
        });
    }

    private static String buildScriptCommand(JSArray args) throws Exception {
        List<String> parts = new ArrayList<>();
        parts.add("sh");
        parts.add("-s");
        parts.add("--");
        if (args != null) {
            for (Object value : args.toList()) parts.add(shellQuote(String.valueOf(value)));
        }
        return String.join(" ", parts);
    }

    private static String shellQuote(String value) {
        return "'" + value.replace("'", "'\\''") + "'";
    }

    private String requiredString(PluginCall call, String name) {
        String value = call.getString(name);
        if (value == null || value.isBlank()) {
            call.reject("Missing " + name + ".", "SSH_INVALID_INPUT");
            return null;
        }
        return value;
    }

    private void disconnect(String connectionId) {
        ConnectionState state = connections.remove(connectionId);
        if (state != null) state.close();
    }

    private static String message(Throwable error, String fallback) {
        String value = error.getMessage();
        return value == null || value.isBlank() ? fallback : value;
    }

    static String connectErrorCode(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof UserAuthException) return "SSH_AUTHENTICATION_FAILED";
            current = current.getCause();
        }
        return "SSH_CONNECT_FAILED";
    }

    private static Exception asException(Throwable error) {
        return error instanceof Exception ? (Exception) error : new Exception(error);
    }
}
