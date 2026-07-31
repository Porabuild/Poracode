/** "Poracode on host" → "host"; the brand prefix is noise inside the app.
 *  Legacy "Lightcode on …" labels (paired pre-rebrand) are stripped too. */
export function desktopTitle(label: string): string {
  const stripped = label.replace(/^(?:Poracode|Lightcode)\s+on\s+/i, "");
  return stripped || label;
}
