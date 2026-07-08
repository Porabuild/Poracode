# Poracode — Brand Guide

> Status: **finalized v1** · Reviewed from scratch, 2026-06-28 · Supersedes "Lightcode".
> Working artifacts: `branding/poracode-concepts.html` (system), `branding/assets/preview.html` (rendered), `branding/assets/` (masters + build script).

---

## 1. At a glance

- **Brand / spoken name:** **Pora** — from Ukrainian/Russian _пора_, "it's time". Evokes a moment, a turning point, dawn.
- **Flagship product:** **Poracode** — the universal AI coding-agent orchestrator (Claude, Codex, Gemini in one place).
- **The idea that ties it together — the "Pora dot":** a single accent dot that is, at once, the **code cursor**, the **dot in the logotype**, and the **moment** (_it's time_). It recurs in the icon, the logotype, and the in-app cursor. Repetition is what makes it ownable.
- **Tagline:** **"It's time to code."**
- **One-liner:** _The universal AI coding-agent orchestrator — run Claude, Codex & Gemini side by side._

---

## 2. Naming architecture

The legal entity, the brand, and the product names are three layers and intentionally differ.

| Layer                               | Name               | Notes                                                                                                      |
| ----------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Brand / umbrella (spoken, the mark) | **Pora**           | Never registered/marketed as bare "**Pora AI**" — too close to the unrelated _PORA AI_ skincare mark.      |
| Legal company                       | **Poracode, Inc.** | Suffix per jurisdiction (Inc. / OÜ / Ltd). Matches the strongest asset (poracode.com + the PORACODE mark). |
| Product — app                       | **Poracode**       | Open-source desktop orchestrator.                                                                          |
| Product — CLI                       | **Poracode CLI**   | Command-line tool.                                                                                         |
| Product — hosted tier               | **Poracode Cloud** | **Not** "Pora Cloud."                                                                                      |

### Why **Poracode Cloud**, not "Pora Cloud"

1. **Consistency** — every product shares one root: _Poracode_ · _Poracode CLI_ · _Poracode Cloud_. "Pora Cloud" splits the family across two names.
2. **Clarity** — "Poracode Cloud" unambiguously reads as _the hosted version of Poracode_. "Pora Cloud" sounds like a separate product.
3. **Trademark safety** — keeps every product on the distinctive **PORACODE** mark and away from _PORA AI_.

_"Pora" stays the friendly spoken brand and the icon; the products are all "Poracode \_\_\_". You can still hold `pora.cloud` as a redirect to `poracode.com/cloud`._

### Provider guardrail (firm)

Never put **Claude / Codex / Gemini** in a product name — they're other companies' trademarks and the app is provider-agnostic by design. They are **integrations you list**: _"Poracode — run Claude, Codex & Gemini in one place."_ Inside the UI they appear only as selectable agents.

---

## 3. Logo & icon

### The mark

A bold geometric **"P"** + the **Pora dot** at the baseline-right (reads as `P.` — a cursor / period at rest).

- **Construction:** stem + bowl as a single filled letterform (`fill-rule: evenodd` counter); the dot is a separate circle, baseline-aligned to the stem foot, offset right. Master: `branding/assets/poracode-icon.svg`.
- **Clearspace:** keep padding ≥ the height of the dot on all sides of the glyph.
- **Min sizes:** glyph works to **16px** (favicon verified). Below 20px, prefer the glyph-only version (no rounded tile).

### Variants

| Variant             | File                        | Use                                                                                 |
| ------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| Primary (dark tile) | `poracode-icon.svg`         | App icon, default everywhere                                                        |
| Light tile          | `poracode-icon-light.svg`   | On dark photography / when a light chip is needed                                   |
| Glyph (no tile)     | `poracode-glyph.svg`        | In-app header, monochrome contexts (inherits `currentColor`; dot stays indigo)      |
| Nightly channel     | `poracode-icon-nightly.svg` | Nightly build — deep-indigo tile `#131228` + **ice** dot to distinguish from stable |

### Misuse (don't)

- ❌ Don't recolor the **tile** orange or any warm hue (Claude's territory; "P-on-orange" reads wrong).
- ❌ Don't put the dot in the **middle** of the letterform — it sits at the **baseline**.
- ❌ Don't add gradients, bevels, or shadows. Flat, single-color P + single-color dot.
- ❌ Don't stretch, rotate, or recolor the P body to anything but moonlight (light bg) or ink (dark-on-light).

---

## 4. The Pora dot (motif rules)

- Exactly **one** dot. It is the **indigo accent** (`#8B7BFF`) — the only chromatic element in an otherwise moonlight/ink composition.
- It always sits at the **baseline**, never centered.
- It recurs as: the icon dot · the **`.`** in the logotype · the active text cursor in the product UI · loading/active state accents.

---

## 5. Logotype (wordmark)

- **Logotype:** **`Pora.code`** — set in Geist Sans; "Pora" in 700, "code" in 600; the dot is the indigo **baseline** dot. ⚠️ The dot must be a **true round circle** (the Pora dot), drawn as its own element — **never the font's period glyph**, because Geist renders periods as a _square_. Place it low/at the baseline, not centered.
- **Written product name (prose, stores, legal):** **Poracode** — one word, no dot.
- **CLI / technical lockup:** `pora.code` lowercase in Geist Mono.
- **Tier lockup:** glyph + **Poracode Cloud** (Cloud in `--dim`).

