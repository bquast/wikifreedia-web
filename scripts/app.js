(function () {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const searchStatus = document.getElementById('search-status');

  const articleTitle = document.getElementById('article-title');
  const articleMeta = document.getElementById('article-meta');
  const articleSummary = document.getElementById('article-summary');
  const articleContent = document.getElementById('article-content');
  const articleStatus = document.getElementById('article-status');

  const compareStatus = document.getElementById('compare-status');
  const compareSelectA = document.getElementById('compare-select-a');
  const compareSelectB = document.getElementById('compare-select-b');
  const compareContainer = document.getElementById('revision-compare');
  const revisionTableWrapper = document.getElementById('revision-table-wrapper');

  let currentArticle = null;
  let revisions = [];
  const revisionCache = new Map();

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (!query) {
      searchStatus.textContent = 'Enter a search term to begin.';
      return;
    }
    performSearch(query);
  });

  searchResults.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLButtonElement && target.dataset.slug) {
      loadArticle({
        slug: target.dataset.slug,
        relay: target.dataset.relay || '',
        id: target.dataset.id || ''
      });
    }
  });

  compareSelectA.addEventListener('change', updateComparison);
  compareSelectB.addEventListener('change', updateComparison);

  async function performSearch(query) {
    searchStatus.textContent = 'Searching Nostr relays…';
    searchResults.innerHTML = '<div class="empty-state">Searching…</div>';

    try {
      const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
      }

      const data = await response.json();
      const items = Array.isArray(data?.results) ? data.results : [];

      if (items.length === 0) {
        searchStatus.textContent = 'No Nostr articles found for that query.';
        searchResults.innerHTML = '<div class="empty-state">No results found.</div>';
        return;
      }

      renderSearchResults(items);
      searchStatus.textContent = `Showing ${items.length} result${items.length === 1 ? '' : 's'} for “${query}”.`;
    } catch (error) {
      console.error(error);
      searchStatus.textContent = 'Unable to search Nostr relays right now. Please try again later.';
      searchResults.innerHTML = '<div class="empty-state">Unable to load results.</div>';
    }
  }

  function renderSearchResults(items) {
    const list = document.createElement('ul');
    list.className = 'search-results';

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'search-result';

      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.slug = item.slug;
      button.dataset.relay = item.relay || '';
      button.dataset.id = item.id || '';
      button.textContent = item.title || item.slug || 'Untitled article';

      const description = document.createElement('p');
      description.className = 'search-result-summary';
      description.textContent = item.summary || 'No summary provided for this article.';

      const meta = document.createElement('p');
      meta.className = 'search-result-meta';
      const pieces = [];
      if (item.author) {
        pieces.push(`Author ${formatPubkey(item.author)}`);
      }
      if (item.updatedAt) {
        pieces.push(`Updated ${formatTimestamp(item.updatedAt)}`);
      }
      if (item.relay) {
        try {
          pieces.push(new URL(item.relay).host);
        } catch (error) {
          pieces.push(item.relay);
        }
      }
      meta.textContent = pieces.join(' • ');

      li.appendChild(button);
      li.appendChild(description);
      if (pieces.length) {
        li.appendChild(meta);
      }
      list.appendChild(li);
    });

    searchResults.innerHTML = '';
    searchResults.appendChild(list);
  }

  async function loadArticle(reference) {
    if (!reference?.slug && !reference?.id) {
      return;
    }

    currentArticle = reference;
    revisions = [];
    revisionCache.clear();

    articleStatus.textContent = 'Loading article from Nostr…';
    articleTitle.textContent = '';
    articleMeta.textContent = '';
    articleSummary.textContent = '';
    articleContent.innerHTML = '<div class="empty-state">Loading article…</div>';
    compareStatus.textContent = 'Choose two revisions to review side by side.';
    setRevisionControlsEnabled(false);
    revisionTableWrapper.innerHTML = '<div class="empty-state">Loading revisions…</div>';
    compareContainer.innerHTML = '<div class="empty-state">Select two revisions to view their contents.</div>';

    const params = new URLSearchParams();
    if (reference.slug) {
      params.set('slug', reference.slug);
    }
    if (reference.id) {
      params.set('id', reference.id);
    }
    if (reference.relay) {
      params.set('relay', reference.relay);
    }

    try {
      const response = await fetch(`/api/page?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Article request failed with status ${response.status}`);
      }

      const data = await response.json();
      renderArticle(data);
      articleStatus.textContent = `Viewing “${data?.title || reference.slug}”.`;
      currentArticle = {
        slug: data?.slug || reference.slug,
        id: data?.id || reference.id,
        relay: data?.relay || reference.relay || ''
      };
      await loadRevisions(currentArticle);
    } catch (error) {
      console.error(error);
      articleStatus.textContent = 'Unable to load the article from Nostr.';
      articleContent.innerHTML = '<div class="empty-state">Failed to load article content.</div>';
      revisionTableWrapper.innerHTML = '<div class="empty-state">No revisions available.</div>';
      compareStatus.textContent = 'Unable to load revisions.';
    }
  }

  function renderArticle(data) {
    const title = data?.title || data?.slug || currentArticle?.slug || 'Untitled article';
    articleTitle.textContent = title;

    const metaParts = [];
    if (data?.author) {
      metaParts.push(`By ${formatPubkey(data.author)}`);
    }
    if (data?.updatedAt) {
      metaParts.push(`Updated ${formatTimestamp(data.updatedAt)}`);
    } else if (data?.createdAt) {
      metaParts.push(`Published ${formatTimestamp(data.createdAt)}`);
    }
    if (data?.relay) {
      try {
        metaParts.push(new URL(data.relay).host);
      } catch (error) {
        metaParts.push(data.relay);
      }
    }
    articleMeta.textContent = metaParts.join(' • ');

    articleSummary.textContent = data?.summary || data?.preview || '';
    articleContent.innerHTML = markdownToHtml(data?.content || '');
    articleContent.scrollTop = 0;
  }

  async function loadRevisions(reference) {
    revisions = [];
    revisionCache.clear();
    setRevisionControlsEnabled(false);

    const params = new URLSearchParams();
    if (reference?.slug) {
      params.set('slug', reference.slug);
    }
    if (reference?.relay) {
      params.set('relay', reference.relay);
    }

    try {
      const response = await fetch(`/api/revisions?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Revision lookup failed with status ${response.status}`);
      }

      const data = await response.json();
      revisions = Array.isArray(data?.revisions) ? data.revisions : [];

      if (revisions.length === 0) {
        revisionTableWrapper.innerHTML = '<div class="empty-state">No revisions found for this article.</div>';
        compareStatus.textContent = 'No revisions available to compare.';
        return;
      }

      populateRevisionSelect(compareSelectA, revisions, 'Select a revision', reference.slug);
      populateRevisionSelect(compareSelectB, revisions, 'Select a revision', reference.slug);
      setRevisionControlsEnabled(true);
      renderRevisionTable(revisions);
      compareStatus.textContent = 'Choose any two revisions to compare.';
    } catch (error) {
      console.error(error);
      revisionTableWrapper.innerHTML = '<div class="empty-state">Failed to load revisions.</div>';
      compareStatus.textContent = 'Unable to load revisions.';
    }
  }

  function populateRevisionSelect(selectElement, items, placeholder, slug) {
    selectElement.innerHTML = '';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder;
    selectElement.appendChild(placeholderOption);

    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.dataset.relay = item.relay || '';
      option.dataset.slug = slug || item.slug || '';
      const labelTimestamp = item.updatedAt || item.createdAt;
      const timestamp = labelTimestamp ? formatTimestamp(labelTimestamp) : 'Unknown time';
      const label = `${timestamp} — ${item.author ? formatPubkey(item.author) : 'Unknown author'}`;
      option.textContent = label;
      selectElement.appendChild(option);
    });
  }

  function renderRevisionTable(items) {
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Event', 'Updated', 'Author', 'Summary'].forEach((heading) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = heading;
      headerRow.appendChild(th);
    });
    head.appendChild(headerRow);
    table.appendChild(head);

    const body = document.createElement('tbody');
    items.forEach((item) => {
      const row = document.createElement('tr');

      const idCell = document.createElement('td');
      idCell.textContent = shortenId(item.id);
      row.appendChild(idCell);

      const timeCell = document.createElement('td');
      const timestamp = item.updatedAt || item.createdAt;
      timeCell.textContent = timestamp ? formatTimestamp(timestamp) : 'Unknown time';
      row.appendChild(timeCell);

      const authorCell = document.createElement('td');
      authorCell.textContent = item.author ? formatPubkey(item.author) : 'Unknown author';
      row.appendChild(authorCell);

      const summaryCell = document.createElement('td');
      summaryCell.textContent = item.summary || '—';
      row.appendChild(summaryCell);

      body.appendChild(row);
    });

    table.appendChild(body);
    revisionTableWrapper.innerHTML = '';
    revisionTableWrapper.appendChild(table);
  }

  function setRevisionControlsEnabled(enabled) {
    compareSelectA.disabled = !enabled;
    compareSelectB.disabled = !enabled;
    if (!enabled) {
      compareSelectA.value = '';
      compareSelectB.value = '';
    }
  }

  async function updateComparison() {
    const revisionA = getSelectedRevision(compareSelectA);
    const revisionB = getSelectedRevision(compareSelectB);

    if (!revisionA || !revisionB || revisionA.id === revisionB.id) {
      compareContainer.innerHTML = '<div class="empty-state">Select two different revisions to view their contents.</div>';
      return;
    }

    compareContainer.innerHTML = '<div class="empty-state">Loading revision content…</div>';

    try {
      const [dataA, dataB] = await Promise.all([
        fetchRevision(revisionA),
        fetchRevision(revisionB)
      ]);
      renderComparison(dataA, dataB);
      compareStatus.textContent = 'Comparing selected revisions.';
    } catch (error) {
      console.error(error);
      compareContainer.innerHTML = '<div class="empty-state">Unable to load the selected revisions.</div>';
      compareStatus.textContent = 'Failed to load one or more revisions.';
    }
  }

  function getSelectedRevision(selectElement) {
    const option = selectElement.selectedOptions[0];
    if (!option || !option.value) {
      return null;
    }
    return {
      id: option.value,
      relay: option.dataset.relay || '',
      slug: option.dataset.slug || currentArticle?.slug || ''
    };
  }

  async function fetchRevision(reference) {
    const cacheKey = `${reference.relay}|${reference.id}`;
    if (revisionCache.has(cacheKey)) {
      return revisionCache.get(cacheKey);
    }

    const params = new URLSearchParams();
    params.set('id', reference.id);
    if (reference.relay) {
      params.set('relay', reference.relay);
    }

    const response = await fetch(`/api/revision?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Revision ${reference.id} failed with status ${response.status}`);
    }

    const data = await response.json();
    const revision = {
      ...data,
      relay: data?.relay || reference.relay || ''
    };
    revisionCache.set(cacheKey, revision);
    return revision;
  }

  function renderComparison(left, right) {
    compareContainer.innerHTML = '';

    const leftPanel = createRevisionPanel('Revision A', left);
    const rightPanel = createRevisionPanel('Revision B', right);

    compareContainer.appendChild(leftPanel);
    compareContainer.appendChild(rightPanel);
  }

  function createRevisionPanel(label, revision) {
    const panel = document.createElement('div');
    panel.className = 'revision-panel';

    const header = document.createElement('header');
    header.innerHTML = `<strong>${label}</strong>`;

    const titleSpan = document.createElement('span');
    titleSpan.textContent = revision?.title || revision?.slug || 'Untitled revision';
    header.appendChild(titleSpan);

    const metaSpan = document.createElement('span');
    const metaParts = [];
    if (revision?.updatedAt || revision?.createdAt) {
      metaParts.push(formatTimestamp(revision.updatedAt || revision.createdAt));
    }
    if (revision?.author) {
      metaParts.push(formatPubkey(revision.author));
    }
    if (revision?.relay) {
      try {
        metaParts.push(new URL(revision.relay).host);
      } catch (error) {
        metaParts.push(revision.relay);
      }
    }
    metaSpan.textContent = metaParts.join(' • ') || '';
    header.appendChild(metaSpan);

    panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'revision-body';
    body.innerHTML = markdownToHtml(revision?.content || '');
    panel.appendChild(body);

    return panel;
  }

  function formatTimestamp(value) {
    if (!value) {
      return 'Unknown time';
    }
    const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return 'Unknown time';
    }
    return date.toLocaleString();
  }

  function formatPubkey(pubkey) {
    if (!pubkey || typeof pubkey !== 'string') {
      return 'Unknown author';
    }
    const trimmed = pubkey.trim();
    if (trimmed.length <= 12) {
      return trimmed;
    }
    return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
  }

  function shortenId(id) {
    if (!id || typeof id !== 'string') {
      return id || '';
    }
    const trimmed = id.trim();
    if (trimmed.length <= 12) {
      return trimmed;
    }
    return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
  }

  function markdownToHtml(markdown) {
    if (!markdown) {
      return '<div class="empty-state">No content available.</div>';
    }

    const escaped = escapeHtml(markdown);

    const codeBlocks = [];
    const placeholder = escaped.replace(/```([\s\S]*?)```/g, (_, code) => {
      const index = codeBlocks.push(code) - 1;
      return `@@CODE_BLOCK_${index}@@`;
    });

    let html = placeholder
      .replace(/^###### (.*)$/gm, '<h6>$1</h6>')
      .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
      .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((https?:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^-\s+(.*)$/gm, '<li>$1</li>');

    html = html.replace(/(?:<li>.*?<\/li>\s*)+/gs, (match) => `<ul>${match.trim()}</ul>`);

    html = html
      .split(/\n{2,}/)
      .map((paragraph) => {
        if (/^<h[1-6]>/.test(paragraph) || /^<ul>/.test(paragraph) || /^<blockquote>/.test(paragraph)) {
          return paragraph;
        }
        if (!paragraph.trim()) {
          return '';
        }
        return `<p>${paragraph.trim()}</p>`;
      })
      .join('');

    html = html.replace(/@@CODE_BLOCK_(\d+)@@/g, (_, index) => {
      const code = codeBlocks[Number(index)] || '';
      return `<pre><code>${code}</code></pre>`;
    });

    return html || '<div class="empty-state">No content available.</div>';
  }

  function escapeHtml(value) {
    const source = typeof value === 'string' ? value : String(value || '');
    return source.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }
})();
