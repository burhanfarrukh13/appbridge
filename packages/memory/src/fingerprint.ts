/**
 * Technology fingerprint from cheap, static signals. It answers "what is this
 * built with?", never "which app is this?" (Universality Contract).
 */
export interface FingerprintInput {
  className?: string;
  processName?: string;
  title?: string;
}

const RULES: Array<{ technology: string; pattern: RegExp }> = [
  { technology: "chromium", pattern: /chrome_widgetwin|chromium|chrome_legacy_window/i },
  { technology: "gecko", pattern: /mozillawindowclass/i },
  { technology: "electron", pattern: /electron|app\.asar/i },
  { technology: "webview2", pattern: /webview2|msedgewebview2/i },
  { technology: "cef", pattern: /\bcef\b|chrome embedded/i },
  { technology: "winforms", pattern: /windowsforms10/i },
  { technology: "wpf", pattern: /hwndwrapper|\.wpf\./i },
  { technology: "uwp", pattern: /applicationframewindow|windows\.ui\.xaml/i },
  { technology: "java", pattern: /sunawtframe|javaw|\.jar\b|javax\.swing/i },
  { technology: "qt", pattern: /\bqt[0-9]*\b|qwindow/i },
  { technology: "gtk", pattern: /\bgtk/i },
  { technology: "delphi", pattern: /tapplication|delphi/i },
  { technology: "vb6", pattern: /thunderrt6|vb6/i },
  { technology: "console", pattern: /consolewindowclass|windowsterminal|cascadia/i },
  { technology: "flutter", pattern: /flutter/i },
  { technology: "unity", pattern: /unity/i },
];

export function fingerprintTechnology(input: FingerprintInput): string {
  const haystack = `${input.className ?? ""} ${input.processName ?? ""} ${input.title ?? ""}`;
  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) return rule.technology;
  }
  return "win32";
}
