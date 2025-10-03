import { fetchArticle, formatArticleResponse } from './_nostr.js';

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  const eventId = (url.searchParams.get('id') || '').trim();
  const relayParam = (url.searchParams.get('relay') || '').trim();

  if (!slug && !eventId) {
    return new Response(JSON.stringify({ error: 'Missing slug or id parameter.' }), {
      headers: { 'content-type': 'application/json' },
      status: 400
    });
  }

  try {
    const entry = await fetchArticle({
      slug: slug || undefined,
      eventId: eventId || undefined,
      relays: relayParam ? [relayParam] : undefined,
      limit: 1
    });

    if (!entry) {
      return new Response(JSON.stringify({ error: 'Article not found.' }), {
        headers: { 'content-type': 'application/json' },
        status: 404
      });
    }

    const article = formatArticleResponse(entry);
    return new Response(JSON.stringify(article), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to load article', error);
    return new Response(JSON.stringify({ error: 'Failed to load article.' }), {
      headers: { 'content-type': 'application/json' },
      status: 502
    });
  }
}
