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

  let currentTitle = '';
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
    if (target instanceof HTMLButtonElement && target.dataset.title) {
      loadArticle(target.dataset.title);
    }
  });

  compareSelectA.addEventListener('change', updateComparison);
  compareSelectB.addEventListener('change', updateComparison);

  async function performSearch(query) {
    searchStatus.textContent = 'Searching…';
    searchResults.innerHTML = '<div class="empty-state">Searching…</div>';

    try {
      const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
      }

      const data = await response.json();
      const items = Array.isArray(data?.results) ? data.results : [];

      if (items.length === 0) {
        searchStatus.textContent = 'No results found. Try another query.';
        searchResults.innerHTML = '<div class="empty-state">No results found.</div>';
        return;
      }

      renderSearchResults(items);
      searchStatus.textContent = `Showing ${items.length} result${items.length === 1 ? '' : 's'} for “${query}”.`;
    } catch (error) {
      console.error(error);
      searchStatus.textContent = 'Something went wrong while searching. Please try again later.';
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
      button.dataset.title = item.title;
      button.textContent = item.title;

      const description = document.createElement('p');
      description.textContent = item.extract || item.description || 'No summary available.';

      li.appendChild(button);
      li.appendChild(description);
      list.appendChild(li);
    });

    searchResults.innerHTML = '';
    searchResults.appendChild(list);
  }

  async function loadArticle(title) {
    if (!title) {
      return;
    }

    currentTitle = title;
    articleStatus.textContent = `Loading “${title}”…`;
    articleTitle.textContent = '';
    articleMeta.textContent = '';
    articleSummary.textContent = '';
    articleContent.innerHTML = '<div class="empty-state">Loading article…</div>';
    compareStatus.textContent = 'Choose two revisions to review side by side.';
    setRevisionControlsEnabled(false);
    revisionTableWrapper.innerHTML = '<div class="empty-state">Loading revisions…</div>';
    compareContainer.innerHTML = '<div class="empty-state">Select two revisions to view their contents.</div>';

    try {
      const response = await fetch(`/api/page?title=${encodeURIComponent(title)}`);
      if (!response.ok) {
        throw new Error(`Article request failed with status ${response.status}`);
      }

      const data = await response.json();
      renderArticle(data);
      articleStatus.textContent = `Viewing “${data?.title || title}”.`;
      await loadRevisions(title);
    } catch (error) {
      console.error(error);
      articleStatus.textContent = 'Unable to load the article. Please try again later.';
      articleContent.innerHTML = '<div class="empty-state">Failed to load article content.</div>';
      revisionTableWrapper.innerHTML = '<div class="empty-state">No revisions available.</div>';
    }
  }

  function renderArticle(data) {
    const title = data?.title || currentTitle;
    articleTitle.textContent = title;

    const metaParts = [];
    if (data?.lastModified) {
      const timestamp = new Date(data.lastModified);
      if (!Number.isNaN(timestamp.getTime())) {
        metaParts.push(`Last updated ${timestamp.toLocaleString()}`);
      }
    }
    articleMeta.textContent = metaParts.join(' • ');

    articleSummary.textContent = data?.extract || data?.description || '';
    articleContent.innerHTML = data?.html || '';
    articleContent.scrollTop = 0;
  }

  async function loadRevisions(title) {
    revisions = [];
    revisionCache.clear();
    setRevisionControlsEnabled(false);

    try {
      const response = await fetch(`/api/revisions?title=${encodeURIComponent(title)}`);
      if (!response.ok) {
        throw new Error(`Revision lookup failed with status ${response.status}`);
      }

      const data = await response.json();
      revisions = Array.isArray(data?.revisions) ? data.revisions.slice().reverse() : [];

      if (revisions.length === 0) {
        revisionTableWrapper.innerHTML = '<div class="empty-state">No revisions found for this article.</div>';
        compareStatus.textContent = 'No revisions available to compare.';
        return;
      }

      populateRevisionSelect(compareSelectA, revisions, 'Select a revision');
      populateRevisionSelect(compareSelectB, revisions, 'Select a revision');
      setRevisionControlsEnabled(true);
      renderRevisionTable(revisions);
      compareStatus.textContent = 'Choose any two revisions to compare.';
    } catch (error) {
      console.error(error);
      revisionTableWrapper.innerHTML = '<div class="empty-state">Failed to load revisions.</div>';
      compareStatus.textContent = 'Unable to load revisions.';
    }
  }

  function populateRevisionSelect(selectElement, items, placeholder) {
    selectElement.innerHTML = '';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder;
    selectElement.appendChild(placeholderOption);

    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = String(item.revid);
      const timestamp = new Date(item.timestamp);
      const label = `${timestamp.toLocaleString()} – ${item.user || 'Anonymous'}`;
      option.textContent = label;
      selectElement.appendChild(option);
    });
  }

  function renderRevisionTable(items) {
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Revision ID', 'Timestamp', 'User', 'Comment'].forEach((heading) => {
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
      idCell.textContent = String(item.revid);
      row.appendChild(idCell);

      const timeCell = document.createElement('td');
      const timestamp = new Date(item.timestamp);
      timeCell.textContent = timestamp.toLocaleString();
      row.appendChild(timeCell);

      const userCell = document.createElement('td');
      userCell.textContent = item.user || 'Anonymous';
      row.appendChild(userCell);

      const commentCell = document.createElement('td');
      commentCell.textContent = item.comment || '—';
      row.appendChild(commentCell);

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
    const idA = compareSelectA.value;
    const idB = compareSelectB.value;

    if (!idA || !idB || idA === idB) {
      compareContainer.innerHTML = '<div class="empty-state">Select two different revisions to view their contents.</div>';
      return;
    }

    compareContainer.innerHTML = '<div class="empty-state">Loading revision content…</div>';

    try {
      const [revisionA, revisionB] = await Promise.all([fetchRevision(idA), fetchRevision(idB)]);
      renderComparison(revisionA, revisionB);
      compareStatus.textContent = 'Comparing selected revisions.';
    } catch (error) {
      console.error(error);
      compareContainer.innerHTML = '<div class="empty-state">Unable to load the selected revisions.</div>';
      compareStatus.textContent = 'Failed to load one or more revisions.';
    }
  }

  async function fetchRevision(oldid) {
    if (revisionCache.has(oldid)) {
      return revisionCache.get(oldid);
    }

    const response = await fetch(`/api/revision?oldid=${encodeURIComponent(oldid)}`);
    if (!response.ok) {
      throw new Error(`Revision ${oldid} failed with status ${response.status}`);
    }

    const data = await response.json();
    const meta = revisions.find((item) => String(item.revid) === String(oldid));
    const result = {
      ...data,
      timestamp: data.timestamp || meta?.timestamp || '',
      user: meta?.user || 'Anonymous'
    };
    revisionCache.set(oldid, result);
    return result;
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
    titleSpan.textContent = revision?.title ? stripHtml(revision.title) : 'Untitled revision';
    header.appendChild(titleSpan);

    const metaSpan = document.createElement('span');
    if (revision?.timestamp) {
      const timestamp = new Date(revision.timestamp);
      metaSpan.textContent = `${timestamp.toLocaleString()} • ${revision?.user || 'Anonymous'}`;
    } else {
      metaSpan.textContent = revision?.user || 'Anonymous';
    }
    header.appendChild(metaSpan);

    panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'revision-body';
    body.innerHTML = revision?.html || '<div class="empty-state">No content available.</div>';
    panel.appendChild(body);

    return panel;
  }

  function stripHtml(value) {
    const element = document.createElement('div');
    element.innerHTML = value || '';
    return element.textContent || element.innerText || '';
  }
})();
