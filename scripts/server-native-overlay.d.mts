export declare function applyServerNativeOverlay(options: {
  readonly prefix: string;
  readonly overlayRoot: string;
}): { readonly nodePtyTarget: string; readonly betterSqliteBinding: string | undefined };
