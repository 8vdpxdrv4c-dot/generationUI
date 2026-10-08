/** Wait for the drawer to close, then make the next step visible. Keep drafts intact. */
export function focusReferenceComposer() {
  setTimeout(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-testid="copilot-chat-textarea"]');
    if (!textarea) return;
    textarea.scrollIntoView({ block: "center", behavior: "smooth" });
    textarea.focus({ preventScroll: true });
  }, 100);
}
