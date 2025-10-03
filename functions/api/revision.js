export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const oldid = url.searchParams.get('oldid');

  if (!oldid) {
    return new Response(JSON.stringify({ error: 'Missing oldid parameter' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const revisionUrl = `https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&oldid=${encodeURIComponent(
    oldid
  )}&prop=text|revid|displaytitle|timestamp`;

  try {
    const response = await fetch(revisionUrl, {
      headers: { 'User-Agent': 'Nostipedia/1.0 (+https://nostipedia.org)' }
    });

    if (!response.ok) {
      throw new Error(`Revision content failed with status ${response.status}`);
    }

    const data = await response.json();
    const parse = data?.parse ?? {};
    const result = {
      oldid: parse?.revid ?? Number(oldid),
      title: parse?.displaytitle ?? '',
      html: parse?.text ?? '',
      timestamp: parse?.timestamp ?? ''
    };

    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    console.error('Revision fetch error', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch revision' }), {
      status: 502,
      headers: { 'content-type': 'application/json' }
    });
  }
}
