const DEFAULT_RELAYS = [
  'wss://relay.nostr.band',
  'wss://relay.wikifreedia.xyz',
  'wss://relay.nostr.wirednet.jp',
  'wss://nostr.wine'
];

const DEFAULT_TIMEOUT_MS = 6000;
const MAX_EVENTS_PER_RELAY = 120;

function createSubId(prefix = 'nostipedia') {
  return `${prefix}-${Math.random().toString(16).slice(2)}`;
}

function parseTag(event, key) {
  const tag = event?.tags?.find((entry) => Array.isArray(entry) && entry[0] === key);
  return tag && tag.length > 1 ? tag[1] : null;
}

function parseTags(event, key) {
  return event?.tags?.filter((entry) => Array.isArray(entry) && entry[0] === key).map((entry) => entry[1]);
}

function toTimestamp(value) {
  if (!value) {
    return undefined;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return undefined;
  }
  const millis = numeric > 1e12 ? numeric : numeric * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function createPreview(content, summary) {
  if (summary) {
    return summary.trim();
  }
  const cleaned = (content || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/[\*_#>~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return '';
  }
  return cleaned.length > 260 ? `${cleaned.slice(0, 257)}…` : cleaned;
}

function summariseEvent(event) {
  const slug = parseTag(event, 'd') || event.id;
  const title = parseTag(event, 'title') || parseTag(event, 'name') || slug;
  const summary = parseTag(event, 'summary');
  const version = parseTag(event, 'version');
  const updatedAt = toTimestamp(parseTag(event, 'updated_at')) || toTimestamp(event.created_at);
  const publishedAt = toTimestamp(parseTag(event, 'published_at')) || updatedAt;
  const preview = createPreview(event.content, summary);
  const languages = parseTags(event, 'language');

  return {
    id: event.id,
    slug,
    title,
    summary: preview,
    originalSummary: summary || '',
    author: event.pubkey,
    createdAt: publishedAt,
    updatedAt,
    version: version || null,
    languages,
    tags: event.tags || [],
    content: event.content || ''
  };
}

async function requestEventsFromRelay(relayUrl, filters, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxEvents = options.maxEvents ?? MAX_EVENTS_PER_RELAY;
  const filterList = Array.isArray(filters) ? filters : [filters];
  const subId = createSubId('nostipedia');

  return new Promise((resolve) => {
    let resolved = false;
    const collected = [];
    let timeoutHandle;
    let ws;

    const finish = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      clearTimeout(timeoutHandle);
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(['CLOSE', subId]));
          ws.close();
        } else if (ws && ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch (error) {
        console.warn('Failed to close websocket', error);
      }
      resolve({ relay: relayUrl, events: collected });
    };

    if (typeof WebSocket === 'undefined') {
      console.warn('WebSocket is not available in this environment for relay', relayUrl);
      return resolve({ relay: relayUrl, events: [] });
    }

    try {
      ws = new WebSocket(relayUrl, 'nostr');
    } catch (error) {
      console.warn('WebSocket connection failed', relayUrl, error);
      return resolve({ relay: relayUrl, events: [] });
    }

    timeoutHandle = setTimeout(finish, timeoutMs);

    ws.addEventListener('open', () => {
      try {
        ws.send(JSON.stringify(['REQ', subId, ...filterList]));
      } catch (error) {
        console.warn('Failed to send subscription request', error);
        finish();
      }
    });

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!Array.isArray(data)) {
          return;
        }
        const [type] = data;
        if (type === 'EVENT' && data[2]) {
          collected.push(data[2]);
          if (collected.length >= maxEvents) {
            finish();
          }
        } else if (type === 'EOSE') {
          finish();
        }
      } catch (error) {
        console.warn('Failed to parse relay message', error);
      }
    });

    ws.addEventListener('error', () => finish());
    ws.addEventListener('close', () => finish());
  });
}

async function fetchEvents(filters, options = {}) {
  const relays = options.relays && options.relays.length ? options.relays : DEFAULT_RELAYS;
  const results = [];

  for (const relay of relays) {
    const response = await requestEventsFromRelay(relay, filters, options);
    if (response.events.length) {
      results.push(...response.events.map((event) => ({ event, relay })));
      if (options.stopOnFirstSuccess) {
        break;
      }
    }
  }

  return results;
}

function dedupeArticles(entries, keyFn) {
  const seen = new Set();
  const output = [];
  entries.forEach((entry) => {
    const key = keyFn(entry);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(entry);
    }
  });
  return output;
}

function sortByUpdatedDescending(entries) {
  return entries
    .slice()
    .sort((a, b) => {
      const aTime = a.data.updatedAt ? Date.parse(a.data.updatedAt) : 0;
      const bTime = b.data.updatedAt ? Date.parse(b.data.updatedAt) : 0;
      return bTime - aTime;
    });
}

export async function searchArticles(query, options = {}) {
  const searchFilter = {
    kinds: [30023],
    search: query,
    limit: options.limit ?? 24
  };
  const events = await fetchEvents(searchFilter, {
    relays: options.relays,
    timeoutMs: options.timeoutMs,
    stopOnFirstSuccess: false,
    maxEvents: options.limit ?? 24
  });

  const summaries = events.map(({ event, relay }) => ({
    relay,
    data: summariseEvent(event)
  }));

  const deduped = dedupeArticles(summaries, (entry) => `${entry.data.slug}:${entry.data.author}`);
  return sortByUpdatedDescending(deduped);
}

export async function fetchArticle({ slug, eventId, relays, limit = 1 }) {
  const prioritizedRelays = relays && relays.length ? relays : undefined;
  const filter = eventId
    ? { kinds: [30023], ids: [eventId], limit }
    : { kinds: [30023], '#d': [slug], limit };

  const events = await fetchEvents(filter, {
    relays: prioritizedRelays,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    stopOnFirstSuccess: true,
    maxEvents: limit
  });

  if (!events.length) {
    return null;
  }

  const { event, relay } = events[0];
  return {
    relay,
    raw: event,
    data: summariseEvent(event)
  };
}

export async function fetchArticleRevisions({ slug, relays, limit = 50 }) {
  const filter = { kinds: [30023], '#d': [slug], limit };
  const events = await fetchEvents(filter, {
    relays,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    stopOnFirstSuccess: false,
    maxEvents: limit
  });

  return sortByUpdatedDescending(
    events.map(({ event, relay }) => ({
      relay,
      raw: event,
      data: summariseEvent(event)
    }))
  );
}

export function formatArticleResponse(entry) {
  if (!entry) {
    return null;
  }

  return {
    id: entry.data.id,
    slug: entry.data.slug,
    title: entry.data.title,
    summary: entry.data.originalSummary || entry.data.summary,
    preview: entry.data.summary,
    author: entry.data.author,
    createdAt: entry.data.createdAt,
    updatedAt: entry.data.updatedAt,
    version: entry.data.version,
    relay: entry.relay,
    languages: entry.data.languages,
    content: entry.data.content,
    tags: entry.data.tags
  };
}
