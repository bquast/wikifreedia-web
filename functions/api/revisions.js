export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const title = url.searchParams.get('title');

  if (!title) {
    return new Response(JSON.stringify({ revisions: [] }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const revisionsUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&titles=${encodeURIComponent(
    title
  )}&rvlimit=20&rvprop=ids|timestamp|user|comment&rvdir=newer`;

  try {
    const response = await fetch(revisionsUrl, {
      headers: { 'User-Agent': 'Nostipedia/1.0 (+https://nostipedia.org)' }
    });

    if (!response.ok) {
      throw new Error(`Revision request failed with status ${response.status}`);
    }

    const data = await response.json();
    const pages = data?.query?.pages ?? {};
    const pageKey = Object.keys(pages)[0];
    const page = pages[pageKey] ?? {};
    const revisions = Array.isArray(page?.revisions)
      ? page.revisions.map((rev) => ({
          revid: rev?.revid,
          parentid: rev?.parentid,
          timestamp: rev?.timestamp,
          user: rev?.user,
          comment: rev?.comment
        }))
      : [];

    return new Response(JSON.stringify({ revisions }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    console.error('Revision fetch error', error);
    return new Response(JSON.stringify({ revisions: [] }), {
      status: 502,
      headers: { 'content-type': 'application/json' }
    });
  }
}