> Logo ≠ name: the logo is `Pora.code` (with the dot device); the name you type is `Poracode`.

---

## 6. Color

Dark-first. Moonlight + ink + one cool accent. **No orange, ever.**

| Token      | Hex           | Role                                                      |
| ---------- | ------------- | --------------------------------------------------------- |
| Night      | `#070709`     | Page / canvas background                                  |
| Tile       | `#0E0E14`     | Icon tile, panels, raised surfaces                        |
| Moon       | `#EAF0FB`     | Primary text / the P on dark                              |
| Dim        | `#9BA6BE`     | Secondary text, muted "Cloud", facets                     |
| **Indigo** | **`#8B7BFF`** | **Primary accent** — the dot, links, active states, focus |
| Ice        | `#5EE6E0`     | Secondary accent — nightly channel, subtle highlights     |
| Ink        | `#0E0E14`     | The P on light backgrounds                                |

Contrast: Moon `#EAF0FB` on Tile `#0E0E14` ≈ 16:1 (AAA). Indigo `#8B7BFF` on Tile ≈ 6.3:1 (AA for UI/large text) — use it for accents and large/medium type, not body copy.

---

## 7. Typography

**Type system: Geist** — Vercel's open-source family, purpose-built for developer products. Free (SIL OFL). Pairs a geometric sans with a matched mono.

| Role                                                 | Typeface                    | Notes                                                                     |
| ---------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| Brand wordmark, headings, UI                         | **Geist Sans**              | Weights 400 / 500 / 600 / 700                                             |
| Code, the "code" fragment, the dot, technical labels | **Geist Mono**              | The terminal/editor surfaces may keep **JetBrains Mono** if already wired |
| System fallback                                      | **Inter**, then `system-ui` | If Geist isn't loaded                                                     |

Webfont (marketing/site): `@import` Geist + Geist Mono from Google Fonts; Inter as fallback.

### Type scale (marketing / docs)

| Step    | Size / line    | Use                      |
| ------- | -------------- | ------------------------ |
| Display | 48 / 1.05, 700 | Hero                     |
| H1      | 32 / 1.1, 700  | Page title               |
| H2      | 24 / 1.2, 600  | Section                  |
| H3      | 18 / 1.3, 600  | Subsection               |
| Body    | 16 / 1.6, 400  | Copy                     |
| Small   | 13 / 1.5, 400  | Captions                 |
| Mono    | 14 / 1.5       | Code, the dot, technical |

Letter-spacing: `-0.02em` on display/H1 wordmark; default elsewhere.

---

## 8. Voice & tagline

- **Tagline:** _It's time to code._
- **Descriptor:** _The universal AI coding-agent orchestrator — run Claude, Codex & Gemini side by side._
- **Tone:** precise, calm, builder-to-builder. Not hypey. Lowercase-friendly in technical contexts (`pora.code`), title-case for the brand (Poracode).

---

## 9. Assets & regeneration

Masters (vector, source of truth): `branding/assets/poracode-icon.svg`, `-light.svg`, `-nightly.svg`, `-glyph.svg`.

Regenerate all raster + platform assets (uses the repo's `sharp` + macOS `iconutil`):

```
node branding/assets/build-icons.mjs
```

Outputs to `branding/assets/out/`:

- `build/` — `icon.{png,icns,ico}` + ladder; `icon-nightly.{png,icns,ico}` + ladder
- `website/` — `favicon.ico`, `favicon-48x48.png`, `favicon-96x96.png`, `icon-192.png`, `icon-512.png`, `icon.png`

Native Capacitor projects (writes into `ios/` and `android/` in place — app
icons, Android adaptive-icon layers, and dark splash screens):

```
node branding/assets/build-native-assets.mjs
```

---

## 10. Domains, handles, trademark

- **Primary:** `poracode.com` ✅ free · npm `poracode` ✅ · GitHub user+org `poracode` ✅ · `com.poracode.app` (appId)
- **Tier:** `poracode.com/cloud` (hold `pora.cloud` ✅ as redirect)
- **Umbrella short links:** `pora.sh` ✅ / `trypora.com` ✅
- **Trademark to file:** **PORACODE** (word mark), Nice classes **9** (software) + **42** (SaaS). Clear against _PORA AI_ (skincare, different field → coexistence likely) before the paid tier. This is the one mark to clear.

---

## 11. Next: the code rename (separate, gated)

The codebase rename (Lightcode → Poracode) is planned but **gated on two decisions**:

1. Migrate `~/.lightcode` → `~/.poracode` (one-time auto-rename on first launch to preserve user data)?
2. Change appId `com.lightcode.app` → `com.poracode.app` (resets macOS keychain → users re-auth providers)?

Full plan in chat history (Phases A–F: brand config → mechanical sweeps → migration → strings/i18n → docs → external). The icon/favicon assets in `branding/assets/out/` drop into `build/` and `website/public/` as part of Phase E.
