import { z } from "zod";
import { definePayloadProcedure, defineNoArgProcedure } from "../core";

export const browserRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BrowserRect = z.infer<typeof browserRectSchema>;

export const browserTabGroupColorSchema = z.enum([
  "purple",
  "blue",
  "green",
  "red",
  "yellow",
  "cyan",
  "orange",
  "gray",
]);
export type BrowserTabGroupColor = z.infer<typeof browserTabGroupColorSchema>;

export const browserTabGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  color: browserTabGroupColorSchema,
  collapsed: z.boolean(),
  /** Present when the group is owned by a thread — the renderer resolves this to
   *  the thread's live title for display. */
  threadId: z.string().optional(),
});
export type BrowserTabGroupInfo = z.infer<typeof browserTabGroupSchema>;

export const browserInternalPageSchema = z.enum(["downloads", "passwords"]);
export type BrowserInternalPage = z.infer<typeof browserInternalPageSchema>;

export const browserDeviceEmulationSchema = z.object({
  width: z.number().int().min(240).max(7680),
  height: z.number().int().min(240).max(7680),
  deviceScaleFactor: z.number().min(0.5).max(4),
  scale: z.number().min(0.25).max(2),
  mobile: z.boolean(),
  touch: z.boolean(),
  preset: z.string().optional(),
});
export type BrowserDeviceEmulation = z.infer<typeof browserDeviceEmulationSchema>;

export const browserTabSchema = z.object({
  tabId: z.string(),
  url: z.string(),
  title: z.string(),
  faviconUrl: z.string().optional(),
  loading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  devToolsOpen: z.boolean().optional(),
  internalPage: browserInternalPageSchema.optional(),
  zoomFactor: z.number().min(0.25).max(5).optional(),
  deviceEmulation: browserDeviceEmulationSchema.optional(),
  groupId: z.string().optional(),
});
export type BrowserTabInfo = z.infer<typeof browserTabSchema>;

export const browserBookmarkSchema = z.object({
  url: z.string(),
  title: z.string(),
  faviconUrl: z.string().optional(),
  createdAt: z.number(),
});
export type BrowserBookmarkInfo = z.infer<typeof browserBookmarkSchema>;

export const browserStateSchema = z.object({
  tabs: z.array(browserTabSchema),
  activeTabId: z.string().nullable(),
  extracted: z.boolean().optional(),
  bookmarks: z.array(browserBookmarkSchema).optional(),
  bookmarkBarVisible: z.boolean().optional(),
  groups: z.array(browserTabGroupSchema).optional(),
});
export type BrowserState = z.infer<typeof browserStateSchema>;

export const browserCreateTabPayloadSchema = z.object({
  url: z.string().optional(),
  activate: z.boolean().optional(),
  /** When true, reveal the browser using the user's panel/overlay preference. */
  reveal: z.boolean().optional(),
});

export const browserTabIdPayloadSchema = z.object({
  tabId: z.string().min(1),
});

export const browserNavigatePayloadSchema = z.object({
  tabId: z.string().min(1),
  url: z.string().min(1),
});

export const browserMoveTabPayloadSchema = z.object({
  tabId: z.string().min(1),
  targetTabId: z.string().min(1),
  position: z.enum(["before", "after"]),
});

export const browserAttachWebContentsPayloadSchema = z.object({
  tabId: z.string().min(1),
  webContentsId: z.number().int().nonnegative(),
});

export const browserSetGroupCollapsedPayloadSchema = z.object({
  groupId: z.string().min(1),
  collapsed: z.boolean(),
});

export const browserGroupIdPayloadSchema = z.object({
  groupId: z.string().min(1),
});

export const browserRenameGroupPayloadSchema = z.object({
  groupId: z.string().min(1),
  title: z.string(),
});

export const browserSetGroupColorPayloadSchema = z.object({
  groupId: z.string().min(1),
  color: browserTabGroupColorSchema,
});

export const browserCapturePreviewResultSchema = z.object({
  dataUrl: z.string().nullable(),
});
export type BrowserCapturePreviewResult = z.infer<typeof browserCapturePreviewResultSchema>;

export const browserPickResultSchema = z.object({
  tabId: z.string(),
  selector: z.string(),
  rect: browserRectSchema,
  dpr: z.number(),
  url: z.string(),
  title: z.string(),
});
export type BrowserPickResult = z.infer<typeof browserPickResultSchema>;

export const browserStartPickerPayloadSchema = z.object({
  threadId: z.string().min(1),
  tabId: z.string().min(1),
});

export const browserStartPickerResultSchema = z.object({
  ok: z.boolean(),
  cancelled: z.boolean().optional(),
  attachmentPath: z.string().optional(),
  attachmentName: z.string().optional(),
  mimeType: z.string().optional(),
  selector: z.string().optional(),
  sourceUrl: z.string().optional(),
  rect: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  error: z.string().optional(),
});
export type BrowserStartPickerResult = z.infer<typeof browserStartPickerResultSchema>;

