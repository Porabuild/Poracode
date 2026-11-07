# Store listings

Copy for the Chrome Web Store and Microsoft Edge Add-ons listings, and the
one-time setup that lets `release-chrome-extension.yml` publish to them.

## Listing copy

**Name:** Poracode

**Summary** (132 characters at most):

> Chat with Poracode in your browser's side panel and let your coding agents work with your tabs, through the Poracode app.

**Category:** Developer Tools

**Description:**

> Poracode brings your coding agents into the browser.
>
> - Chat from the side panel with the same conversations, composer and provider controls as the Poracode app.
> - Let agents work with your real tabs, cookies and logged-in sessions: open pages, read them, click, type and take screenshots, each thread in its own tab group.
> - Each message tells the agent which tab you are on, so "summarize this page" just works.
> - Connects automatically to the Poracode app on the same computer. No account, pairing code or token to enter.
>
> Requires the Poracode desktop app or `poracode serve` on the same computer. Get it at https://poracode.com/download.

**Privacy policy URL:** https://poracode.com/privacy

**Support URL:** https://poracode.com/support

## Single purpose

> Connect the browser to the Poracode app on the same computer, so the user can chat with their coding agents from the side panel and let those agents work with the user's tabs.

## Permission justifications

| Permission        | Justification                                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debugger`        | Agents read and operate tabs (navigate, read the page, click, type, screenshot) through the Chrome DevTools Protocol. Chrome shows its "started debugging this browser" banner while this is active. |
| `tabs`            | List open tabs and open or switch the tab an agent works in; tell the agent which tab the user is on.                                                                                                |
| `tabGroups`       | Keep each conversation's tabs in its own named tab group.                                                                                                                                            |
| `storage`         | Remember the last local port that worked, each conversation's tab group, and whether another browser holds the connection.                                                                           |
| `alarms`          | Keep the local connection alive and reconnect when the Poracode app restarts.                                                                                                                        |
| `sidePanel`       | Show the chat in the browser's side panel.                                                                                                                                                           |
| `nativeMessaging` | Ask the helper that the Poracode app installs for this browser for the local connection's per-launch secret, so the extension and app can prove themselves to each other.                            |

**Remote code:** No. All code ships in the package; the extension connects only to the Poracode app on `127.0.0.1`.

## Data disclosure

The extension sends data only to the Poracode app on the same computer, never to
Poracode's servers, and sends no analytics. Disclose what the app's agents can
receive:

- **Website content:** page content an agent reads with browser tools, sent to the agent provider the user chose.
- **Web history:** the active tab's title and address (without query or fragment) sent with each message.

Certify that the data is not sold, is used only for the extension's purpose, and
is not used for creditworthiness or lending.

## One-time setup

Neither store accepts a first upload through its API, and the stores assign the
extension IDs.

1. Run **Release Chrome Extension** with **Dry run** checked. Download the
   `poracode-chrome-extension-v<version>` artifact: it is the store package,
   without the manifest `key`.
2. **Chrome Web Store:** in the developer dashboard, create an item by uploading
   that zip, fill in the listing above and submit it. From **Package**, copy the
   item ID and the public key.
3. **Microsoft Edge Add-ons:** in Partner Center, create an extension with the
   same zip and listing and submit it. Copy the product ID and the extension ID
   from **Extension identity**. Under **Publish API**, enable the new
   experience and create API credentials (client ID and API key).
4. Add the secrets to the repository's `chrome-extension` environment:
   - Chrome Web Store: `CHROME_EXTENSION_ID`, `CHROME_WEBSTORE_PUBLISHER_ID`,
     `CHROME_WEBSTORE_CLIENT_ID`, `CHROME_WEBSTORE_CLIENT_SECRET`,
     `CHROME_WEBSTORE_REFRESH_TOKEN`.
   - Edge Add-ons: `EDGE_ADDONS_PRODUCT_ID`, `EDGE_ADDONS_CLIENT_ID`,
     `EDGE_ADDONS_API_KEY`.
5. In the code, set `manifest.json` `key` to the Chrome Web Store public key and
   list both store IDs in `CHROME_SIDEBAR_EXTENSION_IDS`
   (`src/shared/chromeSidebarProtocol.ts`). The native host trusts only those
   IDs, so store installs can chat once a Poracode release with them is out.
   Then set the listing URLs in `website/src/lib/extensionStores.ts`.

A store whose secrets are missing is skipped: its publish job does not run, and
the release still produces the tagged GitHub Release with the store package.
