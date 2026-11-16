import { describe, expect, it } from 'vitest';
import { DESKTOP_SHARE_BASE, ShareError, createShareLink, decodeSharedDiagram, encodeSharedDiagram, normalizeConfig, normalizeShareBase, sharePayloadFrom } from '../index';

const diagram = { name: 'Code Interpreter – Übersicht', source: '@startuml\nAlice -> Bob: Grüße 👋\n' + 'Bob --> Alice: ok\n'.repeat(200) + '@enduml\n' };

describe('sharing', () => {
  it('round-trips names and sources, including non-ASCII text', async () => {
    const payload = await encodeSharedDiagram(diagram);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeSharedDiagram(payload)).toEqual(diagram);
  });

  it('compresses repetitive diagrams', async () => {
    const payload = await encodeSharedDiagram(diagram);
    expect(payload.length).toBeLessThan(diagram.source.length / 5);
  });

  it('builds links and reads them back from any form', async () => {
    const web = await createShareLink(diagram, 'https://sapia.example.com/app/#old');
    expect(web.startsWith('https://sapia.example.com/app/#d=')).toBe(true);
    const desktop = await createShareLink(diagram, DESKTOP_SHARE_BASE);
    expect(desktop.startsWith('sapia://open/#d=')).toBe(true);
    const payload = sharePayloadFrom(web)!;
    expect(sharePayloadFrom(desktop)).toBe(payload);
    expect(sharePayloadFrom(`  #d=${payload} `)).toBe(payload);
    expect(sharePayloadFrom(payload)).toBe(payload);
    expect(sharePayloadFrom('https://example.com/#other=1')).toBeNull();
    expect(sharePayloadFrom('hello world')).toBeNull();
  });

  it('rejects damaged payloads and unknown versions', async () => {
    await expect(decodeSharedDiagram('not-a-diagram')).rejects.toBeInstanceOf(ShareError);
    const bytes = new Response(new Blob([JSON.stringify({ v: 99, s: 'x' })]).stream().pipeThrough(new CompressionStream('deflate-raw')));
    const raw = new Uint8Array(await bytes.arrayBuffer());
    const future = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await expect(decodeSharedDiagram(future)).rejects.toMatchObject({ reason: 'version' });
  });

  it('validates the configured share base', () => {
    expect(normalizeShareBase('https://sapia.example.com')).toBe('https://sapia.example.com/');
    expect(normalizeShareBase('ftp://x')).toBeNull();
    expect(normalizeConfig({ shareBaseUrl: 'https://sapia.example.com/#x' }).config.shareBaseUrl).toBe('https://sapia.example.com/');
    expect(normalizeConfig({ shareBaseUrl: 'nope' }).issues).toEqual(['shareBaseUrl must be an http(s) URL']);
  });
});