export const browserSuggestPayloadSchema = z.object({
  query: z.string(),
});

export const browserHistoryEntrySchema = z.object({ url: z.string(), title: z.string() });
export type BrowserHistoryEntryInfo = z.infer<typeof browserHistoryEntrySchema>;

export const browserSuggestResultSchema = z.object({
  history: z.array(browserHistoryEntrySchema),
  suggestions: z.array(z.string()),
});
export type BrowserSuggestResult = z.infer<typeof browserSuggestResultSchema>;

export const browserAddBookmarkPayloadSchema = z.object({
  url: z.string().min(1),
  title: z.string(),
  faviconUrl: z.string().optional(),
});

export const browserRemoveBookmarkPayloadSchema = z.object({
  url: z.string().min(1),
});

export const browserSetBookmarkBarVisiblePayloadSchema = z.object({
  visible: z.boolean(),
});

export const browserOpenInternalPagePayloadSchema = z.object({
  page: browserInternalPageSchema,
});

export const browserFindInPagePayloadSchema = z.object({
  tabId: z.string().min(1),
  text: z.string().min(1),
  forward: z.boolean(),
  findNext: z.boolean(),
  matchCase: z.boolean(),
});

export const browserStopFindInPagePayloadSchema = z.object({
  tabId: z.string().min(1),
  action: z.enum(["clearSelection", "keepSelection", "activateSelection"]),
});

export const browserFindResultSchema = z.object({
  tabId: z.string(),
  requestId: z.number().int(),
  activeMatchOrdinal: z.number().int().nonnegative(),
  matches: z.number().int().nonnegative(),
  finalUpdate: z.boolean(),
});
export type BrowserFindResult = z.infer<typeof browserFindResultSchema>;

export const browserPrintResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});
export type BrowserPrintResult = z.infer<typeof browserPrintResultSchema>;

export const browserSetZoomFactorPayloadSchema = z.object({
  tabId: z.string().min(1),
  zoomFactor: z.number().min(0.25).max(5),
});

export const browserSetDeviceEmulationPayloadSchema = z.object({
  tabId: z.string().min(1),
  emulation: browserDeviceEmulationSchema.nullable(),
});

export const browserDownloadStateSchema = z.enum([
  "progressing",
  "paused",
  "completed",
  "cancelled",
  "interrupted",
]);
export type BrowserDownloadState = z.infer<typeof browserDownloadStateSchema>;

export const browserDownloadSchema = z.object({
  id: z.string(),
  filename: z.string(),
  url: z.string(),
  mimeType: z.string(),
  state: browserDownloadStateSchema,
  receivedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  startTime: z.number(),
  endTime: z.number().optional(),
  canResume: z.boolean(),
});
export type BrowserDownloadInfo = z.infer<typeof browserDownloadSchema>;

export const browserDownloadActionPayloadSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["pause", "resume", "cancel", "remove", "open", "show-in-folder"]),
});

export const browserCredentialSchema = z.object({
  id: z.string(),
  origin: z.string(),
  username: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  source: z.string().optional(),
});
export type BrowserCredentialInfo = z.infer<typeof browserCredentialSchema>;

export const browserCredentialIdPayloadSchema = z.object({
  id: z.string().min(1),
});

export const browserCredentialPasswordResultSchema = z.object({
  password: z.string(),
});

export const browserUpsertCredentialPayloadSchema = z.object({
  id: z.string().optional(),
  origin: z.string().min(1),
  username: z.string(),
  password: z.string(),
});

export const browserImportSourceSchema = z.object({
  id: z.string(),
  browser: z.enum(["chrome", "edge", "brave", "chromium"]),
  browserLabel: z.string(),
  profileLabel: z.string(),
  supportsPasswords: z.boolean(),
  supportsCookies: z.boolean(),
  hasAppBoundData: z.boolean(),
});
export type BrowserImportSourceInfo = z.infer<typeof browserImportSourceSchema>;

export const browserImportDataPayloadSchema = z
  .object({
    sourceId: z.string().min(1),
    passwords: z.boolean(),
    cookies: z.boolean(),
    acknowledgeProtectedData: z.boolean(),
  })
  .refine((value) => value.passwords || value.cookies, {
    message: "Select at least one browser data type",
  });

export const browserImportResultSchema = z.object({
  passwordsImported: z.number().int().nonnegative(),
  cookiesImported: z.number().int().nonnegative(),
  passwordsSkipped: z.number().int().nonnegative(),
  cookiesSkipped: z.number().int().nonnegative(),
  protectedItemsSkipped: z.number().int().nonnegative(),
  errors: z.array(z.string()),
});
export type BrowserImportResult = z.infer<typeof browserImportResultSchema>;

