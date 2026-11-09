#!/usr/bin/env node
// Generates the Android `PoracodeIcons` set from the lucide icons the PWA uses,
// so the native app shares the web client's line-icon language.
//   node scripts/generate-android-icons.mjs          # write
//   node scripts/generate-android-icons.mjs --check  # fail when stale
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(repoRoot, "package.json"));
const lucideRoot = dirname(require.resolve("lucide-react/package.json"));
const lucideVersion = JSON.parse(readFileSync(join(lucideRoot, "package.json"), "utf8")).version;
const output = join(
  repoRoot,
  "android/app/src/main/kotlin/com/poracode/app/ui/theme/PoracodeIcons.kt",
);

/** Kotlin name -> [lucide icon, options]. Names keep the Material identifiers they replace. */
const ICONS = {
  AccountTree: ["git-branch"],
  Add: ["plus"],
  AddCircleOutline: ["circle-plus"],
  Archive: ["archive"],
  ArrowBack: ["chevron-left", { autoMirror: true }],
  ArrowDown: ["arrow-down"],
  ArrowDropDown: ["chevron-down"],
  ArrowForward: ["arrow-right", { autoMirror: true }],
  ArrowUpward: ["arrow-up"],
  AttachFile: ["paperclip"],
  AutoAwesome: ["sparkles"],
  BarChart: ["chart-no-axes-column"],
  Block: ["ban"],
  Brain: ["brain"],
  Build: ["hammer"],
  CallMerge: ["git-merge"],
  CallSplit: ["git-fork"],
  Check: ["check"],
  CheckCircle: ["circle-check"],
  Checklist: ["list-checks"],
  ChevronsUpDown: ["chevrons-up-down"],
  Clear: ["x"],
  Close: ["x"],
  CloudOff: ["cloud-off"],
  Code: ["code"],
  ColorLens: ["palette"],
  Commit: ["git-commit-horizontal"],
  Computer: ["server"],
  ContentCopy: ["copy"],
  ContentPaste: ["clipboard-paste"],
  CreateNewFolder: ["folder-plus"],
  DataUsage: ["chart-pie"],
  Delete: ["trash-2"],
  DeleteOutline: ["trash-2"],
  DeleteSweep: ["list-x"],
  Description: ["file-text"],
  Dns: ["server"],
  Download: ["download"],
  DriveFileMove: ["folder-input"],
  Edit: ["pencil"],
  EditOff: ["pencil-off"],
  Error: ["circle-alert"],
  ErrorOutline: ["circle-alert"],
  ExpandLess: ["chevron-up"],
  ExpandMore: ["chevron-down"],
  Extension: ["puzzle"],
  Eye: ["eye"],
  FilterList: ["list-filter"],
  Folder: ["folder"],
  FolderOpen: ["folder-open"],
  FolderZip: ["folder-archive"],
  GitPullRequest: ["git-pull-request"],
  GripVertical: ["grip-vertical"],
  Groups: ["users"],
  History: ["history"],
  Home: ["house"],
  HourglassTop: ["hourglass"],
  Inbox: ["inbox"],
  Info: ["info"],
  InsertDriveFile: ["file"],
  Inventory2: ["package"],
  KeyboardArrowDown: ["chevron-down"],
  KeyboardArrowLeft: ["chevron-left", { autoMirror: true }],
  KeyboardArrowRight: ["chevron-right", { autoMirror: true }],
  KeyboardArrowUp: ["chevron-up"],
  Lan: ["network"],
  Laptop: ["laptop"],
  Link: ["link"],
  LinkOff: ["unlink"],
  Lock: ["lock"],
  Login: ["log-in", { autoMirror: true }],
  Logout: ["log-out", { autoMirror: true }],
  MarkChatUnread: ["message-circle"],
  Merge: ["git-merge"],
  Mic: ["mic"],
  // Filled so the dots read as plain dots inside circular glass buttons
  // instead of three small rings in a ring.
  MoreHoriz: ["ellipsis", { filled: true }],
  MoreVert: ["ellipsis-vertical", { filled: true }],
  NoPhotography: ["camera-off"],
  NorthEast: ["arrow-up-right"],
  NoteAdd: ["file-plus"],
  NoteAlt: ["notebook-pen"],
  Notifications: ["bell"],
  OpenInBrowser: ["external-link"],
  PauseCircle: ["circle-pause"],
  Person: ["circle-user-round"],
  PhotoCamera: ["camera"],
  PlayArrow: ["play"],
  PlayCircleOutline: ["circle-play"],
  PowerSettingsNew: ["power"],
  PrivacyTip: ["shield-alert"],
  Public: ["globe"],
  QrCode2: ["qr-code"],
  QrCodeScanner: ["scan-qr-code"],
  Radio: ["radio"],
  RadioButtonUnchecked: ["circle"],
  Remove: ["minus"],
  RateReview: ["message-square-text"],
  Refresh: ["refresh-cw"],
  RemoveCircleOutline: ["circle-minus"],
  Save: ["save"],
  Schedule: ["calendar-clock"],
  Search: ["search"],
  SearchCode: ["search-code"],
  Security: ["shield"],
  Send: ["arrow-up"],
  Settings: ["settings-2"],
  SettingsEthernet: ["plug"],
  SmartToy: ["bot"],
  Star: ["star"],
  Stop: ["square", { filled: true }],
  Storage: ["database"],
  SupportAgent: ["headset"],
  SwapHoriz: ["arrow-left-right"],
  Sync: ["refresh-cw"],
  SystemUpdate: ["download"],
  Terminal: ["terminal"],
  Tune: ["sliders-horizontal"],
  Undo: ["undo-2", { autoMirror: true }],
  VerifiedUser: ["shield-check"],
  VideocamOff: ["video-off"],
  Visibility: ["eye"],
  VisibilityOff: ["eye-off"],
  WarningAmber: ["triangle-alert"],
  Wifi: ["wifi"],
};

