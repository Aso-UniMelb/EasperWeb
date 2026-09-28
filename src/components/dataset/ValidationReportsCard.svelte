<script>
  import { datasetState } from '../../state/datasetState.svelte.js';
  import { isEafFile } from '../../utils/datasetAudioMatcher.js';
  import { formatMsPrecise as formatTimeMsPrecise } from '../../utils/formatters.js';

  // Active sort state for tables: { column: string, desc: boolean }
  let sortState = $state({ column: '', desc: false });

  // Clipboard feedback state: { [key: string]: boolean }
  let copiedFeedback = $state({});

  // Drag and drop state for reloading updated ELAN files
  let isDraggingEaf = $state(false);

  // Collapsible ELAN fix guide toggle state in inspector
  let showFixGuide = $state(false);

  function setSort(col) {
    if (sortState.column === col) {
      sortState.desc = !sortState.desc;
    } else {
      sortState.column = col;
      sortState.desc = false;
    }
  }

  function sortList(list, colExtractor, isNumeric = false) {
    if (!sortState.column) return list;
    const col = sortState.column;
    const desc = sortState.desc;

    return [...list].sort((a, b) => {
      let valA = colExtractor(a, col);
      let valB = colExtractor(b, col);

      if (isNumeric) {
        valA = parseFloat(String(valA).replace(/[^0-9.-]/g, '')) || 0;
        valB = parseFloat(String(valB).replace(/[^0-9.-]/g, '')) || 0;
        return desc ? valB - valA : valA - valB;
      }
      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
      return desc ? valB.localeCompare(valA) : valA.localeCompare(valB);
    });
  }

  // Issue counts
  let naCount = $derived(datasetState.validationResults.naRecords?.length || 0);
  let longCount = $derived(
    datasetState.validationResults.longRecords?.length || 0,
  );
  let overlapCount = $derived(
    datasetState.validationResults.overlapRecords?.length || 0,
  );
  let totalIssues = $derived(naCount + longCount + overlapCount);
  let noIssues = $derived(totalIssues === 0);

  // File filter mode: 'issues' | 'all'
  let fileFilterMode = $state('issues');

  // Currently selected file name
  let selectedFileName = $state('');

  // Group all issues by file
  let fileIssuesMap = $derived.by(() => {
    const map = new Map();

    // Collect all file names from eafFiles, selected tiers, and paired files
    const allNames = new Set(
      (datasetState.eafFiles || []).map((e) => e.file.name),
    );
    for (const name of Object.keys(datasetState.tierSelections || {})) {
      allNames.add(name);
    }
    for (const p of datasetState.pairedFiles || []) {
      if (p.eafFile?.name) allNames.add(p.eafFile.name);
    }

    for (const name of allNames) {
      map.set(name, {
        fileName: name,
        naRecords: [],
        longRecords: [],
        overlapRecords: [],
        totalIssues: 0,
      });
    }

    // Disallowed characters
    for (const r of datasetState.validationResults.naRecords || []) {
      if (!map.has(r.file)) {
        map.set(r.file, {
          fileName: r.file,
          naRecords: [],
          longRecords: [],
          overlapRecords: [],
          totalIssues: 0,
        });
      }
      const item = map.get(r.file);
      item.naRecords.push(r);
      item.totalIssues++;
    }

    // Long segments
    for (const r of datasetState.validationResults.longRecords || []) {
      if (!map.has(r.file)) {
        map.set(r.file, {
          fileName: r.file,
          naRecords: [],
          longRecords: [],
          overlapRecords: [],
          totalIssues: 0,
        });
      }
      const item = map.get(r.file);
      item.longRecords.push(r);
      item.totalIssues++;
    }

    // Speaker overlaps
    for (const r of datasetState.validationResults.overlapRecords || []) {
      if (!map.has(r.file)) {
        map.set(r.file, {
          fileName: r.file,
          naRecords: [],
          longRecords: [],
          overlapRecords: [],
          totalIssues: 0,
        });
      }
      const item = map.get(r.file);
      item.overlapRecords.push(r);
      item.totalIssues++;
    }

    return map;
  });

  // All files sorted alphabetically
  let allFilesList = $derived(
    Array.from(fileIssuesMap.values()).sort((a, b) =>
      a.fileName.localeCompare(b.fileName),
    ),
  );

  // Files with issues only
  let filesWithIssues = $derived(allFilesList.filter((f) => f.totalIssues > 0));

  // Visible files in the navigator based on filter mode
  let visibleFiles = $derived(
    fileFilterMode === 'issues'
      ? filesWithIssues.length > 0
        ? filesWithIssues
        : allFilesList
      : allFilesList,
  );

  // Keep selectedFileName valid and synced with visible files
  $effect(() => {
    const list = filesWithIssues.length > 0 ? filesWithIssues : allFilesList;
    if (list.length > 0) {
      if (!selectedFileName || !fileIssuesMap.has(selectedFileName)) {
        selectedFileName = list[0].fileName;
      }
    } else {
      selectedFileName = '';
    }
  });

  // Active file issue object
  let currentFileIssues = $derived(
    selectedFileName && fileIssuesMap.has(selectedFileName)
      ? fileIssuesMap.get(selectedFileName)
      : null,
  );

  // Active file issue counts
  let fileNaCount = $derived(currentFileIssues?.naRecords?.length || 0);
  let fileLongCount = $derived(currentFileIssues?.longRecords?.length || 0);
  let fileOverlapCount = $derived(
    currentFileIssues?.overlapRecords?.length || 0,
  );
  let fileTotalIssues = $derived(currentFileIssues?.totalIssues || 0);

  // When activeView has no issues for current file, auto-switch to first available issue tab
  $effect(() => {
    if (currentFileIssues && fileTotalIssues > 0) {
      if (
        datasetState.activeView === 'not allowed chars' &&
        fileNaCount === 0
      ) {
        if (fileLongCount > 0) datasetState.activeView = 'long segments';
        else if (fileOverlapCount > 0) datasetState.activeView = 'overlaps';
      } else if (
        datasetState.activeView === 'long segments' &&
        fileLongCount === 0
      ) {
        if (fileNaCount > 0) datasetState.activeView = 'not allowed chars';
        else if (fileOverlapCount > 0) datasetState.activeView = 'overlaps';
      } else if (
        datasetState.activeView === 'overlaps' &&
        fileOverlapCount === 0
      ) {
        if (fileNaCount > 0) datasetState.activeView = 'not allowed chars';
        else if (fileLongCount > 0) datasetState.activeView = 'long segments';
      }
    }
  });

  // Sync selected record for inspector when active file changes
  $effect(() => {
    if (selectedFileName) {
      // Disallowed chars
      if (currentFileIssues?.naRecords?.length > 0) {
        if (
          !currentFileIssues.naRecords.includes(datasetState.selectedNaRecord)
        ) {
          datasetState.selectedNaRecord = currentFileIssues.naRecords[0];
        }
      } else {
        datasetState.selectedNaRecord = null;
      }

      // Long segments
      if (currentFileIssues?.longRecords?.length > 0) {
        if (
          !currentFileIssues.longRecords.includes(
            datasetState.selectedLongRecord,
          )
        ) {
          datasetState.selectedLongRecord = currentFileIssues.longRecords[0];
        }
      } else {
        datasetState.selectedLongRecord = null;
      }

      // Overlaps
      if (currentFileIssues?.overlapRecords?.length > 0) {
        if (
          !currentFileIssues.overlapRecords.includes(
            datasetState.selectedOverlapRecord,
          )
        ) {
          datasetState.selectedOverlapRecord =
            currentFileIssues.overlapRecords[0];
        }
      } else {
        datasetState.selectedOverlapRecord = null;
      }
    }
  });

  // Navigation: Next / Prev File
  function goToPrevFile() {
    const list = visibleFiles;
    if (list.length === 0) return;
    const idx = list.findIndex((f) => f.fileName === selectedFileName);
    if (idx > 0) {
      selectedFileName = list[idx - 1].fileName;
    } else {
      selectedFileName = list[list.length - 1].fileName;
    }
  }

  function goToNextFile() {
    const list = visibleFiles;
    if (list.length === 0) return;
    const idx = list.findIndex((f) => f.fileName === selectedFileName);
    if (idx >= 0 && idx < list.length - 1) {
      selectedFileName = list[idx + 1].fileName;
    } else {
      selectedFileName = list[0].fileName;
    }
  }

  // Sorted Issue Records for the currently selected file
  let currentFileNaRecords = $derived(
    sortList(
      currentFileIssues?.naRecords || [],
      (r, c) => r[c],
      ['count'].includes(sortState.column),
    ),
  );

  let currentFileLongRecords = $derived(
    sortList(
      currentFileIssues?.longRecords || [],
      (r, c) => (c === 'dur' ? parseFloat(r.dur) : r[c]),
      ['dur', 'startMs', 'endMs'].includes(sortState.column),
    ),
  );

  let currentFileOverlapRecords = $derived(
    sortList(
      currentFileIssues?.overlapRecords || [],
      (r, c) => (c === 'dur' ? parseFloat(r.dur) : r[c]),
      ['dur', 'overlapStartMs', 'overlapEndMs'].includes(sortState.column),
    ),
  );

  // Clipboard copy with feedback
  async function copyToClipboard(text, key) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copiedFeedback[key] = true;
      setTimeout(() => {
        copiedFeedback[key] = false;
      }, 1800);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  }

  // Re-run validation on all chosen files without prompting for files
  function handleRevalidateClick() {
    datasetState.revalidate();
  }

  // Drag and Drop for updated .eaf files
  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    isDraggingEaf = true;
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    isDraggingEaf = false;
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    isDraggingEaf = false;

    const files = [];
    if (e.dataTransfer.items) {
      const items = Array.from(e.dataTransfer.items);
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && isEafFile(file)) files.push(file);
        }
      }
    } else if (e.dataTransfer.files) {
      files.push(...Array.from(e.dataTransfer.files).filter(isEafFile));
    }

    if (files.length > 0) {
      await datasetState.reloadMultipleEafs(files);
    }
  }

  function exportIssues() {
    let tsv = 'Type\tFile\tTier\tTimecode_or_Glyph\tDetail\tSample_or_Text\n';
    for (const r of datasetState.validationResults.naRecords || []) {
      tsv += `Disallowed_Char\t${r.file}\t${r.tiers}\t${r.char} (${r.hex})\tCount: ${r.count}\t${r.sample}\n`;
    }
    for (const r of datasetState.validationResults.longRecords || []) {
      tsv += `Long_Segment\t${r.file}\t${r.tier}\t${r.start}-${r.end}\tDuration: ${r.dur}\t${r.fullText}\n`;
    }
    for (const r of datasetState.validationResults.overlapRecords || []) {
      tsv += `Speaker_Overlap\t${r.file}\t${r.tier1} vs ${r.tier2}\t${r.overlapStart}\tOverlap: ${r.dur}\t[${r.tier1}: ${r.text1}] vs [${r.tier2}: ${r.text2}]\n`;
    }
    const blob = new Blob([tsv], {
      type: 'text/tab-separated-values;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dataset_issues.tsv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

</script>

{#if !datasetState.hasChecked}
  <!-- Empty State Card -->
  <div class="card empty-reports-card">
    <div class="empty-icon-box icon-purple">
      <i class="fa-solid fa-triangle-exclamation"></i>
    </div>
    <h3 class="empty-title">Step 4: Issues</h3>
    <p class="empty-desc">
      Scan your selected tiers for orthographic issues (disallowed characters),
      long speech segments (&gt;25s), and speaker overlaps (&gt;400ms) to
      resolve before exporting your dataset.
    </p>
    <div class="empty-actions-row">
      <button
        type="button"
        class="btn-step-prev"
        onclick={() => datasetState.setTab('characters')}
      >
        <i class="fa-solid fa-arrow-left"></i>
        <span>Back to Character Inventory</span>
      </button>
      <button
        type="button"
        class="btn-check-primary"
        disabled={datasetState.isChecking || !datasetState.hasAnyTierSelected()}
        onclick={() => datasetState.startChecking()}
      >
        {#if datasetState.isChecking}
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>Validating Tiers...</span>
        {:else}
          <i class="fa-solid fa-circle-check"></i>
          <span>Validate Selected Tiers</span>
        {/if}
      </button>
      <button
        type="button"
        class="btn-step-next"
        onclick={() => datasetState.setTab('replacements')}
      >
        <span>Skip to Step 5: Clean &amp; Replace</span>
        <i class="fa-solid fa-arrow-right"></i>
      </button>
    </div>
  </div>
{:else}
  <!-- Main Step 4 Card with Drop Zone Support -->
  <div
    class="card dataset-reports-card {isDraggingEaf ? 'drop-active' : ''}"
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    role="region"
    aria-label="Issues workspace"
  >
    <!-- Top Action & Re-validation Header Bar -->
    <div class="card-header-bar">
      <div class="header-left">
        <div class="title-with-badge">
          <h3 class="reports-card-title">
            <i class="fa-solid fa-triangle-exclamation section-icon"></i>
            4. Issues
          </h3>
          {#if totalIssues > 0}
            <span class="status-pill status-warn">
              <i class="fa-solid fa-triangle-exclamation"></i>
              {totalIssues} Issue{totalIssues === 1 ? '' : 's'} to Fix in ELAN
            </span>
          {:else}
            <span class="status-pill status-clean">
              <i class="fa-solid fa-circle-check"></i>
              All Tiers Clean
            </span>
          {/if}
        </div>
        <p class="header-subtitle">
          Pinpoint annotations to correct in ELAN, then click Re-validate.
        </p>
      </div>

      <!-- Action Toolbar with Export & Re-validate -->
      <div class="header-toolbar">
        {#if totalIssues > 0}
          <button
            type="button"
            class="btn-toolbar-action btn-export-issues-header"
            onclick={exportIssues}
            title="Export list of issues as TSV"
          >
            <i class="fa-solid fa-file-arrow-down"></i>
            <span>Export Issues</span>
          </button>
        {/if}

        <button
          type="button"
          class="btn-toolbar-action btn-revalidate"
          disabled={datasetState.isChecking}
          onclick={handleRevalidateClick}
          title="Re-check all chosen files and tiers for issues"
        >
          <i
            class="fa-solid fa-arrows-rotate {datasetState.isChecking
              ? 'fa-spin'
              : ''}"
          ></i>
          <span
            >{datasetState.isChecking
              ? 'Re-validating...'
              : 'Re-validate'}</span
          >
        </button>
      </div>
    </div>

    <!-- Reload Feedback Toast -->
    {#if datasetState.lastReloadNotice}
      <div
        class="notice-banner {datasetState.lastReloadNotice.type === 'error'
          ? 'notice-error'
          : 'notice-success'}"
      >
        <i
          class="fa-solid {datasetState.lastReloadNotice.type === 'error'
            ? 'fa-circle-xmark'
            : 'fa-circle-check'}"
        ></i>
        <span>{datasetState.lastReloadNotice.message}</span>
        <button
          type="button"
          class="btn-close-notice"
          aria-label="Dismiss notice"
          onclick={() => (datasetState.lastReloadNotice = null)}
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    {/if}

    <!-- Issues Workspace -->
    <div class="section-container issues-section">
      {#if noIssues}
        <!-- Celebratory Clean State -->
        <div class="all-clean-box">
          <div class="clean-icon-wrap">
            <i class="fa-solid fa-circle-check"></i>
          </div>
          <h4 class="clean-title">No Issues Found in Selected Tiers!</h4>
          <p class="clean-desc">
            All characters match your allowed language orthography, speech
            segments are within recommended duration limits (&le;{datasetState.longSegmentThreshold ||
              25}s), and no speaker overlaps were detected.
          </p>
          <div class="clean-actions">
            <button
              type="button"
              class="btn-clean-action btn-go-export"
              onclick={() => datasetState.setTab('replacements')}
            >
              <span>Proceed to Step 5: Clean &amp; Replace</span>
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      {:else}
        <!-- File Navigator Bar -->
        <div class="file-navigator-bar">
          <div class="file-stepper-group">
            <button
              type="button"
              class="btn-file-step"
              onclick={goToPrevFile}
              title="Previous file"
              aria-label="Previous file"
              disabled={visibleFiles.length <= 1}
            >
              <i class="fa-solid fa-chevron-left"></i>
            </button>

            <div class="file-picker-wrapper">
              <i class="fa-regular fa-file-code file-icon"></i>
              <select
                class="file-picker-select"
                bind:value={selectedFileName}
                aria-label="Select file to inspect"
              >
                {#each visibleFiles as f}
                  <option value={f.fileName}>
                    {f.fileName} ({f.totalIssues > 0
                      ? `${f.totalIssues} issue${f.totalIssues > 1 ? 's' : ''}`
                      : 'Clean'})
                  </option>
                {/each}
              </select>
            </div>

            <button
              type="button"
              class="btn-file-step"
              onclick={goToNextFile}
              title="Next file"
              aria-label="Next file"
              disabled={visibleFiles.length <= 1}
            >
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>

          <div class="file-nav-right">
            <div class="file-filter-pills">
              <button
                type="button"
                class="filter-pill {fileFilterMode === 'issues'
                  ? 'active'
                  : ''}"
                onclick={() => (fileFilterMode = 'issues')}
                title="Show only files with issues"
              >
                <span>With Issues</span>
                <span class="pill-count">{filesWithIssues.length}</span>
              </button>
              <button
                type="button"
                class="filter-pill {fileFilterMode === 'all' ? 'active' : ''}"
                onclick={() => (fileFilterMode = 'all')}
                title="Show all files"
              >
                <span>All Files</span>
                <span class="pill-count">{allFilesList.length}</span>
              </button>
            </div>

            {#if fileTotalIssues > 0}
              <div class="file-status-badge badge-issues">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span
                  >{fileTotalIssues} issue{fileTotalIssues > 1 ? 's' : ''} in this
                  file</span
                >
              </div>
            {:else}
              <div class="file-status-badge badge-clean">
                <i class="fa-solid fa-circle-check"></i>
                <span>Clean</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Quick File Chips Row -->
        {#if visibleFiles.length > 1}
          <div class="file-chips-scroll" role="tablist" aria-label="Files list">
            {#each visibleFiles as f}
              <button
                type="button"
                role="tab"
                aria-selected={selectedFileName === f.fileName}
                class="file-chip {selectedFileName === f.fileName
                  ? 'active'
                  : ''} {f.totalIssues > 0 ? 'has-issues' : 'is-clean'}"
                onclick={() => (selectedFileName = f.fileName)}
                title="{f.fileName}: {f.totalIssues > 0
                  ? `${f.totalIssues} issue(s)`
                  : 'Clean'}"
              >
                <i class="fa-regular fa-file-lines chip-file-icon"></i>
                <span class="chip-name">{f.fileName}</span>
                {#if f.totalIssues > 0}
                  <span class="chip-badge">{f.totalIssues}</span>
                {:else}
                  <i class="fa-solid fa-check chip-check"></i>
                {/if}
              </button>
            {/each}
          </div>
        {/if}

        {#if fileTotalIssues === 0}
          <div class="file-clean-banner">
            <div class="file-clean-icon">
              <i class="fa-solid fa-circle-check"></i>
            </div>
            <div class="file-clean-text">
              <h5>{selectedFileName} is Clean!</h5>
              <p>
                No disallowed characters, long segments, or overlaps were
                detected in the selected tiers of this file.
              </p>
            </div>
            {#if filesWithIssues.length > 0}
              <button
                type="button"
                class="btn-next-issue-file"
                onclick={goToNextFile}
              >
                <span>Go to Next File with Issues</span>
                <i class="fa-solid fa-arrow-right"></i>
              </button>
            {/if}
          </div>
        {:else}
          <!-- Sub-navigation Pills for Active File Issues -->
          <div class="issues-sub-nav">
            <div class="sub-nav-left">
              {#if fileNaCount > 0}
                <button
                  type="button"
                  class="issue-sub-btn {datasetState.activeView ===
                  'not allowed chars'
                    ? 'active'
                    : ''}"
                  onclick={() =>
                    (datasetState.activeView = 'not allowed chars')}
                >
                  <i class="fa-solid fa-font"></i>
                  <span>Disallowed Characters</span>
                  <span class="sub-badge">{fileNaCount}</span>
                </button>
              {/if}

              {#if fileLongCount > 0}
                <button
                  type="button"
                  class="issue-sub-btn {datasetState.activeView ===
                  'long segments'
                    ? 'active'
                    : ''}"
                  onclick={() => (datasetState.activeView = 'long segments')}
                >
                  <i class="fa-solid fa-clock"></i>
                  <span
                    >Long Segments (&gt;{datasetState.longSegmentThreshold ||
                      25}s)</span
                  >
                  <span class="sub-badge">{fileLongCount}</span>
                </button>
              {/if}

              {#if fileOverlapCount > 0}
                <button
                  type="button"
                  class="issue-sub-btn {datasetState.activeView === 'overlaps'
                    ? 'active'
                    : ''}"
                  onclick={() => (datasetState.activeView = 'overlaps')}
                >
                  <i class="fa-solid fa-users-between-lines"></i>
                  <span>Speaker Overlaps (&gt;400ms)</span>
                  <span class="sub-badge">{fileOverlapCount}</span>
                </button>
              {/if}
            </div>
          </div>

          <!-- SUB-VIEW: Disallowed Characters -->
          {#if datasetState.activeView === 'not allowed chars'}
            <div class="issue-content-layout">
              <div class="table-container">
                <table class="dataset-table">
                  <thead>
                    <tr>
                      <th onclick={() => setSort('char')} class="col-center"
                        >Char</th
                      >
                      <th onclick={() => setSort('hex')} class="col-center"
                        >Unicode</th
                      >
                      <th onclick={() => setSort('count')} class="col-center"
                        >Count</th
                      >
                      <th onclick={() => setSort('tiers')}>Tier(s)</th>
                      <th>Sample Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each currentFileNaRecords as r}
                      <tr
                        class={datasetState.selectedNaRecord === r
                          ? 'selected-row'
                          : ''}
                        onclick={() => (datasetState.selectedNaRecord = r)}
                      >
                        <td class="col-center font-bold char-glyph">{r.char}</td
                        >
                        <td class="col-center font-mono text-muted">{r.hex}</td>
                        <td class="col-center font-semibold">{r.count}</td>
                        <td>{r.tiers}</td>
                        <td class="text-sample-cell" title={r.sample}>
                          <span class="table-sample-snippet">"{r.sample}"</span>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>

              <!-- Disallowed Inspector -->
              <div class="inspector-card">
                <div class="inspector-header">
                  <div class="inspector-title">
                    <i class="fa-solid fa-magnifying-glass-arrow-right"></i>
                    <span>Issue Inspector</span>
                  </div>
                  {#if datasetState.selectedNaRecord}
                    <button
                      type="button"
                      class="btn-inspector-action btn-toggle-fix {showFixGuide
                        ? 'active'
                        : ''}"
                      onclick={() => (showFixGuide = !showFixGuide)}
                      title="Toggle ELAN correction instructions"
                    >
                      <i class="fa-regular fa-circle-question"></i>
                      <span>How to Fix in ELAN</span>
                      <i
                        class="fa-solid {showFixGuide
                          ? 'fa-chevron-up'
                          : 'fa-chevron-down'} chevron-icon"
                      ></i>
                    </button>
                  {/if}
                </div>

                {#if showFixGuide && datasetState.selectedNaRecord}
                  <div class="fix-guide-collapsible">
                    <div class="fix-guide-title">
                      <i class="fa-solid fa-lightbulb"></i>
                      <span>How to Fix in ELAN:</span>
                    </div>
                    <p class="fix-guide-text">
                      Open <strong class="file-highlight"
                        >{selectedFileName}</strong
                      >
                      in ELAN, press <kbd>Ctrl</kbd> + <kbd>F</kbd>
                      (Find) and search for the disallowed character
                      <strong class="char-highlight"
                        >{datasetState.selectedNaRecord.char}</strong
                      >
                      ({datasetState.selectedNaRecord.hex}). Correct any
                      orthographic typos.
                    </p>
                    <p class="fix-guide-text text-secondary">
                      If this character is legitimate in your language, click <strong
                        >+ Allow Character</strong
                      > below to whitelist it immediately.
                    </p>
                    <div class="fix-guide-footer">
                      <i class="fa-solid fa-circle-info"></i>
                      <span
                        >After saving changes in ELAN (<kbd>Ctrl</kbd> +
                        <kbd>S</kbd>), click <strong>Re-validate</strong> at the
                        top.</span
                      >
                    </div>
                  </div>
                {/if}

                {#if datasetState.selectedNaRecord}
                  <div class="inspector-body">
                    <div class="inspector-char-preview">
                      <span class="preview-large-glyph"
                        >{datasetState.selectedNaRecord.char}</span
                      >
                      <div class="preview-char-meta">
                        <strong class="font-mono"
                          >{datasetState.selectedNaRecord.hex}</strong
                        >
                        <span class="meta-sub">
                          {datasetState.selectedNaRecord.count} occurrence(s) in
                          tier: {datasetState.selectedNaRecord.tiers}
                        </span>
                        <span class="meta-sub file-tag">
                          <i class="fa-regular fa-file-lines"></i>
                          {selectedFileName}
                        </span>
                      </div>
                    </div>

                    <div class="inspector-field">
                      <span class="field-label">Sample Context:</span>
                      <div class="sample-box">
                        "{datasetState.selectedNaRecord.sample}"
                      </div>
                    </div>

                    <div class="inspector-actions-row">
                      <button
                        type="button"
                        class="btn-action-copy"
                        onclick={() =>
                          copyToClipboard(
                            datasetState.selectedNaRecord.char,
                            'na_char',
                          )}
                        title="Copy character to paste in ELAN Find dialog"
                      >
                        <i
                          class="fa-solid {copiedFeedback['na_char']
                            ? 'fa-check text-success'
                            : 'fa-copy'}"
                        ></i>
                        <span
                          >{copiedFeedback['na_char']
                            ? 'Copied!'
                            : 'Copy Char (for Ctrl+F)'}</span
                        >
                      </button>

                      <button
                        type="button"
                        class="btn-action-copy"
                        onclick={() =>
                          copyToClipboard(
                            datasetState.selectedNaRecord.sample,
                            'na_sample',
                          )}
                      >
                        <i
                          class="fa-solid {copiedFeedback['na_sample']
                            ? 'fa-check text-success'
                            : 'fa-copy'}"
                        ></i>
                        <span
                          >{copiedFeedback['na_sample']
                            ? 'Copied!'
                            : 'Copy Sample'}</span
                        >
                      </button>

                      <button
                        type="button"
                        class="btn-action-allow"
                        onclick={() =>
                          datasetState.allowDisallowedCharacter(
                            datasetState.selectedNaRecord.char,
                          )}
                        title="Add this character to allowed inventory and re-validate immediately"
                      >
                        <i class="fa-solid fa-plus-check"></i>
                        <span>Allow Character</span>
                      </button>
                    </div>
                  </div>
                {:else}
                  <div class="inspector-empty">
                    <i class="fa-regular fa-hand-pointer"></i>
                    <p>
                      Click any row on the left to inspect and copy shortcuts
                    </p>
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- SUB-VIEW: Long Segments -->
          {#if datasetState.activeView === 'long segments'}
            <div class="issue-content-layout">
              <div class="table-container">
                <table class="dataset-table">
                  <thead>
                    <tr>
                      <th onclick={() => setSort('tier')}>Tier</th>
                      <th onclick={() => setSort('start')} class="col-center"
                        >Start</th
                      >
                      <th onclick={() => setSort('end')} class="col-center"
                        >End</th
                      >
                      <th onclick={() => setSort('dur')} class="col-center"
                        >Duration</th
                      >
                      <th>Text Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each currentFileLongRecords as r}
                      <tr
                        class={datasetState.selectedLongRecord === r
                          ? 'selected-row'
                          : ''}
                        onclick={() => (datasetState.selectedLongRecord = r)}
                      >
                        <td>{r.tier}</td>
                        <td class="col-center font-mono">{r.start}</td>
                        <td class="col-center font-mono">{r.end}</td>
                        <td class="col-center font-bold text-danger">{r.dur}</td
                        >
                        <td class="text-sample-cell" title={r.fullText}>
                          <span class="table-sample-snippet"
                            >"{r.fullText}"</span
                          >
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>

              <!-- Long Segment Inspector -->
              <div class="inspector-card">
                <div class="inspector-header">
                  <div class="inspector-title">
                    <i class="fa-solid fa-clock"></i>
                    <span>Long Segment Inspector</span>
                  </div>
                  {#if datasetState.selectedLongRecord}
                    <button
                      type="button"
                      class="btn-inspector-action btn-toggle-fix {showFixGuide
                        ? 'active'
                        : ''}"
                      onclick={() => (showFixGuide = !showFixGuide)}
                      title="Toggle ELAN correction instructions"
                    >
                      <i class="fa-regular fa-circle-question"></i>
                      <span>How to Fix in ELAN</span>
                      <i
                        class="fa-solid {showFixGuide
                          ? 'fa-chevron-up'
                          : 'fa-chevron-down'} chevron-icon"
                      ></i>
                    </button>
                  {/if}
                </div>

                {#if showFixGuide && datasetState.selectedLongRecord}
                  {@const startPrecise = formatTimeMsPrecise(
                    datasetState.selectedLongRecord.startMs,
                  )}
                  <div class="fix-guide-collapsible">
                    <div class="fix-guide-title">
                      <i class="fa-solid fa-lightbulb"></i>
                      <span>How to Fix in ELAN:</span>
                    </div>
                    <p class="fix-guide-text">
                      ASR models degrade on long utterances (&gt;25s). Open <strong
                        class="file-highlight">{selectedFileName}</strong
                      >
                      in ELAN, press <kbd>Ctrl</kbd> + <kbd>G</kbd> (Go to
                      time), and jump to start timecode
                      <strong>{startPrecise}</strong>.
                    </p>
                    <p class="fix-guide-text text-secondary">
                      Split the annotation at natural breath pauses into shorter
                      segments (&le;20s).
                    </p>
                    <div class="fix-guide-footer">
                      <i class="fa-solid fa-circle-info"></i>
                      <span
                        >After saving changes in ELAN (<kbd>Ctrl</kbd> +
                        <kbd>S</kbd>), click <strong>Re-validate</strong> at the
                        top.</span
                      >
                    </div>
                  </div>
                {/if}

                {#if datasetState.selectedLongRecord}
                  {@const timecodeStr = `${formatTimeMsPrecise(datasetState.selectedLongRecord.startMs)} - ${formatTimeMsPrecise(datasetState.selectedLongRecord.endMs)}`}
                  {@const startPrecise = formatTimeMsPrecise(
                    datasetState.selectedLongRecord.startMs,
                  )}
                  <div class="inspector-body">
                    <div class="inspector-meta-row">
                      <div class="meta-item">
                        <span class="item-label">File:</span>
                        <strong class="item-value">{selectedFileName}</strong>
                      </div>
                      <div class="meta-item">
                        <span class="item-label">Tier:</span>
                        <strong class="item-value"
                          >[{datasetState.selectedLongRecord.tier}]</strong
                        >
                      </div>
                      <div class="meta-item">
                        <span class="item-label">Duration:</span>
                        <strong class="item-value text-danger"
                          >{datasetState.selectedLongRecord.dur}</strong
                        >
                      </div>
                    </div>

                    <div class="inspector-field">
                      <span class="field-label">Timecode:</span>
                      <div class="timecode-display font-mono">
                        <span class="tc-range">{timecodeStr}</span>
                        <span class="tc-hint"
                          >(Threshold: &gt;{datasetState.longSegmentThreshold ||
                            25}s)</span
                        >
                      </div>
                    </div>

                    <div class="inspector-field">
                      <span class="field-label">Full Transcript Text:</span>
                      <div class="sample-box text-box">
                        "{datasetState.selectedLongRecord.fullText}"
                      </div>
                    </div>

                    <div class="inspector-actions-row">
                      <button
                        type="button"
                        class="btn-action-copy"
                        onclick={() =>
                          copyToClipboard(startPrecise, 'long_start')}
                        title="Copy start timecode for ELAN Ctrl+G"
                      >
                        <i
                          class="fa-solid {copiedFeedback['long_start']
                            ? 'fa-check text-success'
                            : 'fa-copy'}"
                        ></i>
                        <span
                          >{copiedFeedback['long_start']
                            ? 'Copied Start!'
                            : 'Copy Start (for Ctrl+G)'}</span
                        >
                      </button>

                      <button
                        type="button"
                        class="btn-action-copy"
                        onclick={() =>
                          copyToClipboard(
                            datasetState.selectedLongRecord.fullText,
                            'long_txt',
                          )}
                      >
                        <i
                          class="fa-solid {copiedFeedback['long_txt']
                            ? 'fa-check text-success'
                            : 'fa-copy'}"
                        ></i>
                        <span
                          >{copiedFeedback['long_txt']
                            ? 'Copied!'
                            : 'Copy Text'}</span
                        >
                      </button>
                    </div>
                  </div>
                {:else}
                  <div class="inspector-empty">
                    <i class="fa-regular fa-hand-pointer"></i>
                    <p>Click any long segment on the left to view timecodes</p>
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- SUB-VIEW: Overlaps -->
          {#if datasetState.activeView === 'overlaps'}
            <div class="issue-content-layout">
              <div class="table-container">
                <table class="dataset-table">
                  <thead>
                    <tr>
                      <th onclick={() => setSort('tier1')}>Tier 1</th>
                      <th onclick={() => setSort('time1')} class="col-center"
                        >Time 1</th
                      >
                      <th onclick={() => setSort('tier2')}>Tier 2</th>
                      <th onclick={() => setSort('time2')} class="col-center"
                        >Time 2</th
                      >
                      <th onclick={() => setSort('dur')} class="col-center"
                        >Overlap</th
                      >
                    </tr>
                  </thead>
                  <tbody>
                    {#each currentFileOverlapRecords as r}
                      <tr
                        class={datasetState.selectedOverlapRecord === r
                          ? 'selected-row'
                          : ''}
                        onclick={() => (datasetState.selectedOverlapRecord = r)}
                      >
                        <td>{r.tier1}</td>
                        <td class="col-center font-mono">{r.time1}</td>
                        <td>{r.tier2}</td>
                        <td class="col-center font-mono">{r.time2}</td>
                        <td class="col-center font-bold text-danger">{r.dur}</td
                        >
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>

              <!-- Overlaps Inspector -->
              <div class="inspector-card">
                <div class="inspector-header">
                  <div class="inspector-title">
                    <i class="fa-solid fa-users-between-lines"></i>
                    <span>Speaker Overlap Inspector</span>
                  </div>
                  {#if datasetState.selectedOverlapRecord}
                    <button
                      type="button"
                      class="btn-inspector-action btn-toggle-fix {showFixGuide
                        ? 'active'
                        : ''}"
                      onclick={() => (showFixGuide = !showFixGuide)}
                      title="Toggle ELAN correction instructions"
                    >
                      <i class="fa-regular fa-circle-question"></i>
                      <span>How to Fix in ELAN</span>
                      <i
                        class="fa-solid {showFixGuide
                          ? 'fa-chevron-up'
                          : 'fa-chevron-down'} chevron-icon"
                      ></i>
                    </button>
                  {/if}
                </div>

                {#if showFixGuide && datasetState.selectedOverlapRecord}
                  {@const overlapPrecise = formatTimeMsPrecise(
                    datasetState.selectedOverlapRecord.overlapStartMs,
                  )}
                  <div class="fix-guide-collapsible">
                    <div class="fix-guide-title">
                      <i class="fa-solid fa-lightbulb"></i>
                      <span>How to Fix in ELAN:</span>
                    </div>
                    <p class="fix-guide-text">
                      Overlapping speech introduces acoustic distortion. Open <strong
                        class="file-highlight">{selectedFileName}</strong
                      >
                      in ELAN, jump to overlap timecode
                      <strong>{overlapPrecise}</strong>
                      (<kbd>Ctrl</kbd> + <kbd>G</kbd>), and adjust annotation
                      boundaries on tiers
                      <strong>{datasetState.selectedOverlapRecord.tier1}</strong
                      >
                      and
                      <strong>{datasetState.selectedOverlapRecord.tier2}</strong
                      > so speakers do not collide.
                    </p>
                    <div class="fix-guide-footer">
                      <i class="fa-solid fa-circle-info"></i>
                      <span
                        >After saving changes in ELAN (<kbd>Ctrl</kbd> +
                        <kbd>S</kbd>), click <strong>Re-validate</strong> at the
                        top.</span
                      >
                    </div>
                  </div>
                {/if}

                {#if datasetState.selectedOverlapRecord}
                  {@const overlapPrecise = formatTimeMsPrecise(
                    datasetState.selectedOverlapRecord.overlapStartMs,
                  )}
                  <div class="inspector-body">
                    <div class="inspector-meta-row">
                      <div class="meta-item">
                        <span class="item-label">File:</span>
                        <strong class="item-value">{selectedFileName}</strong>
                      </div>
                      <div class="meta-item">
                        <span class="item-label">Overlap Duration:</span>
                        <strong class="item-value text-danger"
                          >{datasetState.selectedOverlapRecord.dur}</strong
                        >
                      </div>
                      <div class="meta-item">
                        <span class="item-label">Starts at:</span>
                        <strong class="item-value font-mono"
                          >{datasetState.selectedOverlapRecord
                            .overlapStart}</strong
                        >
                      </div>
                    </div>

                    <!-- Side-by-side comparison -->
                    <div class="overlap-comparison-box">
                      <div class="tier-box tier-box-1">
                        <div class="tier-header">
                          <span class="tier-tag tag-t1"
                            >[{datasetState.selectedOverlapRecord.tier1}]</span
                          >
                          <span class="tier-time"
                            >{datasetState.selectedOverlapRecord.time1}</span
                          >
                        </div>
                        <p class="tier-text">
                          "{datasetState.selectedOverlapRecord.text1}"
                        </p>
                      </div>

                      <div class="overlap-collision-divider">
                        <i class="fa-solid fa-arrow-down-up-across-line"></i>
                      </div>

                      <div class="tier-box tier-box-2">
                        <div class="tier-header">
                          <span class="tier-tag tag-t2"
                            >[{datasetState.selectedOverlapRecord.tier2}]</span
                          >
                          <span class="tier-time"
                            >{datasetState.selectedOverlapRecord.time2}</span
                          >
                        </div>
                        <p class="tier-text">
                          "{datasetState.selectedOverlapRecord.text2}"
                        </p>
                      </div>
                    </div>

                    <div class="inspector-actions-row">
                      <button
                        type="button"
                        class="btn-action-copy"
                        onclick={() =>
                          copyToClipboard(overlapPrecise, 'overlap_start')}
                        title="Copy exact overlap start time for ELAN Ctrl+G"
                      >
                        <i
                          class="fa-solid {copiedFeedback['overlap_start']
                            ? 'fa-check text-success'
                            : 'fa-copy'}"
                        ></i>
                        <span
                          >{copiedFeedback['overlap_start']
                            ? 'Copied Start!'
                            : 'Copy Overlap Time (for Ctrl+G)'}</span
                        >
                      </button>
                    </div>
                  </div>
                {:else}
                  <div class="inspector-empty">
                    <i class="fa-regular fa-hand-pointer"></i>
                    <p>Click any overlapping segment on the left to inspect</p>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        {/if}
      {/if}
    </div>

    <!-- Step Navigation Footer -->
    <div class="step-nav-footer">
      <button
        type="button"
        class="btn-step-prev"
        onclick={() => datasetState.setTab('characters')}
      >
        <i class="fa-solid fa-arrow-left"></i>
        <span>Back to Character Inventory</span>
      </button>

      <button
        type="button"
        class="btn-step-next {totalIssues > 0 ? 'btn-next-warn' : ''}"
        onclick={() => datasetState.setTab('replacements')}
      >
        {#if totalIssues > 0}
          <span
            >Proceed to Clean &amp; Replace with {totalIssues} Issue{totalIssues ===
            1
              ? ''
              : 's'}</span
          >
        {:else}
          <span>Proceed to Step 5: Clean &amp; Replace</span>
        {/if}
        <i class="fa-solid fa-arrow-right"></i>
      </button>
    </div>
  </div>
{/if}

<style>
  /* Empty state */
  .empty-reports-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    padding: 24px 16px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .empty-icon-box {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
  }

  .icon-purple {
    background: #fef3c7;
    color: #b45309;
  }

  .empty-title {
    font-size: 1.12rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    margin: 0;
  }

  .empty-desc {
    font-size: 0.84rem;
    color: var(--text-muted, #64748b);
    max-width: 580px;
    margin: 0;
    line-height: 1.45;
  }

  .empty-actions-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  /* Main Card */
  .dataset-reports-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    margin-bottom: 12px;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .dataset-reports-card.drop-active {
    border-color: #0284c7;
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
  }

  /* Card Header */
  .card-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .title-with-badge {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .reports-card-title {
    font-size: 1.12rem;
    font-weight: 800;
    margin: 0;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-icon {
    color: #b45309;
  }

  .header-subtitle {
    font-size: 0.82rem;
    color: var(--text-muted, #64748b);
    margin: 0;
    max-width: 680px;
    line-height: 1.4;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 16px;
  }

  .status-warn {
    background: #fef3c7;
    color: #b45309;
    border: 1px solid #fde68a;
  }

  .status-clean {
    background: #dcfce7;
    color: #15803d;
    border: 1px solid #bbf7d0;
  }

  /* Toolbar */
  .header-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .btn-toolbar-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
  }

  .btn-revalidate {
    background: #0284c7;
    color: white;
    box-shadow: 0 1px 2px rgba(2, 132, 199, 0.2);
  }

  .btn-revalidate:hover:not(:disabled) {
    background: #0369a1;
  }

  .btn-revalidate:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .btn-export-issues-header {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
  }

  .btn-export-issues-header:hover {
    background: #e2e8f0;
    color: var(--text-heading, #0f172a);
  }

  :global([data-theme='dark']) .btn-export-issues-header {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
  }

  :global([data-theme='dark']) .btn-export-issues-header:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  /* Notice Toast */
  .notice-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    margin-bottom: 10px;
    animation: fadeIn 0.2s ease;
  }

  .notice-success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  .notice-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
  }

  .btn-close-notice {
    margin-left: auto;
    background: none;
    border: none;
    color: currentColor;
    opacity: 0.6;
    cursor: pointer;
    padding: 2px;
  }

  .btn-close-notice:hover {
    opacity: 1;
  }

  /* Section Container */
  .section-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* All Clean Box */
  .all-clean-box {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 10px;
    padding: 20px 16px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .clean-icon-wrap {
    font-size: 2rem;
    color: #16a34a;
  }

  .clean-title {
    font-size: 1.12rem;
    font-weight: 800;
    color: #14532d;
    margin: 0;
  }

  .clean-desc {
    font-size: 0.84rem;
    color: #166534;
    max-width: 580px;
    margin: 0;
    line-height: 1.45;
  }

  .clean-actions {
    display: flex;
    gap: 10px;
    margin-top: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn-clean-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-go-export {
    background: #16a34a;
    border: none;
    color: white;
  }

  .btn-go-export:hover {
    background: #15803d;
  }

  /* File Navigator Bar */
  .file-navigator-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    flex-wrap: wrap;
  }

  :global([data-theme='dark']) .file-navigator-bar {
    background: rgba(255, 255, 255, 0.03);
  }

  .file-stepper-group {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 240px;
  }

  .btn-file-step {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.75rem;
  }

  .btn-file-step:hover:not(:disabled) {
    background: #e2e8f0;
    color: var(--text-heading, #0f172a);
  }

  .btn-file-step:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .file-picker-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    max-width: 440px;
  }

  :global([data-theme='dark']) .file-picker-select {
    background: var(--bg-card, #1e293b);
    color: var(--text-heading, #f8fafc);
    border-color: var(--border-color, #334155);
  }

  .file-picker-wrapper :global(.file-icon) {
    position: absolute;
    left: 8px;
    color: var(--text-muted, #64748b);
    pointer-events: none;
    font-size: 0.8rem;
  }

  .file-picker-select {
    width: 100%;
    padding: 4px 10px 4px 28px;
    border-radius: 4px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-heading, #0f172a);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .file-picker-select:focus {
    border-color: #0284c7;
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }

  .file-nav-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .file-filter-pills {
    display: inline-flex;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  :global([data-theme='dark']) .file-filter-pills {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--border-color, #334155);
  }

  .filter-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 7px;
    border-radius: 4px;
    border: none;
    background: transparent;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .filter-pill:hover {
    color: var(--text-heading, #0f172a);
  }

  .filter-pill.active {
    background: #0284c7;
    color: #ffffff;
  }

  .filter-pill.active .pill-count {
    background: rgba(255, 255, 255, 0.25);
    color: #ffffff;
  }

  .pill-count {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.07);
  }

  .file-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.74rem;
    font-weight: 600;
  }

  .file-status-badge.badge-issues {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #b91c1c;
  }

  .file-status-badge.badge-clean {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  :global([data-theme='dark']) .file-status-badge.badge-issues {
    background: rgba(185, 28, 28, 0.15);
    border-color: rgba(185, 28, 28, 0.35);
    color: #fca5a5;
  }

  :global([data-theme='dark']) .file-status-badge.badge-clean {
    background: rgba(22, 101, 52, 0.15);
    border-color: rgba(22, 101, 52, 0.35);
    color: #86efac;
  }

  /* Quick File Chips Scrollable Strip */
  .file-chips-scroll {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 2px 2px 6px 2px;
    scrollbar-width: thin;
  }

  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .file-chip:hover {
    border-color: #94a3b8;
    background: var(--bg-hover, #f8fafc);
  }

  .file-chip.active {
    border-color: #0284c7;
    background: #e0f2fe;
    color: #0369a1;
    font-weight: 600;
  }

  :global([data-theme='dark']) .file-chip {
    background: var(--bg-card, #1e293b);
    border-color: var(--border-color, #334155);
    color: var(--text-base, #cbd5e1);
  }

  :global([data-theme='dark']) .file-chip.active {
    background: rgba(2, 132, 199, 0.2);
    border-color: #38bdf8;
    color: #7dd3fc;
  }

  .chip-file-icon {
    font-size: 0.72rem;
    opacity: 0.7;
  }

  .chip-name {
    font-weight: 500;
  }

  .chip-badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 8px;
    background: #fee2e2;
    color: #b91c1c;
  }

  :global([data-theme='dark']) .chip-badge {
    background: rgba(185, 28, 28, 0.3);
    color: #fca5a5;
  }

  .chip-check {
    font-size: 0.68rem;
    color: #16a34a;
  }

  /* File Clean Banner */
  .file-clean-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    flex-wrap: wrap;
  }

  :global([data-theme='dark']) .file-clean-banner {
    background: rgba(22, 101, 52, 0.12);
    border-color: rgba(22, 101, 52, 0.3);
  }

  .file-clean-icon {
    font-size: 1.4rem;
    color: #16a34a;
  }

  .file-clean-text {
    flex: 1;
    min-width: 200px;
  }

  .file-clean-text h5 {
    font-size: 0.9rem;
    font-weight: 700;
    color: #14532d;
    margin: 0 0 2px 0;
  }

  :global([data-theme='dark']) .file-clean-text h5 {
    color: #86efac;
  }

  .file-clean-text p {
    font-size: 0.78rem;
    color: #166534;
    margin: 0;
  }

  :global([data-theme='dark']) .file-clean-text p {
    color: #bbf7d0;
  }

  .btn-next-issue-file {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid #bbf7d0;
    background: #ffffff;
    color: #15803d;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-next-issue-file:hover {
    background: #dcfce7;
  }

  :global([data-theme='dark']) .btn-next-issue-file {
    background: rgba(22, 101, 52, 0.25);
    border-color: rgba(22, 101, 52, 0.5);
    color: #86efac;
  }

  .text-sample-cell {
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .table-sample-snippet {
    color: var(--text-muted, #64748b);
    font-size: 0.76rem;
    font-style: italic;
  }

  .file-highlight {
    color: #0369a1;
    font-weight: 700;
  }

  :global([data-theme='dark']) .file-highlight {
    color: #38bdf8;
  }

  /* Sub Navs */
  .issues-sub-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .sub-nav-left {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .issue-sub-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 600;
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .issue-sub-btn:hover {
    background: #e2e8f0;
  }

  .issue-sub-btn.active {
    background: #fef3c7;
    border-color: #fde68a;
    color: #92400e;
  }

  .sub-badge {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.08);
  }

  /* Inspector Action: How to Fix in ELAN */
  .btn-toggle-fix {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: 5px;
    font-size: 0.76rem;
    font-weight: 600;
    background: #e0f2fe;
    border: 1px solid #bae6fd;
    color: #0369a1;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-toggle-fix:hover {
    background: #bae6fd;
    color: #0c4a6e;
  }

  .btn-toggle-fix.active {
    background: #0284c7;
    color: #ffffff;
    border-color: #0284c7;
  }

  .btn-toggle-fix.active .chevron-icon {
    color: #ffffff;
  }

  .btn-toggle-fix .chevron-icon {
    font-size: 0.65rem;
    margin-left: 2px;
  }

  :global([data-theme='dark']) .btn-toggle-fix {
    background: rgba(2, 132, 199, 0.2);
    border-color: rgba(2, 132, 199, 0.4);
    color: #7dd3fc;
  }

  :global([data-theme='dark']) .btn-toggle-fix:hover {
    background: rgba(2, 132, 199, 0.35);
    color: #bae6fd;
  }

  :global([data-theme='dark']) .btn-toggle-fix.active {
    background: #0284c7;
    color: #ffffff;
    border-color: #0284c7;
  }

  kbd {
    display: inline-block;
    padding: 1px 4px;
    font-size: 0.7rem;
    font-family: monospace;
    line-height: 1.2;
    color: #1e293b;
    background-color: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
  }

  /* Issue Content Layout */
  .issue-content-layout {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 10px;
    align-items: flex-start;
  }

  @media (max-width: 960px) {
    .issue-content-layout {
      grid-template-columns: 1fr;
    }
  }

  /* Inspector Card */
  .inspector-card {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    overflow: hidden;
  }

  :global([data-theme='dark']) .inspector-card {
    background: rgba(255, 255, 255, 0.02);
  }

  .inspector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    background: rgba(0, 0, 0, 0.02);
  }

  .inspector-title {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Collapsible Fix Guide Div */
  .fix-guide-collapsible {
    padding: 8px 10px;
    background: #f0f9ff;
    border-bottom: 1px solid #bae6fd;
    border-left: 3px solid #0284c7;
    animation: slideDown 0.18s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  :global([data-theme='dark']) .fix-guide-collapsible {
    background: rgba(2, 132, 199, 0.1);
    border-bottom-color: rgba(2, 132, 199, 0.25);
    border-left-color: #38bdf8;
  }

  .fix-guide-title {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.78rem;
    font-weight: 700;
    color: #0369a1;
    margin-bottom: 4px;
  }

  :global([data-theme='dark']) .fix-guide-title {
    color: #38bdf8;
  }

  .fix-guide-text {
    font-size: 0.76rem;
    color: var(--text-base, #334155);
    margin: 0 0 4px 0;
    line-height: 1.4;
  }

  .fix-guide-text.text-secondary {
    color: var(--text-muted, #64748b);
    font-size: 0.74rem;
  }

  .char-highlight {
    font-family: monospace;
    font-size: 0.9rem;
    background: #e0f2fe;
    padding: 1px 4px;
    border-radius: 3px;
    color: #0369a1;
  }

  :global([data-theme='dark']) .char-highlight {
    background: rgba(2, 132, 199, 0.25);
    color: #7dd3fc;
  }

  .fix-guide-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    color: #0369a1;
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid rgba(2, 132, 199, 0.15);
  }

  :global([data-theme='dark']) .fix-guide-footer {
    color: #7dd3fc;
    border-top-color: rgba(2, 132, 199, 0.2);
  }

  .inspector-body {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .inspector-empty {
    padding: 28px 12px;
    text-align: center;
    color: var(--text-muted, #94a3b8);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
  }

  .inspector-empty i {
    font-size: 1.3rem;
  }

  .inspector-char-preview {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-card, #ffffff);
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid var(--border-color, #e2e8f0);
  }

  .preview-large-glyph {
    font-size: 1.6rem;
    font-weight: 800;
    font-family: monospace;
    color: #dc2626;
  }

  .preview-char-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.76rem;
  }

  .meta-sub {
    color: var(--text-muted, #64748b);
  }

  .file-tag {
    color: var(--text-heading, #0f172a);
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .inspector-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .field-label {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .sample-box {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 5px;
    padding: 6px 8px;
    font-size: 0.8rem;
    color: var(--text-base, #1e293b);
    line-height: 1.4;
    word-break: break-word;
  }

  .text-box {
    max-height: 100px;
    overflow-y: auto;
  }

  .timecode-display {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 5px;
    padding: 4px 8px;
    font-size: 0.78rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .tc-hint {
    font-size: 0.7rem;
    color: #b45309;
  }

  .inspector-meta-row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    font-size: 0.76rem;
    flex-wrap: wrap;
  }

  .meta-item {
    display: flex;
    gap: 4px;
  }

  .overlap-comparison-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tier-box {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 5px;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tier-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.72rem;
  }

  .tier-tag {
    font-weight: 700;
  }

  .tag-t1 {
    color: #0284c7;
  }

  .tag-t2 {
    color: #7e22ce;
  }

  .tier-time {
    font-family: monospace;
    color: var(--text-muted, #64748b);
  }

  .tier-text {
    font-size: 0.78rem;
    margin: 0;
    color: var(--text-base, #1e293b);
  }

  .overlap-collision-divider {
    text-align: center;
    font-size: 0.82rem;
    color: #dc2626;
  }

  .inspector-actions-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .btn-action-copy,
  .btn-action-allow {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: 5px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-action-copy {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
  }

  .btn-action-copy:hover {
    background: #e2e8f0;
  }

  .btn-action-allow {
    background: #16a34a;
    border: 1px solid #15803d;
    color: white;
  }

  .btn-action-allow:hover {
    background: #15803d;
  }

  /* Table styling */
  .table-container {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    overflow-x: auto;
    max-height: 420px;
  }

  .dataset-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    text-align: left;
  }

  .dataset-table th {
    background: var(--bg-hover, #f8fafc);
    color: var(--text-muted, #475569);
    font-weight: 700;
    padding: 5px 8px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    user-select: none;
    cursor: pointer;
    white-space: nowrap;
    font-size: 0.76rem;
  }

  .dataset-table th:hover {
    color: var(--text-heading, #0f172a);
  }

  .dataset-table td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
    color: var(--text-base, #1e293b);
    font-size: 0.78rem;
  }

  .dataset-table tr {
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .dataset-table tbody tr:hover {
    background: rgba(2, 132, 199, 0.04);
  }

  .dataset-table tr.selected-row {
    background: rgba(2, 132, 199, 0.12) !important;
  }

  .col-center {
    text-align: center;
  }

  .char-glyph {
    font-size: 1.05rem;
    font-family: monospace;
  }

  .text-danger {
    color: #dc2626;
  }

  .text-success {
    color: #16a34a;
  }

  /* Step Navigation Footer */
  .step-nav-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    flex-wrap: wrap;
  }

  .btn-step-prev,
  .btn-step-next {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-step-prev {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
  }

  .btn-step-prev:hover {
    background: var(--bg-hover, #f1f5f9);
  }

  .btn-step-next {
    background: #16a34a;
    border: 1px solid #16a34a;
    color: white;
  }

  .btn-step-next:hover {
    background: #15803d;
  }

  .btn-next-warn {
    background: #b45309;
    border-color: #b45309;
  }

  .btn-next-warn:hover {
    background: #92400e;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
