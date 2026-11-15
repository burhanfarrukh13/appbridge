import type { Effect } from "@appbridge/core";

export interface RiskInput {
  role?: string;
  name?: string;
  className?: string;
  /** Surrounding context: dialog text, window title, menu path, page heading. */
  contextText?: string;
}

export interface RiskAssessment {
  effect: Effect;
  confidence: number;
  matched?: string;
  source: "name" | "context" | "role" | "none";
}

/**
 * Generic, class-level effect keywords. This is deliberately a heuristic: when
 * nothing matches the effect is "unknown" and policy escalates it. No app or
 * vendor knowledge belongs here.
 */
const KEYWORDS: Record<Exclude<Effect, "unknown">, string[]> = {
  destructive: [
    "delete",
    "remove",
    "uninstall",
    "erase",
    "format",
    "overwrite",
    "discard",
    "trash",
    "wipe",
    "reset all",
    "empty recycle",
    "permanently",
    "حذف",
    "إزالة",
    "مسح",
    "löschen",
    "entfernen",
    "supprimer",
    "eliminar",
    "excluir",
    "удалить",
    "删除",
    "移除",
    "削除",
    "삭제",
  ],
  "external-effect": [
    "send",
    "post",
    "publish",
    "submit",
    "order",
    "pay",
    "purchase",
    "buy",
    "share",
    "upload",
    "reply",
    "tweet",
    "comment",
    "transfer",
    "invite",
    "إرسال",
    "نشر",
    "دفع",
    "مشاركة",
    "senden",
    "veröffentlichen",
    "envoyer",
    "publier",
    "enviar",
    "publicar",
    "отправить",
    "опубликовать",
    "发送",
    "发布",
    "送信",
    "投稿",
    "보내기",
  ],
  credential: [
    "password",
    "passphrase",
    "pin code",
    "cvv",
    "security code",
    "one-time code",
    "2fa code",
    "secret key",
    "كلمة المرور",
    "رمز التحقق",
    "passwort",
    "mot de passe",
    "contraseña",
    "senha",
    "пароль",
    "密码",
    "パスワード",
    "비밀번호",
  ],
  privileged: [
    "administrator",
    "run as admin",
    "elevate",
    "user account control",
    "allow this app",
    "install software",
    "change system settings",
    "registry editor",
  ],
  write: [
    "save",
    "save as",
    "apply",
    "confirm",
    "create",
    "rename",
    "update",
    "merge",
    "import",
    "export",
    "close",
    "ok",
    "yes",
    "accept",
    "allow",
    "حفظ",
    "تأكيد",
    "speichern",
    "enregistrer",
    "guardar",
    "salvar",
    "сохранить",
    "保存",
    "保存する",
    "저장",
  ],
  "edit-draft": ["draft", "edit", "insert", "bold", "italic", "underline", "undo", "redo"],
  navigate: [
    "open",
    "minimize",
    "maximize",
    "next",
    "back",
    "forward",
    "cancel",
    "home",
    "expand",
    "collapse",
    "menu",
    "tab",
    "go to",
    "refresh",
    "follow",
    "إلغاء",
    "فتح",
    "abbrechen",
    "annuler",
    "cancelar",
    "отмена",
    "取消",
    "キャンセル",
  ],
  read: ["find", "search", "filter", "copy", "select all", "read", "view", "show"],
};

const SEVERITY: Record<Effect, number> = {
  read: 0,
  navigate: 1,
  "edit-draft": 2,
  write: 3,
  privileged: 4,
  credential: 5,
  "external-effect": 6,
  destructive: 7,
  unknown: 8,
};

function hasWord(haystack: string, word: string): boolean {
  if (/[^\u0000-\u007f]/.test(word)) return haystack.includes(word);
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{Letter}\\p{Number}])${escaped}(?:$|[^\\p{Letter}\\p{Number}])`, "iu").test(
    haystack,
  );
}

function strongestMatch(text: string): { effect: Effect; word: string } | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  let best: { effect: Effect; word: string } | null = null;
  for (const [effect, words] of Object.entries(KEYWORDS) as Array<[Effect, string[]]>) {
    for (const word of words) {
      if (!hasWord(haystack, word)) continue;
      if (!best || SEVERITY[effect] > SEVERITY[best.effect]) best = { effect, word };
    }
  }
  return best;
}

/**
 * Classify what clicking/using an element is likely to do. Context (dialog
 * text, window title) can raise the effect: a generic "Yes" inside "Delete
 * file?" is destructive.
 */
export function classifyRisk(input: RiskInput): RiskAssessment {
  const nameMatch = strongestMatch(input.name ?? "");
  const contextMatch = strongestMatch(input.contextText ?? "");

  const byRole = roleBaseline(input.role);

  if (nameMatch && contextMatch) {
    const effect = SEVERITY[nameMatch.effect] >= SEVERITY[contextMatch.effect] ? nameMatch.effect : contextMatch.effect;
    return { effect, confidence: 0.85, matched: nameMatch.word, source: "name" };
  }
  if (nameMatch) {
    return { effect: nameMatch.effect, confidence: 0.8, matched: nameMatch.word, source: "name" };
  }
  if (contextMatch && byRole) {
    const effect = SEVERITY[byRole.effect] >= SEVERITY[contextMatch.effect] ? byRole.effect : contextMatch.effect;
    return { effect, confidence: 0.65, matched: contextMatch.word, source: "context" };
  }
  if (byRole) {
    return { effect: byRole.effect, confidence: byRole.confidence, source: "role" };
  }
  return { effect: "unknown", confidence: 0, source: "none" };
}

function roleBaseline(role?: string): { effect: Effect; confidence: number } | null {
  if (!role) return null;
  switch (role) {
    case "Edit":
    case "Document":
    case "Text":
      return { effect: "edit-draft", confidence: 0.45 };
    case "CheckBox":
    case "RadioButton":
    case "ComboBox":
    case "Slider":
    case "Spinner":
      return { effect: "write", confidence: 0.4 };
    case "Hyperlink":
      return { effect: "navigate", confidence: 0.4 };
    case "MenuItem":
    case "TabItem":
    case "TreeItem":
    case "ListItem":
      return { effect: "navigate", confidence: 0.35 };
    default:
      return null;
  }
}

/**
 * Low-confidence classifications are escalated so an unfamiliar control is
 * never a blind click. Read/navigate stay as-is; everything else becomes write.
 */
export function escalateForConfidence(effect: Effect, confidence: number): Effect {
  if (confidence >= 0.5) return effect;
  if (effect === "read" || effect === "navigate") return effect;
  if (effect === "unknown") return "unknown";
  return "write";
}

export function severityOf(effect: Effect): number {
  return SEVERITY[effect];
}
