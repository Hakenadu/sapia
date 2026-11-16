const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

/** True when the keyboard event matches a binding such as `Mod-Shift-k`. */
export function matchesBinding(event: KeyboardEvent, binding: string): boolean {
  const parts = binding.split('-');
  const key = parts.pop()!.toLowerCase();
  const wanted = { ctrl: false, meta: false, alt: false, shift: false };
  for (const part of parts) {
    const p = part.toLowerCase();
    if (p === 'mod') (IS_MAC ? (wanted.meta = true) : (wanted.ctrl = true));
    else if (p === 'ctrl' || p === 'control') wanted.ctrl = true;
    else if (p === 'cmd' || p === 'meta') wanted.meta = true;
    else if (p === 'alt' || p === 'option') wanted.alt = true;
    else if (p === 'shift') wanted.shift = true;
  }
  if (event.ctrlKey !== wanted.ctrl || event.metaKey !== wanted.meta || event.altKey !== wanted.alt || event.shiftKey !== wanted.shift) return false;
  const pressed = event.key.toLowerCase();
  // With Alt held, `event.key` may be a composed character; compare the physical key too.
  return pressed === key || event.code.toLowerCase() === `key${key}` || event.code.toLowerCase() === key;
}

/** Human readable form of a binding: `Mod-Shift-k` → `⌘ ⇧ K` / `Ctrl Shift K`. */
export function formatBinding(binding: string): string[] {
  return binding.split('-').map((part) => {
    switch (part.toLowerCase()) {
      case 'mod':
        return IS_MAC ? '⌘' : 'Ctrl';
      case 'shift':
        return IS_MAC ? '⇧' : 'Shift';
      case 'alt':
      case 'option':
        return IS_MAC ? '⌥' : 'Alt';
      case 'ctrl':
      case 'control':
        return IS_MAC ? '⌃' : 'Ctrl';
      case 'cmd':
      case 'meta':
        return '⌘';
      case 'space':
        return 'Space';
      default:
        return part.length === 1 ? part.toUpperCase() : part;
    }
  });
}
