# Poracode Chrome Extension Changelog

## 0.2.2 - 2026-10-08

- Security: sidebar reloads and reconnects now prove the current local app before sending credentials. Saved credentials from 0.2.1 and earlier are never reused by the updated sidebar; it pairs afresh and checks its proven connection before requests, token refreshes and event connections. Update and reload the extension to receive this protection.

## 0.2.1 - 2026-10-07

- Security: the extension no longer sends Poracode's connection secret to whatever answers on a local port. Version 0.2.0 sent it in its first message; 0.2.1 proves the secret without sending it, and the app must prove it back before chat or browser control starts, so another program on your computer cannot pose as Poracode. Browser control needs a Poracode version with this check. Apps with this fix give a 0.2.0 install no chat credentials, so update the extension.
- When more than one Poracode app is running, the extension connects to the one registered with the browser helper instead of staying on an older app that answered first.

## 0.2.0 - 2026-10-07

- Chat from the browser sidebar using the same conversations, composer, and provider controls as Poracode.
- The sidebar connects automatically to the running local app and reconnects when it returns, with no pairing screen. It recovers on its own when the app's browser helper becomes available after the connection opens, and reports when the running app is too old for the sidebar.
- New sidebar conversations enable Chrome tools by default.
- GUI-only chat selection and sidebar preferences stay independent of the Electron app’s navigation.
- Each message tells the agent that the browser is your focus and which tab is active in the sidebar’s window when you send it (tab id, title and the page address without its query or fragment; page content is not sent). Provider commands such as `/compact` are sent unchanged.

## 0.1.0 - 2026-07-06

- Initial companion extension for connecting Poracode to a local Chrome-compatible browser.
- Relays tabs, tab groups, navigation, screenshots, DOM snapshots, and CDP commands through the desktop bridge.
