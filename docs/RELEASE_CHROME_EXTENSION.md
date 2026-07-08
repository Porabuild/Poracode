# Poracode Chrome Extension release

The Chrome extension ships independently from the desktop app. Its release
source of truth is:

- `chrome-extension/manifest.json` for the store version.
- `chrome-extension/CHANGELOG.md` for extension-specific release notes.
- `.github/workflows/release-chrome-extension.yml` for tagging, packaging,
  GitHub Release creation, and Web Store submission.

## First Web Store submission

The first submission is manual because the Chrome Web Store item must exist
before automation has an extension ID to update.

1. Update `chrome-extension/manifest.json` and `chrome-extension/CHANGELOG.md`.
2. Run `Actions -> Release Chrome Extension` with `dry_run` enabled.
3. Download the `poracode-chrome-extension-vX.Y.Z` artifact from the workflow run.
4. Upload the ZIP in the Chrome Web Store Developer Dashboard.
5. Complete the listing, privacy, distribution, and test-instructions tabs.
6. Submit the item for review from the dashboard.
7. Add the new Chrome Web Store item ID to the `chrome-extension` environment.

## Automated updates

After the first item exists, configure the `chrome-extension` GitHub environment
with these secrets:

| Secret                          | Meaning                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `CHROME_WEBSTORE_CLIENT_ID`     | OAuth client ID with Chrome Web Store API access.         |
| `CHROME_WEBSTORE_CLIENT_SECRET` | OAuth client secret.                                      |
| `CHROME_WEBSTORE_REFRESH_TOKEN` | Refresh token for the owning Web Store developer account. |
| `CHROME_WEBSTORE_PUBLISHER_ID`  | Publisher ID from the Developer Dashboard.                |
| `CHROME_EXTENSION_ID`           | Existing Chrome Web Store item ID.                        |

Then run `Actions -> Release Chrome Extension`. The workflow validates the
manifest and changelog, bumps `manifest.json` if the workflow input supplies a
new version, creates and pushes `chrome-extension-vX.Y.Z`, packages the tagged
extension, creates a GitHub Release with the ZIP attached, uploads the same ZIP
through the Chrome Web Store API, and submits it for review.

## Release checklist

1. Bump `chrome-extension/manifest.json` to the next `X.Y.Z` version.
2. Add a matching `## X.Y.Z - YYYY-MM-DD` entry to `chrome-extension/CHANGELOG.md`.
3. Run the workflow with `dry_run` enabled and test the artifact as an unpacked extension.
4. Run the workflow without `dry_run` to tag, create the GitHub Release, and submit to the Web Store.
5. Check the Web Store review status in the Developer Dashboard.
