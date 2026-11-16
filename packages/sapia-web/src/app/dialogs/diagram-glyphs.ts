const wrap = (body: string) =>
  `<svg viewBox="0 0 64 44" width="64" height="44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** Hand-drawn miniature of each diagram type, used in the template gallery. */
const GLYPHS: Record<string, string> = {
  sequence: wrap('<rect x="6" y="4" width="16" height="8" rx="2"/><rect x="42" y="4" width="16" height="8" rx="2"/><path d="M14 12v28M50 12v28" stroke-dasharray="2 3" opacity=".6"/><path d="M14 20h34m-4-3 4 3-4 3M50 31H16m4-3-4 3 4 3" class="a"/>'),
  class: wrap('<rect x="20" y="3" width="24" height="16" rx="2"/><path d="M20 9h24"/><rect x="4" y="28" width="22" height="13" rx="2"/><rect x="38" y="28" width="22" height="13" rx="2"/><path d="M15 28v-4h34v4M32 24v-5" class="a"/>'),
  state: wrap('<circle cx="8" cy="22" r="3.5" fill="currentColor" stroke="none"/><rect x="20" y="15" width="18" height="14" rx="7"/><path d="M12 22h7m-3-2.500 3 2.500-3 2.500M38 22h9m-3-2.500 3 2.500-3 2.500" class="a"/><circle cx="54" cy="22" r="5"/><circle cx="54" cy="22" r="2.200" fill="currentColor" stroke="none"/>'),
  component: wrap('<rect x="8" y="6" width="20" height="13" rx="2"/><path d="M5 10h6M5 15h6"/><rect x="38" y="25" width="20" height="13" rx="2"/><path d="M35 29h6M35 34h6"/><path d="M28 13h12a4 4 0 0 1 4 4v7m-3-3 3 3 3-3" class="a"/>'),
  activity: wrap('<circle cx="32" cy="5" r="3" fill="currentColor" stroke="none"/><path d="M32 8v4"/><rect x="21" y="12" width="22" height="9" rx="4.500"/><path d="M32 21v3l-8 6 8 6 8-6-8-6" class="a"/><path d="M24 30H12v8M40 30h12v8"/>'),
  usecase: wrap('<circle cx="10" cy="11" r="4"/><path d="M10 15v12M4 20h12M10 27l-5 9M10 27l5 9"/><ellipse cx="44" cy="13" rx="14" ry="7" class="a"/><ellipse cx="44" cy="32" rx="14" ry="7"/><path d="M17 19l13-4M17 23l13 7" opacity=".6"/>'),
  mindmap: wrap('<rect x="22" y="15" width="20" height="14" rx="7" class="a"/><path d="M22 20C14 18 14 8 6 8M22 24c-8 2-8 12-16 12M42 20c8-2 8-12 16-12M42 24c8 2 8 12 16 12"/><circle cx="6" cy="8" r="2.200"/><circle cx="6" cy="36" r="2.200"/><circle cx="58" cy="8" r="2.200"/><circle cx="58" cy="36" r="2.200"/>'),
  flowchart: wrap('<rect x="4" y="15" width="16" height="14" rx="3"/><path d="M34 12l10 10-10 10-10-10z" class="a"/><rect x="48" y="4" width="12" height="10" rx="2"/><rect x="48" y="30" width="12" height="10" rx="2"/><path d="M20 22h4M44 22h4V9M48 22v13" />'),
  er: wrap('<rect x="4" y="6" width="20" height="14" rx="2"/><path d="M4 11h20"/><rect x="40" y="24" width="20" height="14" rx="2"/><path d="M40 29h20"/><path d="M24 13h8v18h8" class="a"/><path d="M36 28l4 3-4 3M28 10v6"/>'),
  gantt: wrap('<path d="M6 4v36h54" opacity=".5"/><rect x="10" y="8" width="18" height="6" rx="2" class="a"/><rect x="22" y="19" width="22" height="6" rx="2"/><rect x="36" y="30" width="20" height="6" rx="2"/>'),
  pie: wrap('<circle cx="32" cy="22" r="17"/><path d="M32 22V5a17 17 0 0 1 14.700 25.500z" class="a" fill="currentColor" fill-opacity=".18"/><path d="M32 22L18 31"/>'),
  gitgraph: wrap('<path d="M6 30h52" /><path d="M18 30c6 0 6-16 12-16h10c6 0 6 16 12 16" class="a"/><circle cx="8" cy="30" r="3" fill="var(--surface-1)"/><circle cx="30" cy="14" r="3" fill="var(--surface-1)" class="a"/><circle cx="42" cy="14" r="3" fill="var(--surface-1)" class="a"/><circle cx="56" cy="30" r="3" fill="var(--surface-1)"/>'),
  journey: wrap('<path d="M6 34c10 0 8-22 18-22s8 14 16 14 8-12 18-12"/><circle cx="24" cy="12" r="3" class="a"/><circle cx="40" cy="26" r="3"/><circle cx="58" cy="14" r="3" class="a"/>'),
  timeline: wrap('<path d="M4 22h56"/><circle cx="14" cy="22" r="3" fill="var(--surface-1)" class="a"/><circle cx="32" cy="22" r="3" fill="var(--surface-1)"/><circle cx="50" cy="22" r="3" fill="var(--surface-1)" class="a"/><rect x="6" y="5" width="16" height="9" rx="2"/><rect x="24" y="30" width="16" height="9" rx="2"/><rect x="42" y="5" width="16" height="9" rx="2"/>'),
};
GLYPHS['deployment'] = GLYPHS['component'];

/** Static, bundled SVG markup for a diagram type. */
export function glyphMarkup(type: string): string {
  return GLYPHS[type] ?? GLYPHS['flowchart'];
}
