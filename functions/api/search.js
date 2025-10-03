export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const query = url.searchParams.get('query');

  if (!query) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  const apiUrl = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=12`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Nostipedia/1.0 (+https://nostipedia.org)'
      }
    });

    if (!response.ok) {
      throw new Error(`Wikipedia search failed with status ${response.status}`);
    }

    const data = await response.json();
    const pages = Array.isArray(data?.pages) ? data.pages : [];
    const results = pages.map((page) => ({
      id: page?.id ?? page?.pageid ?? 0,
      title: page?.title ?? '',
      description: page?.description ?? '',
      extract: page?.excerpt?.replace(/<[^>]+>/g, '') ?? '',
      thumbnailUrl: page?.thumbnail?.url ?? undefined
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    console.error('Search error', error);
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'content-type': 'application/json' },
      status: 502
    });
  }
}
