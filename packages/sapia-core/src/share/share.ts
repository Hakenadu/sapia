/**
 * Diagram sharing without a server: the diagram travels compressed in the
 * fragment of a link (`…#d=<payload>`). Browsers never send the fragment to
 * the server, so the web deployment that opens the link never sees it.
 *
 * Payload: base64url(deflate-raw(JSON {v: 1, n: name, s: source})).
 */

export interface SharedDiagram {
  name: string;
  source: string;
}

/** Fragment parameter that carries the diagram. */
export const SHARE_PARAM = 'd';
/** Link used by the desktop app when no web deployment is configured; the app registers the `sapia:` scheme. */
export const DESKTOP_SHARE_BASE = 'sapia://open/';
/** Links longer than this may get cut off by chat tools, mail clients or browsers. */
export const SHARE_LINK_SOFT_LIMIT = 8000;
/** Hard limit for decoding, to keep a pasted link from inflating into something huge. */
const MAX_SOURCE_LENGTH = 2_000_000;

const FORMAT_VERSION = 1;

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const response = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encodes a diagram into the payload of the `d` fragment parameter. */
export async function encodeSharedDiagram(diagram: SharedDiagram): Promise<string> {
  const json = JSON.stringify({ v: FORMAT_VERSION, n: diagram.name, s: diagram.source });
  return toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

/** Decodes a payload; throws {@link ShareError} when it is damaged or from an unknown format. */
export async function decodeSharedDiagram(payload: string): Promise<SharedDiagram> {
  let json: unknown;
  try {
    const inflated = await pipe(fromBase64Url(payload.trim()), new DecompressionStream('deflate-raw'));
    if (inflated.length > MAX_SOURCE_LENGTH * 2) throw new Error('too large');
    json = JSON.parse(new TextDecoder().decode(inflated));
  } catch {
    throw new ShareError('damaged');
  }
  const data = json as { v?: unknown; n?: unknown; s?: unknown };
  if (typeof data !== 'object' || data === null || typeof data.s !== 'string') throw new ShareError('damaged');
  if (data.v !== FORMAT_VERSION) throw new ShareError('version');
  return { name: typeof data.n === 'string' ? data.n.slice(0, 200) : '', source: data.s };
}

export class ShareError extends Error {
  constructor(readonly reason: 'damaged' | 'version' | 'no-diagram') {
    super(`Shared diagram: ${reason}`);
  }
}

/** Builds a share link on top of `base` (the URL of a Sapia web deployment, or {@link DESKTOP_SHARE_BASE}). */
export async function createShareLink(diagram: SharedDiagram, base: string): Promise<string> {
  const url = base.split('#')[0];
  return `${url}#${SHARE_PARAM}=${await encodeSharedDiagram(diagram)}`;
}

/**
 * Extracts the payload from a share link (https or `sapia:`), a bare
 * fragment (`#d=…`) or the payload itself. Returns null when the text
 * contains no diagram.
 */
export function sharePayloadFrom(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const hash = trimmed.indexOf('#');
  const fragment = hash >= 0 ? trimmed.slice(hash + 1) : /^[A-Za-z0-9_-]{8,}$/.test(trimmed) ? `${SHARE_PARAM}=${trimmed}` : '';
  for (const part of fragment.split('&')) {
    const [key, value] = part.split('=');
    if (key === SHARE_PARAM && value) return decodeURIComponent(value);
  }
  return null;
}

/** Validates a configured share base URL (http or https, without fragment). */
export function normalizeShareBase(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}
