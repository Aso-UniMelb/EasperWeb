<script>
  import { untrack } from 'svelte';
  import { appState } from '../../state/appState.svelte.js';
  import { audioState } from '../../state/audioState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import {
    lexiconState,
    createDefaultLexiconFields,
  } from '../../state/lexiconState.svelte.js';
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import { formatTimeSec2 } from '../../utils/formatters.js';
  import { saveFileWithDialog } from '../../utils/fileSave.js';
  import { isLexiconValueValid, formatLexicon } from '../../utils/subTiers.js';
  import {
    extractWordTagList,
    buildWordTagTsv,
  } from '../../utils/wordTagList.js';

  let { onClose = () => {} } = $props();

  // Ensure lexicons are loaded from IndexedDB
  $effect(() => {
    if (
      !lexiconState.isInitialized &&
      (!lexiconState.lexicons || lexiconState.lexicons.length === 0)
    ) {
      lexiconState.init();
    }
  });

  // Extraction & filter controls
  let searchQuery = $state('');
  let filterMode = $state('all'); // 'all' | 'multitag' | 'untagged' | 'new_lexicon'
  let caseInsensitive = $state(true);
  let ignorePunctuationAndTags = $state(true);
  let selectedGroupKey = $state(null);

  // Sorting state: 'token' | 'freq' | `tier:${id}`
  let sortField = $state('token');
  let sortDir = $state('asc'); // 'asc' | 'desc'

  // Selection & occurrence navigation state
  let selectedRowIds = $state(new Set());
  let activeRowId = $state(null);
  let activeOccurrenceIdx = $state(0);

  // Add-to-Lexicon inline drawer state
  let showLexiconExport = $state(false);
  let targetLexiconId = $state(''); // lexicon id or '__new__'
  let newLexiconTitle = $state('');
  let tierFieldMap = $state({}); // { [tierId]: fieldId | '__create__' | '' }
  let isSavingLexicon = $state(false);
  let feedbackMessage = $state('');
  let feedbackType = $state('info'); // 'info' | 'success' | 'warning' | 'error'

  const projectSubTiers = $derived(projectState.activeProject?.subTiers || []);
  const projectSpeakers = $derived(projectState.activeProject?.speakers || []);
  const projectLexiconId = $derived(
    projectState.activeProject?.lexiconId || null,
  );
  const projectLexicon = $derived(
    lexiconState.lexicons?.find((l) => l.id === projectLexiconId) || null,
  );

  // Live extraction across all project dialogue segments
  const extraction = $derived(
    extractWordTagList({
      segments: transcriptState.segments,
      subTiers: projectSubTiers,
      speakers: projectSpeakers,
      lexicon: projectLexicon,
      caseInsensitive,
      ignorePunctuationAndTags,
      selectedGroupKey,
    }),
  );

  const activeWordTiers = $derived(extraction.activeWordTiers);
  const delimiterGroups = $derived(extraction.delimiterGroups);

  // Keep filterMode valid if sub-tiers or lexicon change
  $effect(() => {
    if (
      (filterMode === 'multitag' || filterMode === 'untagged') &&
      activeWordTiers.length === 0
    ) {
      filterMode = 'all';
    } else if (filterMode === 'new_lexicon' && !projectLexicon) {
      filterMode = 'all';
    }
  });

  // Sync default targetLexiconId when lexicons load or project lexicon changes
  $effect(() => {
    const lexList = lexiconState.lexicons || [];
    untrack(() => {
      if (!targetLexiconId) {
        if (
          projectLexiconId &&
          lexList.some((l) => l.id === projectLexiconId)
        ) {
          targetLexiconId = projectLexiconId;
        } else if (lexList.length > 0) {
          targetLexiconId = lexList[0].id;
        } else {
          targetLexiconId = '__new__';
        }
      } else if (
        targetLexiconId !== '__new__' &&
        lexList.length > 0 &&
        !lexList.some((l) => l.id === targetLexiconId)
      ) {
        targetLexiconId = projectLexiconId || lexList[0].id;
      }
      if (!newLexiconTitle && projectState.activeProject?.title) {
        newLexiconTitle = `${projectState.activeProject.title} Lexicon`;
      }
    });
  });

  const targetLexiconObj = $derived(
    targetLexiconId && targetLexiconId !== '__new__'
      ? lexiconState.lexicons?.find((l) => l.id === targetLexiconId) || null
      : null,
  );

  const targetLexiconNonHeadwordFields = $derived(
    targetLexiconObj?.fields
      ? targetLexiconObj.fields.filter(
          (f) => (f.name || '').trim().toLowerCase() !== 'headword',
        )
      : [],
  );

  // Auto-map activeWordTiers to matching fields in targetLexiconObj
  $effect(() => {
    const tiers = activeWordTiers;
    const isNew = targetLexiconId === '__new__';
    const fields = targetLexiconNonHeadwordFields;

    untrack(() => {
      const nextMap = {};
      for (const tier of tiers) {
        const key = String(tier.id);
        if (isNew) {
          nextMap[key] = '__create__';
          continue;
        }
        const prev = tierFieldMap[key];
        if (
          prev === '' ||
          prev === '__create__' ||
          (prev && fields.some((f) => f.id === prev))
        ) {
          nextMap[key] = prev;
          continue;
        }
        const tierLower = (tier.name || '').trim().toLowerCase();
        const exactMatch = fields.find(
          (f) => (f.name || '').trim().toLowerCase() === tierLower,
        );
        if (exactMatch) {
          nextMap[key] = exactMatch.id;
        } else {
          nextMap[key] = '__create__';
        }
      }
      tierFieldMap = nextMap;
    });
  });

  // Filtered & sorted rows
  const filteredRows = $derived.by(() => {
    let list = extraction.rows;

    if (filterMode === 'multitag') {
      list = list.filter((r) => r.isMultiTag);
    } else if (filterMode === 'untagged') {
      list = list.filter((r) => r.hasUntagged);
    } else if (filterMode === 'new_lexicon') {
      list = list.filter((r) => !r.inLexicon);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        if (r.token.toLowerCase().includes(q)) return true;
        for (const tier of activeWordTiers) {
          const tv = (r.tags?.[String(tier.id)] || '').toLowerCase();
          if (tv.includes(q)) return true;
        }
        return false;
      });
    }

    return list;
  });

  const sortedRows = $derived.by(() => {
    const copy = [...filteredRows];
    const dir = sortDir === 'asc' ? 1 : -1;

    copy.sort((a, b) => {
      if (sortField === 'freq') {
        if (a.frequency !== b.frequency) {
          return (a.frequency - b.frequency) * dir;
        }
        return a.token.localeCompare(b.token, undefined, {
          sensitivity: 'base',
        });
      }

      if (sortField === 'token') {
        const cmp = a.token.localeCompare(b.token, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (cmp !== 0) return cmp * dir;
        return b.frequency - a.frequency;
      }

      if (sortField.startsWith('tier:')) {
        const tierId = sortField.slice(5);
        const valA = a.tags?.[tierId] ?? '';
        const valB = b.tags?.[tierId] ?? '';
        // Keep non-empty tags before empty tags when sorting ascending by tag
        if (!valA && valB) return 1;
        if (valA && !valB) return -1;
        const cmp = valA.localeCompare(valB, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (cmp !== 0) return cmp * dir;
        return a.token.localeCompare(b.token, undefined, {
          sensitivity: 'base',
        });
      }

      return 0;
    });

    return copy;
  });

  const activeRow = $derived(
    activeRowId ? sortedRows.find((r) => r.id === activeRowId) || null : null,
  );

  const allShownSelected = $derived(
    sortedRows.length > 0 && sortedRows.every((r) => selectedRowIds.has(r.id)),
  );

  const selectedShownCount = $derived(
    sortedRows.filter((r) => selectedRowIds.has(r.id)).length,
  );

  const rowsForLexiconImport = $derived(
    selectedShownCount > 0
      ? sortedRows.filter((r) => selectedRowIds.has(r.id))
      : sortedRows,
  );

  function showFeedback(msg, type = 'info', durationMs = 4000) {
    feedbackMessage = msg;
    feedbackType = type;
    if (durationMs > 0) {
      setTimeout(() => {
        if (feedbackMessage === msg) feedbackMessage = '';
      }, durationMs);
    }
  }

  function toggleSort(field) {
    if (sortField === field) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDir = field === 'freq' ? 'desc' : 'asc';
    }
  }

  function toggleSelectAll() {
    const next = new Set(selectedRowIds);
    if (allShownSelected) {
      for (const r of sortedRows) {
        next.delete(r.id);
      }
    } else {
      for (const r of sortedRows) {
        next.add(r.id);
      }
    }
    selectedRowIds = next;
  }

  function toggleSelectRow(rowId, e) {
    if (e) e.stopPropagation();
    const next = new Set(selectedRowIds);
    if (next.has(rowId)) {
      next.delete(rowId);
    } else {
      next.add(rowId);
    }
    selectedRowIds = next;
  }

  function jumpToOccurrence(row, occIndex = 0) {
    if (!row || !row.occurrences || row.occurrences.length === 0) return;
    const clamped =
      ((occIndex % row.occurrences.length) + row.occurrences.length) %
      row.occurrences.length;
    activeRowId = row.id;
    activeOccurrenceIdx = clamped;

    const occ = row.occurrences[clamped];
    if (!occ) return;

    transcriptState.selectSegment(occ.segmentId, true);

    setTimeout(() => {
      const cardEl = document.getElementById(`segment-item-${occ.segmentId}`);
      if (!cardEl) return;

      if (activeWordTiers.length > 0) {
        // Prefer focusing the first untagged/invalid tier cell on this row, or the first active word tier
        let targetTier = activeWordTiers[0];
        for (const t of activeWordTiers) {
          const val = row.tags?.[String(t.id)] ?? '';
          if (!val || !isLexiconValueValid(val, t.lexicon)) {
            targetTier = t;
            break;
          }
        }
        const wordEl = document.getElementById(
          `word-annot-${occ.segmentId}-${targetTier.id}-${occ.wordIndex}`,
        );
        if (wordEl) {
          wordEl.focus();
          try {
            wordEl.select();
          } catch (_) {}
          return;
        }
      }

      const mainTextarea =
        cardEl.querySelector('textarea[data-tier="main"]') ||
        cardEl.querySelector('textarea');
      if (mainTextarea) {
        mainTextarea.focus();
        try {
          mainTextarea.setSelectionRange(
            occ.charOffset,
            occ.charOffset + occ.charLength,
          );
        } catch (_) {}
      }
    }, 45);
  }

  function handleRowClick(row) {
    if (activeRowId === row.id && row.occurrences.length > 1) {
      jumpToOccurrence(row, activeOccurrenceIdx + 1);
    } else {
      jumpToOccurrence(row, 0);
    }
  }

  async function handleExportTsv() {
    if (sortedRows.length === 0) {
      showFeedback('No rows available to export.', 'warning');
      return;
    }

    const tsvContent = buildWordTagTsv(sortedRows, activeWordTiers);
    const blob = new Blob([tsvContent], {
      type: 'text/tab-separated-values;charset=utf-8',
    });
    const baseName =
      projectState.activeProject?.title?.trim().replace(/[^a-z0-9_-]/gi, '_') ||
      audioState.getBaseFileName();

    const res = await saveFileWithDialog(blob, {
      suggestedName: `${baseName}-word-tag-list.tsv`,
      description: 'Tab-Separated Values (.tsv)',
      accept: { 'text/tab-separated-values': ['.tsv'] },
    });

    if (res.saved) {
      showFeedback(
        `Exported ${sortedRows.length} rows to "${res.filename}".`,
        'success',
      );
      appState.statusMessage = `Exported "${res.filename}" successfully.`;
    }
  }

  async function handleImportToLexicon() {
    const rowsToImport = rowsForLexiconImport;
    if (rowsToImport.length === 0) {
      showFeedback('No rows available to add to lexicon.', 'warning');
      return;
    }

    isSavingLexicon = true;
    try {
      let resolvedLexiconId = targetLexiconId;

      if (resolvedLexiconId === '__new__') {
        const cleanTitle =
          newLexiconTitle.trim() ||
          `${projectState.activeProject?.title || 'Project'} Lexicon`;

        // Build default fields and ensure any mapped sub-tiers exist as fields
        const initialFields = createDefaultLexiconFields();
        for (const tier of activeWordTiers) {
          const mapChoice = tierFieldMap[String(tier.id)];
          if (mapChoice === '') continue;
          const exists = initialFields.some(
            (f) =>
              (f.name || '').trim().toLowerCase() ===
              (tier.name || '').trim().toLowerCase(),
          );
          if (!exists && tier.name?.trim()) {
            initialFields.push({
              id: `field_${Date.now()}_${tier.id}`,
              name: tier.name.trim(),
              validValues: formatLexicon(tier.lexicon),
            });
          }
        }

        const created = await lexiconState.createLexicon({
          title: cleanTitle,
          fields: initialFields,
          navigate: false,
        });
        resolvedLexiconId = created.id;
        targetLexiconId = created.id;

        // If active project has no lexicon yet, link this newly created lexicon automatically
        if (
          projectState.activeProjectId &&
          !projectState.activeProject?.lexiconId
        ) {
          await projectState.setProjectLexicon(
            projectState.activeProjectId,
            created.id,
          );
        }
      }

      const lexObj = lexiconState.lexicons.find(
        (l) => l.id === resolvedLexiconId,
      );
      if (!lexObj) {
        showFeedback('Please select a valid lexicon.', 'error');
        return;
      }

      // Resolve field mappings, creating any '__create__' fields on the target lexicon first
      const finalTierToFieldId = {};
      for (const tier of activeWordTiers) {
        const choice = tierFieldMap[String(tier.id)];
        if (!choice) continue;
        if (choice === '__create__') {
          const currentLex = lexiconState.lexicons.find(
            (l) => l.id === resolvedLexiconId,
          );
          const matching = (currentLex?.fields || []).find(
            (f) =>
              (f.name || '').trim().toLowerCase() ===
              (tier.name || '').trim().toLowerCase(),
          );
          if (matching) {
            finalTierToFieldId[String(tier.id)] = matching.id;
          } else {
            const addedField = await lexiconState.addField(resolvedLexiconId, {
              name: tier.name || `Tier ${tier.id}`,
              validValues: formatLexicon(tier.lexicon),
            });
            if (addedField) {
              finalTierToFieldId[String(tier.id)] = addedField.id;
            }
          }
        } else {
          finalTierToFieldId[String(tier.id)] = choice;
        }
      }

      const { addedCount, updatedCount, skippedCount, lexicon } =
        await lexiconState.importWordTagRows(
          resolvedLexiconId,
          rowsToImport,
          finalTierToFieldId,
        );

      // Re-sync Hunspell if this is the active project's lexicon
      if (
        lexicon &&
        projectState.activeProject?.lexiconId === resolvedLexiconId
      ) {
        await projectState.syncProjectLexiconToHunspell(resolvedLexiconId);
      }

      const lexName = lexicon?.title || lexObj.title || 'Lexicon';
      const parts = [];
      if (addedCount > 0) parts.push(`${addedCount} added`);
      if (updatedCount > 0) parts.push(`${updatedCount} updated`);
      if (skippedCount > 0) parts.push(`${skippedCount} already present`);

      showFeedback(
        `${lexName}: ${parts.join(', ') || 'No changes needed'}.`,
        addedCount > 0 || updatedCount > 0 ? 'success' : 'info',
        5000,
      );
    } catch (err) {
      console.error('[WordTagListPanel] Failed to import to lexicon:', err);
      showFeedback(`Failed to update lexicon: ${err.message || err}`, 'error');
    } finally {
      isSavingLexicon = false;
    }
  }
</script>

<div class="inline-settings-panel word-tag-list-panel">
  <!-- Header Bar -->
  <div class="side-panel-header">
    <div class="side-panel-title">
      <i class="fa-solid fa-table-list"></i>
      <span>Word &amp; Tag List</span>
      {#if extraction.rows.length > 0}
        <span class="badge-count-pill">{sortedRows.length}</span>
      {/if}
    </div>

    <div class="side-panel-actions">
      <button
        type="button"
        class="panel-close-btn"
        onclick={onClose}
        title="Close Word & Tag List panel"
        aria-label="Close"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  </div>

  <div class="panel-body">
    {#if transcriptState.segments.length === 0 || extraction.totalTokensCount === 0}
      <!-- Empty State -->
      <div class="wordlist-empty-state">
        <div class="empty-icon-wrap">
          <i class="fa-solid fa-table-list"></i>
        </div>
        <h4 class="empty-title">No Words Found Yet</h4>
        <p class="empty-desc">
          Transcribe dialogue segments to inspect word frequencies, check
          sub-tier tag consistency, export TSV lists, or add entries to a
          lexicon.
        </p>
      </div>
    {:else}
      <!-- Search & Normalization Toolbar -->
      <div class="wordlist-toolbar">
        <div class="search-input-wrap">
          <i class="fa-solid fa-magnifying-glass search-icon"></i>
          <input
            type="text"
            class="wordlist-search-input"
            placeholder={activeWordTiers.length > 0
              ? 'Filter token or tag...'
              : 'Filter token...'}
            bind:value={searchQuery}
          />
          {#if searchQuery}
            <button
              type="button"
              class="btn-clear-search"
              onclick={() => (searchQuery = '')}
              title="Clear filter"
              aria-label="Clear filter"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          {/if}
        </div>

        <button
          type="button"
          class="btn-norm-toggle {!caseInsensitive ? 'is-active' : ''}"
          onclick={() => (caseInsensitive = !caseInsensitive)}
          title={caseInsensitive
            ? 'Case-insensitive (merges "Go" and "go"). Click for exact case.'
            : 'Case-sensitive ("Go" and "go" listed separately). Click to merge case.'}
        >
          Aa
        </button>

        <button
          type="button"
          class="btn-norm-toggle {ignorePunctuationAndTags ? 'is-active' : ''}"
          onclick={() => (ignorePunctuationAndTags = !ignorePunctuationAndTags)}
          title={ignorePunctuationAndTags
            ? 'Ignoring punctuation & <tags>. Click to include raw tokens.'
            : 'Including punctuation & <tags>. Click to strip punctuation & <tags>.'}
        >
          &lt;&hellip;&gt;
        </button>
      </div>

      <!-- Optional Delimiter Group Selector (only shown if project has multiple tokenised sub-tiers with different delimiters) -->
      {#if delimiterGroups.length > 1}
        <div class="delimiter-group-bar">
          <span class="delim-label">Tiers:</span>
          {#each delimiterGroups as grp (grp.key)}
            <button
              type="button"
              class="delim-pill {extraction.activeGroupKey === grp.key
                ? 'active'
                : ''}"
              onclick={() => (selectedGroupKey = grp.key)}
            >
              {grp.label}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Filter Tabs & Summary Stats -->
      <div class="filter-tabs-row">
        <div class="category-filter-tabs">
          <button
            type="button"
            class="cat-tab {filterMode === 'all' ? 'active' : ''}"
            onclick={() => (filterMode = 'all')}
          >
            All ({extraction.rows.length})
          </button>

          {#if activeWordTiers.length > 0}
            <button
              type="button"
              class="cat-tab {filterMode === 'multitag'
                ? 'active'
                : ''} {extraction.multiTagRowsCount > 0 ? 'has-warn' : ''}"
              onclick={() => (filterMode = 'multitag')}
              title="Tokens that appear with 2 or more different tag combinations across segments"
            >
              Multi-tag ({extraction.multiTagRowsCount})
            </button>

            <button
              type="button"
              class="cat-tab {filterMode === 'untagged' ? 'active' : ''}"
              onclick={() => (filterMode = 'untagged')}
              title="Tokens missing a tag in one or more tokenised sub-tiers"
            >
              Untagged ({extraction.untaggedRowsCount})
            </button>
          {/if}

          {#if projectLexicon}
            <button
              type="button"
              class="cat-tab {filterMode === 'new_lexicon' ? 'active' : ''}"
              onclick={() => (filterMode = 'new_lexicon')}
              title="Tokens not yet in active lexicon ({projectLexicon.title ||
                'Lexicon'})"
            >
              Not in Lexicon ({extraction.notInLexiconRowsCount})
            </button>
          {/if}
        </div>
      </div>

      <!-- Active Row Occurrence Stepper -->
      {#if activeRow && activeRow.occurrences.length > 0}
        {@const curOcc =
          activeRow.occurrences[activeOccurrenceIdx] ||
          activeRow.occurrences[0]}
        <div class="occurrence-stepper-bar">
          <div class="occ-info">
            <span class="occ-token">"{activeRow.token}"</span>
            <span class="occ-seg">
              #{curOcc.segmentIndex} [{formatTimeSec2(curOcc.start)}]
            </span>
          </div>
          <div class="occ-controls">
            <button
              type="button"
              class="btn-occ-step"
              disabled={activeRow.occurrences.length <= 1}
              onclick={() =>
                jumpToOccurrence(activeRow, activeOccurrenceIdx - 1)}
              title="Previous occurrence"
              aria-label="Previous occurrence"
            >
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <span class="occ-counter">
              {activeOccurrenceIdx + 1} / {activeRow.occurrences.length}
            </span>
            <button
              type="button"
              class="btn-occ-step"
              disabled={activeRow.occurrences.length <= 1}
              onclick={() =>
                jumpToOccurrence(activeRow, activeOccurrenceIdx + 1)}
              title="Next occurrence"
              aria-label="Next occurrence"
            >
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
      {/if}

      <!-- Sortable Table -->
      {#if sortedRows.length === 0}
        <div class="no-filter-matches">
          No matching tokens for the current filter.
        </div>
      {:else}
        <div class="wordlist-table-scroll">
          <table class="wordlist-table" dir={transcriptState.textDirection}>
            <thead>
              <tr>
                <th class="col-check">
                  <input
                    type="checkbox"
                    checked={allShownSelected}
                    onchange={toggleSelectAll}
                    title="Select or deselect all shown rows"
                    aria-label="Select all shown rows"
                  />
                </th>
                <th class="col-token">
                  <button
                    type="button"
                    class="th-sort-btn {sortField === 'token' ? 'active' : ''}"
                    onclick={() => toggleSort('token')}
                  >
                    <span>Token</span>
                    <i
                      class="fa-solid {sortField === 'token'
                        ? sortDir === 'asc'
                          ? 'fa-sort-up'
                          : 'fa-sort-down'
                        : 'fa-sort'}"
                    ></i>
                  </button>
                </th>
                {#each activeWordTiers as tier (tier.id)}
                  {@const tierSortKey = `tier:${tier.id}`}
                  <th class="col-tag">
                    <button
                      type="button"
                      class="th-sort-btn {sortField === tierSortKey
                        ? 'active'
                        : ''}"
                      onclick={() => toggleSort(tierSortKey)}
                      title="Sort by {tier.name}"
                    >
                      <span class="th-tier-name">{tier.name}</span>
                      <i
                        class="fa-solid {sortField === tierSortKey
                          ? sortDir === 'asc'
                            ? 'fa-sort-up'
                            : 'fa-sort-down'
                          : 'fa-sort'}"
                      ></i>
                    </button>
                  </th>
                {/each}
                <th class="col-freq">
                  <button
                    type="button"
                    class="th-sort-btn th-sort-right {sortField === 'freq'
                      ? 'active'
                      : ''}"
                    onclick={() => toggleSort('freq')}
                    title="Sort by frequency"
                  >
                    <span>Freq</span>
                    <i
                      class="fa-solid {sortField === 'freq'
                        ? sortDir === 'asc'
                          ? 'fa-sort-up'
                          : 'fa-sort-down'
                        : 'fa-sort'}"
                    ></i>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {#each sortedRows as row (row.id)}
                {@const isSelected = selectedRowIds.has(row.id)}
                {@const isActive = activeRowId === row.id}
                <tr
                  class="wordlist-row {isActive
                    ? 'is-active'
                    : ''} {row.isMultiTag ? 'is-multitag' : ''}"
                  onclick={() => handleRowClick(row)}
                  title="Click to jump to segment #{row.occurrences[0]
                    ?.segmentIndex}"
                >
                  <td
                    class="col-check"
                    onclick={(e) => toggleSelectRow(row.id, e)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onclick={(e) => e.stopPropagation()}
                      onchange={(e) => toggleSelectRow(row.id, e)}
                      aria-label="Select {row.token}"
                    />
                  </td>

                  <td class="col-token">
                    <div class="token-cell-inner">
                      <span class="token-text">{row.token}</span>
                      {#if row.isMultiTag}
                        <span
                          class="multitag-dot"
                          title="Tagged in {row.variantCount} different ways across segments"
                        >
                          {row.variantCount}&times;
                        </span>
                      {/if}
                      {#if projectLexicon && row.inLexicon}
                        <i
                          class="fa-solid fa-book-open lex-present-icon"
                          title="Present in active lexicon"
                        ></i>
                      {/if}
                    </div>
                  </td>

                  {#each activeWordTiers as tier (tier.id)}
                    {@const tagVal = row.tags?.[String(tier.id)] ?? ''}
                    {@const isInvalid =
                      Boolean(tagVal) &&
                      !isLexiconValueValid(tagVal, tier.lexicon)}
                    <td class="col-tag">
                      {#if tagVal}
                        <span
                          class="tag-pill {isInvalid ? 'is-invalid' : ''}"
                          title={isInvalid
                            ? `"${tagVal}" is not in allowed tags for ${tier.name}`
                            : tagVal}
                        >
                          {tagVal}
                        </span>
                      {:else}
                        <span class="tag-empty" title="Untagged">&mdash;</span>
                      {/if}
                    </td>
                  {/each}

                  <td class="col-freq">
                    <span class="freq-num">{row.frequency}</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="wordlist-footer-stats">
          <span>
            <strong>{extraction.uniqueFormsCount}</strong> unique word{extraction.uniqueFormsCount ===
            1
              ? ''
              : 's'}
          </span>
          <span>&bull;</span>
          <span>
            <strong>{extraction.totalTokensCount}</strong> total token{extraction.totalTokensCount ===
            1
              ? ''
              : 's'}
          </span>
          {#if selectedShownCount > 0}
            <span>&bull;</span>
            <span class="selected-stat">{selectedShownCount} selected</span>
          {/if}
        </div>
      {/if}
    {/if}
  </div>

  <!-- Bottom Footer Actions (Export to TSV & Add to Lexicon) -->
  <div class="side-panel-footer">
    {#if feedbackMessage}
      <div class="feedback-banner {feedbackType}">
        <i
          class="fa-solid {feedbackType === 'success'
            ? 'fa-circle-check'
            : feedbackType === 'error'
              ? 'fa-circle-exclamation'
              : 'fa-circle-info'}"
        ></i>
        <span>{feedbackMessage}</span>
      </div>
    {/if}

    {#if showLexiconExport}
      <div class="lexicon-sync-card">
        <div class="lexicon-sync-header">
          <span class="lexicon-sync-title">
            <i class="fa-solid fa-book-bookmark"></i>
            Add {selectedShownCount > 0
              ? `${selectedShownCount} selected`
              : `all ${sortedRows.length} shown`} row{rowsForLexiconImport.length ===
            1
              ? ''
              : 's'} to Lexicon
          </span>
          <button
            type="button"
            class="btn-close-mini"
            onclick={() => (showLexiconExport = false)}
            title="Hide lexicon import options"
            aria-label="Close lexicon box"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="lexicon-sync-row">
          <label for="wtl-target-lexicon" class="sync-label">Lexicon:</label>
          <select
            id="wtl-target-lexicon"
            class="sync-select"
            bind:value={targetLexiconId}
          >
            {#each lexiconState.lexicons || [] as lex (lex.id)}
              <option value={lex.id}>
                {lex.title || 'Untitled Lexicon'}{lex.id === projectLexiconId
                  ? ' (Active)'
                  : ''} ({lex.entries?.length || 0})
              </option>
            {/each}
            <option value="__new__">+ Create New Lexicon…</option>
          </select>
        </div>

        {#if targetLexiconId === '__new__'}
          <div class="lexicon-sync-row">
            <label for="wtl-new-lex-title" class="sync-label">Title:</label>
            <input
              id="wtl-new-lex-title"
              type="text"
              class="sync-input"
              placeholder="New lexicon title..."
              bind:value={newLexiconTitle}
            />
          </div>
        {/if}

        {#if activeWordTiers.length > 0}
          <div class="lexicon-mapping-list">
            {#each activeWordTiers as tier (tier.id)}
              <div class="lexicon-sync-row">
                <span class="sync-label" title={tier.name}
                  >{tier.name} &rarr;</span
                >
                <select
                  class="sync-select"
                  bind:value={tierFieldMap[String(tier.id)]}
                  aria-label="Map {tier.name} to lexicon field"
                >
                  {#if targetLexiconId !== '__new__'}
                    {#each targetLexiconNonHeadwordFields as field (field.id)}
                      <option value={field.id}>{field.name}</option>
                    {/each}
                  {/if}
                  <option value="__create__">
                    {targetLexiconId === '__new__'
                      ? `Field "${tier.name}"`
                      : `+ New field "${tier.name}"`}
                  </option>
                  <option value="">(Don't import)</option>
                </select>
              </div>
            {/each}
          </div>
        {/if}

        <div class="lexicon-sync-footer">
          <span class="sync-hint">Token maps to <strong>Headword</strong></span>
          <button
            type="button"
            class="btn-sync-submit"
            disabled={isSavingLexicon || rowsForLexiconImport.length === 0}
            onclick={handleImportToLexicon}
          >
            <i
              class="fa-solid {isSavingLexicon
                ? 'fa-spinner fa-spin'
                : 'fa-plus'}"
            ></i>
            <span>Confirm Add</span>
          </button>
        </div>
      </div>
    {/if}

    <div class="footer-action-buttons">
      <button
        type="button"
        class="btn-panel-tool btn-footer-action"
        onclick={handleExportTsv}
        disabled={sortedRows.length === 0}
        title="Export current table to TSV (.tsv)"
      >
        <i class="fa-solid fa-file-arrow-down"></i>
        <span>Export to TSV</span>
      </button>

      <button
        type="button"
        class="btn-panel-tool btn-footer-action {showLexiconExport
          ? 'is-active'
          : ''}"
        onclick={() => (showLexiconExport = !showLexiconExport)}
        disabled={extraction.rows.length === 0}
        title="Add selected or filtered words & tags to a Lexicon"
      >
        <i class="fa-solid fa-book-medical"></i>
        <span>Add to Lexicon</span>
      </button>
    </div>
  </div>
</div>

<style>
  .word-tag-list-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
    overflow: hidden;
    font-size: 0.85rem;
  }

  .side-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 8px 10px;
    min-height: 44px;
    box-sizing: border-box;
    background: var(--bg-card, #ffffff);
    border-bottom: 1px solid var(--border-color, #cbd5e1);
    flex-shrink: 0;
  }

  .side-panel-title {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    font-size: 0.85rem;
    min-width: 0;
    white-space: nowrap;
  }

  .side-panel-title i {
    color: #0284c7;
  }

  :global([data-theme='dark']) .side-panel-title i {
    color: #38bdf8;
  }

  .badge-count-pill {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 9999px;
    background: rgba(2, 132, 199, 0.12);
    color: #0284c7;
  }

  :global([data-theme='dark']) .badge-count-pill {
    background: rgba(56, 189, 248, 0.18);
    color: #7dd3fc;
  }

  .side-panel-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .btn-panel-tool {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 7px;
    border-radius: 5px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .btn-panel-tool:hover:not(:disabled) {
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  .btn-panel-tool.is-active {
    background: rgba(2, 132, 199, 0.1);
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  .btn-panel-tool:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .panel-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.14s ease;
  }

  .panel-close-btn:hover {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 8px 10px;
    gap: 7px;
  }

  /* Add-to-Lexicon Collapsible Card */
  .lexicon-sync-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    background: var(--bg-card, #ffffff);
    border: 1px solid rgba(2, 132, 199, 0.35);
    border-radius: 6px;
    flex-shrink: 0;
  }

  .lexicon-sync-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .lexicon-sync-title {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--primary-color, #0284c7);
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .btn-close-mini {
    border: none;
    background: transparent;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    padding: 2px 4px;
    font-size: 0.75rem;
  }

  .lexicon-mapping-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 2px;
    border-top: 1px dashed var(--border-color, #e2e8f0);
  }

  .lexicon-sync-row {
    display: grid;
    grid-template-columns: 82px minmax(0, 1fr);
    align-items: center;
    gap: 6px;
  }

  .sync-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sync-select,
  .sync-input {
    width: 100%;
    min-width: 0;
    height: 26px;
    padding: 2px 6px;
    font-size: 0.74rem;
    border-radius: 4px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    box-sizing: border-box;
  }

  .lexicon-sync-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 2px;
  }

  .sync-hint {
    font-size: 0.69rem;
    color: var(--text-muted, #64748b);
  }

  .btn-sync-submit {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 5px;
    border: none;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.14s ease;
  }

  .btn-sync-submit:hover:not(:disabled) {
    opacity: 0.92;
  }

  .btn-sync-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Feedback Banner */
  .feedback-banner {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .feedback-banner.success {
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .feedback-banner.info {
    background: #eff6ff;
    color: #1e40af;
    border: 1px solid #bfdbfe;
  }

  .feedback-banner.warning {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fde68a;
  }

  .feedback-banner.error {
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }

  /* Empty State */
  .wordlist-empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px 16px;
    gap: 8px;
  }

  .empty-icon-wrap {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
    background: rgba(2, 132, 199, 0.1);
    color: #0284c7;
  }

  .empty-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .empty-desc {
    margin: 0;
    font-size: 0.78rem;
    color: var(--text-muted, #64748b);
    max-width: 270px;
    line-height: 1.45;
  }

  /* Search & Normalization Toolbar */
  .wordlist-toolbar {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  .search-input-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 8px;
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
    pointer-events: none;
  }

  .wordlist-search-input {
    width: 100%;
    height: 28px;
    padding: 2px 24px 2px 25px;
    border-radius: 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    font-size: 0.76rem;
    box-sizing: border-box;
  }

  .wordlist-search-input:focus {
    outline: none;
    border-color: var(--primary-color, #0284c7);
  }

  .btn-clear-search {
    position: absolute;
    right: 4px;
    border: none;
    background: transparent;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    padding: 2px 4px;
    font-size: 0.72rem;
  }

  .btn-norm-toggle {
    height: 28px;
    min-width: 30px;
    padding: 0 6px;
    border-radius: 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-muted, #64748b);
    font-size: 0.72rem;
    font-weight: 700;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.12s ease;
  }

  .btn-norm-toggle.is-active {
    background: rgba(2, 132, 199, 0.12);
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  /* Delimiter Groups */
  .delimiter-group-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .delim-label {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
  }

  .delim-pill {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-muted, #64748b);
    cursor: pointer;
  }

  .delim-pill.active {
    background: var(--primary-color, #0284c7);
    border-color: var(--primary-color, #0284c7);
    color: #ffffff;
  }

  /* Filter Tabs */
  .filter-tabs-row {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .category-filter-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .cat-tab {
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 0.72rem;
    font-weight: 600;
    border: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-card, #ffffff);
    color: var(--text-muted, #64748b);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.14s ease;
  }

  .cat-tab.has-warn:not(.active) {
    border-color: #fcd34d;
    color: #b45309;
    background: #fffbeb;
  }

  .cat-tab.active {
    background: var(--primary, #0284c7);
    border-color: var(--primary, #0284c7);
    color: #ffffff;
  }

  /* Occurrence Stepper */
  .occurrence-stepper-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    flex-shrink: 0;
  }

  .occ-info {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .occ-token {
    font-weight: 700;
    font-size: 0.75rem;
    color: var(--text-heading, #0f172a);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .occ-seg {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.69rem;
    color: var(--text-muted, #64748b);
    white-space: nowrap;
  }

  .occ-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .btn-occ-step {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    font-size: 0.66rem;
    cursor: pointer;
  }

  .btn-occ-step:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .occ-counter {
    font-size: 0.71rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    min-width: 34px;
    text-align: center;
  }

  .no-filter-matches {
    padding: 20px 12px;
    text-align: center;
    font-size: 0.78rem;
    color: var(--text-muted, #64748b);
  }

  /* Data Table */
  .wordlist-table-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    background: var(--bg-card, #ffffff);
  }

  .wordlist-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.76rem;
  }

  .wordlist-table thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--bg-hover, #f1f5f9);
    border-bottom: 1px solid var(--border-color, #cbd5e1);
    padding: 4px 6px;
    text-align: left;
    white-space: nowrap;
  }

  .col-check {
    width: 24px;
    text-align: center !important;
    padding-left: 6px !important;
    padding-right: 4px !important;
  }

  .col-check input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }

  .col-freq {
    width: 54px;
    text-align: right !important;
  }

  .th-sort-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: transparent;
    color: var(--text-muted, #475569);
    font-size: 0.69rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    padding: 2px 0;
    cursor: pointer;
  }

  .th-sort-btn.th-sort-right {
    margin-left: auto;
  }

  .th-sort-btn.active {
    color: var(--primary-color, #0284c7);
  }

  .th-tier-name {
    max-width: 85px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wordlist-row {
    border-bottom: 1px solid var(--border-color, #f1f5f9);
    cursor: pointer;
    transition: background-color 0.1s ease;
  }

  .wordlist-row:hover {
    background: var(--bg-hover, #f8fafc);
  }

  .wordlist-row.is-active {
    background: #eff6ff;
  }

  .wordlist-table tbody td {
    padding: 5px 6px;
    vertical-align: middle;
  }

  .token-cell-inner {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .token-text {
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    word-break: break-word;
  }

  .multitag-dot {
    font-size: 0.64rem;
    font-weight: 700;
    padding: 0 4px;
    border-radius: 4px;
    background: #fef3c7;
    color: #b45309;
    border: 1px solid #fde68a;
    flex-shrink: 0;
  }

  .lex-present-icon {
    font-size: 0.64rem;
    color: #10b981;
    opacity: 0.8;
    flex-shrink: 0;
  }

  .tag-pill {
    display: inline-block;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(148, 163, 184, 0.15);
    color: var(--text-base, #334155);
  }

  .tag-pill.is-invalid {
    background: #fee2e2;
    color: #dc2626;
    border: 1px solid #fca5a5;
  }

  .tag-empty {
    color: var(--text-muted, #cbd5e1);
    font-size: 0.72rem;
  }

  .freq-num {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--text-muted, #475569);
    font-variant-numeric: tabular-nums;
  }

  .wordlist-footer-stats {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.71rem;
    color: var(--text-muted, #64748b);
    padding-top: 1px;
    flex-shrink: 0;
  }

  .selected-stat {
    color: var(--primary-color, #0284c7);
    font-weight: 700;
  }

  .side-panel-footer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    background: var(--bg-card, #ffffff);
    border-top: 1px solid var(--border-color, #cbd5e1);
    flex-shrink: 0;
  }

  .footer-action-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .btn-footer-action {
    justify-content: center;
    height: 32px;
    font-size: 0.76rem;
    border-radius: 6px;
  }

  /* Dark Theme */
  :global([data-theme='dark']) .side-panel-footer {
    background: #1e293b;
    border-top-color: #334155;
  }
  :global([data-theme='dark']) .word-tag-list-panel {
    background: #0f172a;
    border-color: #334155;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  }

  :global([data-theme='dark']) .side-panel-header {
    background: #1e293b;
    border-color: #334155;
  }

  :global([data-theme='dark']) .side-panel-title {
    color: #f8fafc;
  }

  :global([data-theme='dark']) .btn-panel-tool {
    background: #0f172a;
    border-color: #475569;
    color: #e2e8f0;
  }

  :global([data-theme='dark']) .btn-panel-tool.is-active {
    background: rgba(56, 189, 248, 0.16);
    border-color: #38bdf8;
    color: #38bdf8;
  }

  :global([data-theme='dark']) .panel-close-btn {
    color: #94a3b8;
  }

  :global([data-theme='dark']) .panel-close-btn:hover {
    background: #334155;
    color: #f8fafc;
  }

  :global([data-theme='dark']) .lexicon-sync-card {
    background: #1e293b;
    border-color: rgba(56, 189, 248, 0.35);
  }

  :global([data-theme='dark']) .lexicon-sync-title {
    color: #38bdf8;
  }

  :global([data-theme='dark']) .lexicon-mapping-list {
    border-top-color: #334155;
  }

  :global([data-theme='dark']) .sync-select,
  :global([data-theme='dark']) .sync-input,
  :global([data-theme='dark']) .wordlist-search-input,
  :global([data-theme='dark']) .btn-norm-toggle,
  :global([data-theme='dark']) .delim-pill {
    background: #1e293b;
    border-color: #475569;
    color: #f1f5f9;
  }

  :global([data-theme='dark']) .btn-norm-toggle.is-active {
    background: rgba(56, 189, 248, 0.18);
    border-color: #38bdf8;
    color: #38bdf8;
  }

  :global([data-theme='dark']) .cat-tab {
    background: #1e293b;
    border-color: #334155;
    color: #94a3b8;
  }

  :global([data-theme='dark']) .cat-tab.has-warn:not(.active) {
    background: rgba(245, 158, 11, 0.14);
    border-color: rgba(245, 158, 11, 0.4);
    color: #fcd34d;
  }

  :global([data-theme='dark']) .cat-tab.active {
    background: #0284c7;
    border-color: #0284c7;
    color: #ffffff;
  }

  :global([data-theme='dark']) .occurrence-stepper-bar {
    background: #1e293b;
    border-color: #334155;
  }

  :global([data-theme='dark']) .occ-token {
    color: #f8fafc;
  }

  :global([data-theme='dark']) .btn-occ-step {
    background: #0f172a;
    border-color: #475569;
    color: #e2e8f0;
  }

  :global([data-theme='dark']) .wordlist-table-scroll {
    background: #1e293b;
    border-color: #334155;
  }

  :global([data-theme='dark']) .wordlist-table thead th {
    background: #0f172a;
    border-bottom-color: #334155;
  }

  :global([data-theme='dark']) .th-sort-btn {
    color: #94a3b8;
  }

  :global([data-theme='dark']) .th-sort-btn.active {
    color: #38bdf8;
  }

  :global([data-theme='dark']) .wordlist-row {
    border-bottom-color: rgba(51, 65, 85, 0.6);
  }

  :global([data-theme='dark']) .wordlist-row:hover {
    background: #263349;
  }

  :global([data-theme='dark']) .wordlist-row.is-active {
    background: rgba(56, 189, 248, 0.12);
  }

  :global([data-theme='dark']) .token-text {
    color: #f8fafc;
  }

  :global([data-theme='dark']) .multitag-dot {
    background: rgba(245, 158, 11, 0.2);
    border-color: rgba(245, 158, 11, 0.4);
    color: #fcd34d;
  }

  :global([data-theme='dark']) .tag-pill {
    background: rgba(148, 163, 184, 0.2);
    color: #e2e8f0;
  }

  :global([data-theme='dark']) .tag-pill.is-invalid {
    background: rgba(239, 68, 68, 0.22);
    border-color: rgba(239, 68, 68, 0.45);
    color: #fca5a5;
  }

  :global([data-theme='dark']) .freq-num {
    color: #cbd5e1;
  }

  :global([data-theme='dark']) .empty-title {
    color: #f8fafc;
  }
</style>
