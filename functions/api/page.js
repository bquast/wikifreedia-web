export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const title = url.searchParams.get('title');

  if (!title) {
    return new Response(JSON.stringify({ error: 'Missing title parameter' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const contentUrl = `https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&prop=text&page=${encodeURIComponent(
    title
  )}`;

  try {
    const [summaryResponse, contentResponse] = await Promise.all([
      fetch(summaryUrl, {
        headers: { 'User-Agent': 'Nostipedia/1.0 (+https://nostipedia.org)' }
      }),
      fetch(contentUrl, {
        headers: { 'User-Agent': 'Nostipedia/1.0 (+https://nostipedia.org)' }
      })
    ]);

    if (!summaryResponse.ok) {
      throw new Error(`Summary request failed with status ${summaryResponse.status}`);
    }

    if (!contentResponse.ok) {
      throw new Error(`Content request failed with status ${contentResponse.status}`);
    }

    const summaryData = await summaryResponse.json();
    const contentData = await contentResponse.json();

    const body = {
      title: summaryData?.title ?? title,
      description: summaryData?.description ?? undefined,
      extract: summaryData?.extract ?? undefined,
      lastModified: summaryData?.timestamp ?? undefined,
      html: contentData?.parse?.text ?? ''
    };

    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    console.error('Page fetch error', error);
    return new Response(JSON.stringify({ error: 'Failed to load page' }), {
      status: 502,
      headers: { 'content-type': 'application/json' }
    });
  }
}
