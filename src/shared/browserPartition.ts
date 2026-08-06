/**
 * Electron session partition for the in-app browser. Kept at the pre-rebrand name
 * so browser cookies and provider sign-ins survive the Lightcode → Poracode
 * rename; changing it silently signs the user out of every site. Shared so the
 * renderer's `<webview>`, the login capture, and the cookie mirror cannot drift.
 */
export const BROWSER_SESSION_PARTITION = "persist:lightcode-browser";
