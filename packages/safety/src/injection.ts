/**
 * Screen-borne prompt-injection heuristics. Screen text is untrusted data; this
 * only raises a flag for the user and for policy. It never grants or removes
 * permissions by itself.
 */

interface Rule {
  flag: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  { flag: "override_instructions", pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i },
  { flag: "override_instructions", pattern: /disregard\s+.{0,40}(instructions|rules)/i },
  { flag: "override_instructions", pattern: /تجاهل\s+(كل\s+)?التعليمات/i },
  { flag: "role_change", pattern: /(you are now|from now on,? you are|act as)\s+(an?\s+)?(assistant|admin|developer|system)/i },
  { flag: "fake_dialog", pattern: /click\s+(ok|yes|allow|continue|run)\s+(now\s+)?to\s+(continue|proceed|verify|fix|unlock)/i },
  { flag: "credential_request", pattern: /(send|type|enter|paste)\s+.{0,40}(password|credentials|api\s*key|token|seed phrase|card number)/i },
  { flag: "secret_exfiltration", pattern: /(email|send|upload|post)\s+.{0,40}(to\s+)?(https?:\/\/|@)/i },
  { flag: "hide_from_user", pattern: /(do not|don'?t)\s+(tell|inform|notify)\s+(the\s+)?(user|human)/i },
  { flag: "money_transfer", pattern: /(transfer|wire|send)\s+.{0,30}(funds|money|bitcoin|crypto|payment)/i },
  { flag: "system_prompt_marker", pattern: /^\s*(system|assistant)\s*:/i },
  { flag: "encoded_payload", pattern: /(eval|exec|powershell\s+-enc|base64\s+-d)\s*[:(]/i },
];

export function scanInjection(text: string | undefined): string[] {
  if (!text) return [];
  const flags = new Set<string>();
  for (const rule of RULES) {
    if (rule.pattern.test(text)) flags.add(rule.flag);
  }
  return [...flags];
}

export function isSuspicious(text: string | undefined): boolean {
  return scanInjection(text).length > 0;
}