export const browserRecentHistoryPayloadSchema = z.object({
  limit: z.number().int().positive().max(50),
});

export const browserProcedures = {
  browserGetState: defineNoArgProcedure<BrowserState, "main-local">(
    "browserGetState",
    "main-local",
  ),
  browserCreateTab: definePayloadProcedure<
    z.infer<typeof browserCreateTabPayloadSchema>,
    BrowserTabInfo,
    "main-local"
  >("browserCreateTab", "main-local", browserCreateTabPayloadSchema),
  browserOpenInternalPage: definePayloadProcedure<
    z.infer<typeof browserOpenInternalPagePayloadSchema>,
    BrowserTabInfo,
    "main-local"
  >("browserOpenInternalPage", "main-local", browserOpenInternalPagePayloadSchema),
  browserCloseTab: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    void,
    "main-local"
  >("browserCloseTab", "main-local", browserTabIdPayloadSchema),
  browserActivateTab: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    void,
    "main-local"
  >("browserActivateTab", "main-local", browserTabIdPayloadSchema),
  browserMoveTab: definePayloadProcedure<
    z.infer<typeof browserMoveTabPayloadSchema>,
    void,
    "main-local"
  >("browserMoveTab", "main-local", browserMoveTabPayloadSchema),
  browserSetGroupCollapsed: definePayloadProcedure<
    z.infer<typeof browserSetGroupCollapsedPayloadSchema>,
    void,
    "main-local"
  >("browserSetGroupCollapsed", "main-local", browserSetGroupCollapsedPayloadSchema),
  browserUngroupGroup: definePayloadProcedure<
    z.infer<typeof browserGroupIdPayloadSchema>,
    void,
    "main-local"
  >("browserUngroupGroup", "main-local", browserGroupIdPayloadSchema),
  browserCloseGroup: definePayloadProcedure<
    z.infer<typeof browserGroupIdPayloadSchema>,
    void,
    "main-local"
  >("browserCloseGroup", "main-local", browserGroupIdPayloadSchema),
  browserNewTabInGroup: definePayloadProcedure<
    z.infer<typeof browserGroupIdPayloadSchema>,
    void,
    "main-local"
  >("browserNewTabInGroup", "main-local", browserGroupIdPayloadSchema),
  browserRenameGroup: definePayloadProcedure<
    z.infer<typeof browserRenameGroupPayloadSchema>,
    void,
    "main-local"
  >("browserRenameGroup", "main-local", browserRenameGroupPayloadSchema),
  browserSetGroupColor: definePayloadProcedure<
    z.infer<typeof browserSetGroupColorPayloadSchema>,
    void,
    "main-local"
  >("browserSetGroupColor", "main-local", browserSetGroupColorPayloadSchema),
  browserNavigate: definePayloadProcedure<
    z.infer<typeof browserNavigatePayloadSchema>,
    void,
    "main-local"
  >("browserNavigate", "main-local", browserNavigatePayloadSchema),
  browserBack: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    void,
    "main-local"
  >("browserBack", "main-local", browserTabIdPayloadSchema),
  browserForward: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    void,
    "main-local"
  >("browserForward", "main-local", browserTabIdPayloadSchema),
  browserReload: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    void,
    "main-local"
  >("browserReload", "main-local", browserTabIdPayloadSchema),
  browserHardReload: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    void,
    "main-local"
  >("browserHardReload", "main-local", browserTabIdPayloadSchema),
  browserToggleDevTools: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    void,
    "main-local"
  >("browserToggleDevTools", "main-local", browserTabIdPayloadSchema),
  browserFindInPage: definePayloadProcedure<
    z.infer<typeof browserFindInPagePayloadSchema>,
    void,
    "main-local"
  >("browserFindInPage", "main-local", browserFindInPagePayloadSchema),
  browserStopFindInPage: definePayloadProcedure<
    z.infer<typeof browserStopFindInPagePayloadSchema>,
    void,
    "main-local"
  >("browserStopFindInPage", "main-local", browserStopFindInPagePayloadSchema),
  browserPrint: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    BrowserPrintResult,
    "main-local"
  >("browserPrint", "main-local", browserTabIdPayloadSchema),
  browserSetZoomFactor: definePayloadProcedure<
    z.infer<typeof browserSetZoomFactorPayloadSchema>,
    void,
    "main-local"
  >("browserSetZoomFactor", "main-local", browserSetZoomFactorPayloadSchema),
  browserSetDeviceEmulation: definePayloadProcedure<
    z.infer<typeof browserSetDeviceEmulationPayloadSchema>,
    void,
    "main-local"
  >("browserSetDeviceEmulation", "main-local", browserSetDeviceEmulationPayloadSchema),
  browserClearHistory: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    void,
    "main-local"
  >("browserClearHistory", "main-local", browserTabIdPayloadSchema),
  browserClearCookies: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    void,
    "main-local"
  >("browserClearCookies", "main-local", browserTabIdPayloadSchema),
  browserClearCache: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    void,
    "main-local"
  >("browserClearCache", "main-local", browserTabIdPayloadSchema),
  browserCopyScreenshot: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    void,
    "main-local"
  >("browserCopyScreenshot", "main-local", browserTabIdPayloadSchema),
  browserCapturePreview: definePayloadProcedure<
    z.infer<typeof browserTabIdPayloadSchema>,
    BrowserCapturePreviewResult,
    "main-local"
  >("browserCapturePreview", "main-local", browserTabIdPayloadSchema),
  browserAttachWebContents: definePayloadProcedure<
    z.infer<typeof browserAttachWebContentsPayloadSchema>,
    void,
    "main-local"
  >("browserAttachWebContents", "main-local", browserAttachWebContentsPayloadSchema),
  browserStartPicker: definePayloadProcedure<
    z.infer<typeof browserStartPickerPayloadSchema>,
    BrowserStartPickerResult,
    "main-local"
  >("browserStartPicker", "main-local", browserStartPickerPayloadSchema),
  browserCancelPicker: defineNoArgProcedure<void, "main-local">(
    "browserCancelPicker",
    "main-local",
  ),
  browserSuggest: definePayloadProcedure<
    z.infer<typeof browserSuggestPayloadSchema>,
    BrowserSuggestResult,
    "main-local"
  >("browserSuggest", "main-local", browserSuggestPayloadSchema),
  browserAddBookmark: definePayloadProcedure<
    z.infer<typeof browserAddBookmarkPayloadSchema>,
    void,
    "main-local"
  >("browserAddBookmark", "main-local", browserAddBookmarkPayloadSchema),
  browserRemoveBookmark: definePayloadProcedure<
    z.infer<typeof browserRemoveBookmarkPayloadSchema>,
    void,
    "main-local"
  >("browserRemoveBookmark", "main-local", browserRemoveBookmarkPayloadSchema),
  browserSetBookmarkBarVisible: definePayloadProcedure<
    z.infer<typeof browserSetBookmarkBarVisiblePayloadSchema>,
    void,
    "main-local"
  >("browserSetBookmarkBarVisible", "main-local", browserSetBookmarkBarVisiblePayloadSchema),
  browserRecentHistory: definePayloadProcedure<
    z.infer<typeof browserRecentHistoryPayloadSchema>,
    BrowserHistoryEntryInfo[],
    "main-local"
  >("browserRecentHistory", "main-local", browserRecentHistoryPayloadSchema),
  browserGetDownloads: defineNoArgProcedure<BrowserDownloadInfo[], "main-local">(
    "browserGetDownloads",
    "main-local",
  ),
  browserDownloadAction: definePayloadProcedure<
    z.infer<typeof browserDownloadActionPayloadSchema>,
    void,
    "main-local"
  >("browserDownloadAction", "main-local", browserDownloadActionPayloadSchema),
  browserListCredentials: defineNoArgProcedure<BrowserCredentialInfo[], "main-local">(
    "browserListCredentials",
    "main-local",
  ),
  browserGetCredentialPassword: definePayloadProcedure<
    z.infer<typeof browserCredentialIdPayloadSchema>,
    z.infer<typeof browserCredentialPasswordResultSchema>,
    "main-local"
  >("browserGetCredentialPassword", "main-local", browserCredentialIdPayloadSchema),
  browserUpsertCredential: definePayloadProcedure<
    z.infer<typeof browserUpsertCredentialPayloadSchema>,
    BrowserCredentialInfo,
    "main-local"
  >("browserUpsertCredential", "main-local", browserUpsertCredentialPayloadSchema),
  browserDeleteCredential: definePayloadProcedure<
    z.infer<typeof browserCredentialIdPayloadSchema>,
    void,
    "main-local"
  >("browserDeleteCredential", "main-local", browserCredentialIdPayloadSchema),
  browserListImportSources: defineNoArgProcedure<BrowserImportSourceInfo[], "main-local">(
    "browserListImportSources",
    "main-local",
  ),
  browserImportData: definePayloadProcedure<
    z.infer<typeof browserImportDataPayloadSchema>,
    BrowserImportResult,
    "main-local"
  >("browserImportData", "main-local", browserImportDataPayloadSchema),
  browserExtractToWindow: defineNoArgProcedure<void, "main-local">(
    "browserExtractToWindow",
    "main-local",
  ),
  browserInjectToMain: defineNoArgProcedure<void, "main-local">(
    "browserInjectToMain",
    "main-local",
  ),
} as const;
