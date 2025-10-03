import { searchArticles } from './_nostr.js';

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('query') || '').trim();

  if (!query) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const articles = await searchArticles(query, { limit: 24 });
    const results = articles.slice(0, 12).map((entry) => ({
      id: entry.data.id,
      slug: entry.data.slug,
      title: entry.data.title,
      summary: entry.data.summary,
      author: entry.data.author,
      updatedAt: entry.data.updatedAt,
      createdAt: entry.data.createdAt,
      relay: entry.relay,
      version: entry.data.version,
      languages: entry.data.languages
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    console.error('Nostr search failed', error);
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'content-type': 'application/json' },
      status: 502
    });
  }
}
