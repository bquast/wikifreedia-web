import { fetchArticle, formatArticleResponse } from './_nostr.js';

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const eventId = (url.searchParams.get('id') || url.searchParams.get('oldid') || '').trim();
  const relayParam = (url.searchParams.get('relay') || '').trim();

  if (!eventId) {
    return new Response(JSON.stringify({ error: 'Missing id parameter.' }), {
      headers: { 'content-type': 'application/json' },
      status: 400
    });
  }

  try {
    const entry = await fetchArticle({
      eventId,
      relays: relayParam ? [relayParam] : undefined,
      limit: 1
    });

    if (!entry) {
      return new Response(JSON.stringify({ error: 'Revision not found.' }), {
        headers: { 'content-type': 'application/json' },
        status: 404
      });
    }

    const revision = formatArticleResponse(entry);
    return new Response(JSON.stringify(revision), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to load revision', error);
    return new Response(JSON.stringify({ error: 'Failed to load revision.' }), {
      headers: { 'content-type': 'application/json' },
      status: 502
    });
  }
}
