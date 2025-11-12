/**
 * Formats a message answer by escaping HTML and applying simple markdown-like formatting
 * @param answer - The raw answer text to format
 * @returns HTML-safe formatted string
 */
export function formatMessageAnswer(answer: string): string {
  const escapeHtml = (text: string) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }
    return text.replace(/[&<>"']/g, (m) => map[m])
  }

  let html = escapeHtml(answer)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\*)\*([^*<]+?)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>')
  html = html.replace(/\n/g, '<br />')
  return html
}
