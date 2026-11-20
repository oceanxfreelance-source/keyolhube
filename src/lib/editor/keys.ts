const TEXT_INPUTS = new Set(["text", "number", "email", "password", "search", "url", "tel", ""]);

/** True only while the user is typing (text boxes), so sliders and buttons keep shortcuts working. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
  return t.tagName === "INPUT" && TEXT_INPUTS.has(((t as HTMLInputElement).getAttribute("type") ?? "").toLowerCase());
}
