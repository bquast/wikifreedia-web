import { fetchArticleRevisions } from './_nostr.js';

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  const relayParam = (url.searchParams.get('relay') || '').trim();

  if (!slug) {
    return new Response(JSON.stringify({ revisions: [] }), {
      headers: { 'content-type': 'application/json' },
      status: 400
    });
  }

  try {
    const revisions = await fetchArticleRevisions({
      slug,
      relays: relayParam ? [relayParam] : undefined,
      limit: 80
    });

    const seen = new Set();
    const formatted = [];

    for (const entry of revisions) {
      if (seen.has(entry.data.id)) {
        continue;
      }
      seen.add(entry.data.id);
      formatted.push({
        id: entry.data.id,
        slug: entry.data.slug,
        title: entry.data.title,
        summary: entry.data.summary,
        author: entry.data.author,
        createdAt: entry.data.createdAt,
        updatedAt: entry.data.updatedAt,
        relay: entry.relay,
        version: entry.data.version
      });
    }

    return new Response(JSON.stringify({ revisions: formatted }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to load revisions', error);
    return new Response(JSON.stringify({ revisions: [] }), {
      headers: { 'content-type': 'application/json' },
      status: 502
    });
  }
}