const num = (value) => Number(value);
const fmt = (value) => String(Math.round(value * 1000) / 1000);

function elementPath([tag, attrs]) {
  switch (tag) {
    case "path":
      return attrs.d;
    case "circle": {
      const [cx, cy, r] = [num(attrs.cx), num(attrs.cy), num(attrs.r)];
      return `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0`;
    }
    case "ellipse": {
      const [cx, cy, rx, ry] = [num(attrs.cx), num(attrs.cy), num(attrs.rx), num(attrs.ry)];
      return `M${fmt(cx - rx)} ${fmt(cy)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(2 * rx)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-2 * rx)} 0`;
    }
    case "rect": {
      const [x, y, w, h] = [
        num(attrs.x ?? 0),
        num(attrs.y ?? 0),
        num(attrs.width),
        num(attrs.height),
      ];
      const rx = Math.min(num(attrs.rx ?? attrs.ry ?? 0), w / 2);
      const ry = Math.min(num(attrs.ry ?? attrs.rx ?? 0), h / 2);
      if (!rx || !ry) return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}z`;
      const arc = (dx, dy) => `a${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(dx)} ${fmt(dy)}`;
      return (
        `M${fmt(x + rx)} ${fmt(y)}h${fmt(w - 2 * rx)}${arc(rx, ry)}v${fmt(h - 2 * ry)}${arc(-rx, ry)}` +
        `h${fmt(-(w - 2 * rx))}${arc(-rx, -ry)}v${fmt(-(h - 2 * ry))}${arc(rx, -ry)}z`
      );
    }
    case "line":
      return `M${attrs.x1} ${attrs.y1}L${attrs.x2} ${attrs.y2}`;
    case "polyline":
    case "polygon": {
      const points = attrs.points
        .trim()
        .split(/[\s,]+/)
        .map(num);
      const pairs = [];
      for (let i = 0; i < points.length; i += 2)
        pairs.push(`${fmt(points[i])} ${fmt(points[i + 1])}`);
      return `M${pairs.join("L")}${tag === "polygon" ? "z" : ""}`;
    }
    default:
      throw new Error(`Unsupported lucide element <${tag}>`);
  }
}

async function iconPaths(name) {
  const file = join(lucideRoot, "dist/esm/icons", `${name}.mjs`);
  const icon = await import(pathToFileURL(file).href);
  if (icon.__iconNode) return icon.__iconNode.map(elementPath);
  // Renamed icons are re-export aliases of their canonical module.
  const alias = readFileSync(file, "utf8").match(/from '\.\/([a-z0-9-]+)\.mjs'/)?.[1];
  if (!alias) throw new Error(`lucide icon ${name} has no icon node`);
  return iconPaths(alias);
}

const entries = [];
for (const [kotlinName, [lucideName, options = {}]] of Object.entries(ICONS)) {
  const paths = await iconPaths(lucideName);
  const args = paths.map((path) => `"${path}"`).join(", ");
  const flags = [
    options.autoMirror ? "autoMirror = true" : null,
    options.filled ? "filled = true" : null,
  ].filter(Boolean);
  entries.push(
    `    val ${kotlinName}: ImageVector by lazy { lucide("${kotlinName}", ${args}${flags.length ? `, ${flags.join(", ")}` : ""}) } // ${lucideName}`,
  );
}

const source = `// Generated by scripts/generate-android-icons.mjs from lucide-react ${lucideVersion}
// (ISC license, https://lucide.dev/license). Do not edit by hand.
package com.poracode.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/** The PWA's lucide line icons (24-unit grid, 2-unit round stroke), tinted by \`Icon\`. */
object PoracodeIcons {
${entries.join("\n")}
}

private fun lucide(
    name: String,
    vararg paths: String,
    autoMirror: Boolean = false,
    filled: Boolean = false,
): ImageVector = ImageVector.Builder(
    name = name,
    defaultWidth = 24.dp,
    defaultHeight = 24.dp,
    viewportWidth = 24f,
    viewportHeight = 24f,
    autoMirror = autoMirror,
).apply {
    paths.forEach { path ->
        addPath(
            pathData = addPathNodes(path),
            fill = if (filled) SolidColor(Color.Black) else null,
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 2f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        )
    }
}.build()
`;

if (process.argv.includes("--check")) {
  const current = readFileSync(output, "utf8");
  if (current !== source) {
    console.error("PoracodeIcons.kt is stale; run node scripts/generate-android-icons.mjs");
    process.exit(1);
  }
} else {
  writeFileSync(output, source);
  console.log(`wrote ${Object.keys(ICONS).length} icons to ${output}`);
}
