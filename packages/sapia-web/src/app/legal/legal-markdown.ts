const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Only web and mail links; anything else stays plain text. */
const safeHref = (href: string): string | null => (/^(https?:\/\/|mailto:)/i.test(href.trim()) ? href.trim() : null);

function inline(text: string): string {
  // Links first, on the raw text, so their targets are escaped exactly once.
  const parts: string[] = [];
  let rest = text;
  const link = /\[([^\]]+)\]\(([^)\s]+)\)|<((?:https?:\/\/|mailto:)[^>\s]+)>/;
  for (let match = link.exec(rest); match; match = link.exec(rest)) {
    parts.push(format(rest.slice(0, match.index)));
    const label = match[1] ?? match[3].replace(/^mailto:/i, '');
    const href = safeHref(match[2] ?? match[3]);
    parts.push(href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${format(label)}</a>` : format(match[0]));
    rest = rest.slice(match.index + match[0].length);
  }
  parts.push(format(rest));
  return parts.join('');
}

function format(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*)[*_](?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
}

/**
 * Renders the Markdown an operator writes for an imprint or privacy policy:
 * headings, paragraphs (single line breaks kept, as in addresses), lists,
 * bold, italic, code and links. All input is escaped first; the output also
 * passes Angular's sanitizer.
 */
export function renderLegalMarkdown(source: string): string {
  const out: string[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let list: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      closeList();
      const level = Math.min(heading[1].length, 3);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      flush();
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
    } else if (!line.trim()) {
      flush();
      closeList();
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flush();
      closeList();
      out.push('<hr>');
    } else {
      closeList();
      paragraph.push(line.trim());
    }
  }
  flush();
  closeList();
  return out.join('');
}
