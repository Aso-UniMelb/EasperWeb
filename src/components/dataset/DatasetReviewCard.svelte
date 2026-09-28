<script>
  import { datasetState } from '../../state/datasetState.svelte.js';
  import { formatTimeSec, formatDurationHms } from '../../utils/formatters.js';

  // Sub-tabs for reports inside Step 6 Review: Word Vocabulary, Characters, Bigrams, Dataset Assessment
  let activeReportTab = $state('words'); // 'words' | 'chars' | 'bigrams' | 'assessment'

  // Active sort state for tables: { column: string, desc: boolean }
  let sortState = $state({ column: '', desc: false });

  // Educational guide expand/collapse toggle
  let isEduGuideExpanded = $state(false);

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

  // Derived KPIs & Counts
  let kpi = $derived(datasetState.validationResults.kpiSummary || {});
  let totalIssues = $derived(
    (datasetState.validationResults.naRecords?.length || 0) +
      (datasetState.validationResults.longRecords?.length || 0) +
      (datasetState.validationResults.overlapRecords?.length || 0),
  );

  // Filtered & Sorted Assessment Records (Per-file evaluation, no summary row)
  let filteredAssessment = $derived.by(() => {
    const records = datasetState.validationResults.assessmentRecords || [];
    const q = datasetState.assessmentSearch.trim().toLowerCase();
    const filtered = records.filter(
      (r) =>
        !r.isSummary &&
        (!q ||
          r.file.toLowerCase().includes(q) ||
          (r.trainingRole && r.trainingRole.toLowerCase().includes(q))),
    );
    const numericCols = [
      'rank',
      'segments',
      'durationSec',
      'tokens',
      'types',
      'uniqueWords',
      'tyto',
      'toty',
      'trainingScore',
    ];
    return sortList(
      filtered,
      (r, c) => (c === 'duration' ? r.durationSec : r[c]),
      numericCols.includes(sortState.column),
    );
  });

  let filteredWords = $derived.by(() => {
    const records = datasetState.validationResults.wordRecords || [];
    const q = datasetState.wordSearch.trim().toLowerCase();
    const filtered = records.filter(
      (r) => !q || r.word.toLowerCase().includes(q),
    );
    const numericCols = ['rank', 'count', 'pct', 'len'];
    return sortList(
      filtered,
      (r, c) => r[c],
      numericCols.includes(sortState.column),
    );
  });

  let filteredChars = $derived.by(() => {
    const records = datasetState.validationResults.charRecords || [];
    const q = datasetState.charSearch.trim().toLowerCase();
    const filtered = records.filter(
      (r) =>
        !q ||
        r.char.toLowerCase().includes(q) ||
        r.hex.toLowerCase().includes(q),
    );
    const numericCols = ['rank', 'count', 'pct'];
    return sortList(
      filtered,
      (r, c) => r[c],
      numericCols.includes(sortState.column),
    );
  });

  let filteredBigrams = $derived.by(() => {
    const records = datasetState.validationResults.bigramRecords || [];
    const q = datasetState.bigramSearch.trim().toLowerCase();
    const filtered = records.filter(
      (r) =>
        !q ||
        r.bigram.toLowerCase().includes(q) ||
        r.hex.toLowerCase().includes(q),
    );
    const numericCols = ['rank', 'count', 'pct'];
    return sortList(
      filtered,
      (r, c) => r[c],
      numericCols.includes(sortState.column),
    );
  });

  // Export functions
  function exportFile(
    content,
    filename,
    mimeType = 'text/tab-separated-values;charset=utf-8;',
  ) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportAssessment() {
    const records = (
      datasetState.validationResults.assessmentRecords || []
    ).filter((r) => !r.isSummary);
    let tsv =
      'Rank\tFile\tTraining_Role\tSegments\tTotal_Duration_Sec\tDuration_Share_Pct\tTokens\tToken_Share_Pct\tTypes\tUnique_Words\tTyTo_Ratio\tNormalised_ToTy\tRole_Reason\n';
    for (const r of records) {
      tsv += `${r.rank}\t${r.file}\t${r.trainingRole || ''}\t${r.segments}\t${r.durationSec.toFixed(2)}\t${r.durationShare || ''}\t${r.tokens}\t${r.tokenShare || ''}\t${r.types}\t${r.uniqueWords || 0}\t${r.tyto}\t${r.toty}\t${r.trainingReason || ''}\n`;
    }
    exportFile(tsv, 'dataset_assessment.tsv');
  }

  function exportWords() {
    const records = datasetState.validationResults.wordRecords || [];
    let tsv = 'Rank\tWord\tCount\tPercentage\tLength\n';
    for (const r of records) {
      tsv += `${r.rank}\t${r.word}\t${r.count}\t${r.pct}\t${r.len}\n`;
    }
    exportFile(tsv, 'word_frequencies.tsv');
  }

  function exportChars() {
    const records = datasetState.validationResults.charRecords || [];
    let tsv = 'Rank\tCharacter\tUnicode\tCount\tPercentage\n';
    for (const r of records) {
      tsv += `${r.rank}\t${r.char}\t${r.hex}\t${r.count}\t${r.pct}\n`;
    }
    exportFile(tsv, 'character_frequencies.tsv');
  }

  function exportBigrams() {
    const records = datasetState.validationResults.bigramRecords || [];
    let tsv = 'Rank\tBigram\tCount\tPercentage\n';
    for (const r of records) {
      tsv += `${r.rank}\t${r.bigram}\t${r.count}\t${r.pct}\n`;
    }
    exportFile(tsv, 'bigram_frequencies.tsv');
  }
</script>

{#if datasetState.pairedFiles.length === 0}
  <div class="card empty-review-card">
    <div class="empty-icon-box icon-purple">
      <i class="fa-solid fa-chart-pie"></i>
    </div>
    <h3 class="empty-title">No Files Loaded</h3>
    <p class="empty-desc">
      Please load ELAN and audio files in Step 1 first before reviewing the
      dataset assessment and reports.
    </p>
    <button
      type="button"
      class="btn-step-prev"
      onclick={() => datasetState.setTab('ingest')}
    >
      <i class="fa-solid fa-arrow-left"></i>
      <span>Go to Step 1: Ingest Files</span>
    </button>
  </div>
{:else}
  <div class="card dataset-review-card">
    <div class="card-header-bar">
      <div class="header-left">
        <h3 class="review-card-title">
          <i class="fa-solid fa-chart-pie section-icon"></i>
          6. Review Dataset &amp; Assessment
        </h3>
        <p class="review-card-subtitle">
          Evaluate your corpus quality, lexical diversity, and vocabulary
          coverage before exporting the training package.
        </p>
      </div>
    </div>

    <!-- Warning banner if unaddressed issues remain in Step 4 -->
    {#if totalIssues > 0}
      <div class="issues-warning-banner">
        <div class="warning-icon-box">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div class="warning-content">
          <strong>{totalIssues} issue(s) remaining in Step 4: Issues</strong>
          <span>
            You can review the reports below, or return to Step 4 to correct
            issues in ELAN for optimal model performance.
          </span>
        </div>
        <button
          type="button"
          class="btn-review-issues"
          onclick={() => datasetState.setTab('reports')}
        >
          <i class="fa-solid fa-wrench"></i>
          <span>Fix Issues in Step 4</span>
        </button>
      </div>
    {/if}

    <div class="review-body">
      <!-- KPI Cards Summary -->
      <div class="assessment-kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">Total Audio Duration</span>
          <strong class="kpi-val text-primary"
            >{formatDurationHms(kpi.totalDurationMs / 1000)}</strong
          >
          <span class="kpi-sub">{kpi.totalSegments || 0} speech segments</span>
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Tokens</span>
          <strong class="kpi-val text-info"
            >{(kpi.totalTokens ?? kpi.totalWords ?? 0).toLocaleString()}</strong
          >
          <span class="kpi-sub">total words in selected tiers</span>
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Types</span>
          <strong class="kpi-val text-purple"
            >{(kpi.totalTypes ?? kpi.totalVocab ?? 0).toLocaleString()}</strong
          >
          <span class="kpi-sub">unique word forms</span>
        </div>
      </div>

      <!-- Normalization & Casing Status Bar -->
      <div class="stats-config-bar">
        <div class="config-item">
          <i class="fa-solid fa-font text-sky"></i>
          <span class="config-label">Casing:</span>
          {#if datasetState.lowercaseTranscripts || kpi.lowercaseTranscripts}
            <span
              class="config-tag tag-active"
              title="All transcripts converted to lowercase in Step 5"
            >
              <i class="fa-solid fa-check"></i> Lowercased (Case-Insensitive)
            </span>
          {:else}
            <span
              class="config-tag tag-muted"
              title="Original transcript casing is preserved; uppercase and lowercase are distinct types"
            >
              Preserved (Case-Sensitive)
            </span>
          {/if}
        </div>

        <div class="config-item">
          <i class="fa-solid fa-quote-right text-sky"></i>
          <span class="config-label">Word Delimiters:</span>
          <span
            class="config-tag tag-muted"
            title="Words are separated by whitespace and punctuation; punctuation is stripped from edges"
          >
            Whitespace &amp; Punctuation
          </span>
        </div>

        <div class="config-item">
          <i class="fa-solid fa-wand-magic-sparkles text-sky"></i>
          <span class="config-label">Step 5 Rules:</span>
          <span class="config-tag tag-muted">
            {datasetState.replacementRules.filter((r) => r.enabled).length} Active
            Rule{datasetState.replacementRules.filter((r) => r.enabled)
              .length === 1
              ? ''
              : 's'}
          </span>
        </div>
      </div>

      <!-- Sub-reports Navigation Tabs -->
      <div class="reports-sub-nav">
        <button
          type="button"
          class="report-sub-btn {activeReportTab === 'words' ? 'active' : ''}"
          onclick={() => (activeReportTab = 'words')}
        >
          <span>Word Vocabulary</span>
          <span class="sub-badge"
            >{datasetState.validationResults.wordRecords?.length || 0}</span
          >
        </button>

        <button
          type="button"
          class="report-sub-btn {activeReportTab === 'chars' ? 'active' : ''}"
          onclick={() => (activeReportTab = 'chars')}
        >
          <span>Characters</span>
          <span class="sub-badge"
            >{datasetState.validationResults.charRecords?.length || 0}</span
          >
        </button>

        <button
          type="button"
          class="report-sub-btn {activeReportTab === 'bigrams' ? 'active' : ''}"
          onclick={() => (activeReportTab = 'bigrams')}
        >
          <span>Bigrams</span>
          <span class="sub-badge"
            >{datasetState.validationResults.bigramRecords?.length || 0}</span
          >
        </button>

        <button
          type="button"
          class="report-sub-btn {activeReportTab === 'assessment'
            ? 'active'
            : ''}"
          onclick={() => (activeReportTab = 'assessment')}
        >
          <span>Dataset Assessment</span>
          <span class="sub-badge"
            >{datasetState.validationResults.assessmentRecords?.filter(
              (r) => !r.isSummary,
            ).length || 0}</span
          >
        </button>
      </div>

      <!-- 2. Word Vocabulary Sub-view -->
      {#if activeReportTab === 'words'}
        <div class="report-toolbar">
          <div class="toolbar-left-group">
            <div class="search-box">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input
                type="text"
                placeholder="Search words..."
                bind:value={datasetState.wordSearch}
              />
            </div>
            <span
              class="toolbar-mode-badge"
              title={datasetState.lowercaseTranscripts ||
              kpi.lowercaseTranscripts
                ? 'All words lowercased per Step 5'
                : 'Case-sensitive: original capitalization preserved'}
            >
              <i class="fa-solid fa-font"></i>
              {datasetState.lowercaseTranscripts || kpi.lowercaseTranscripts
                ? 'Lowercased'
                : 'Case-Sensitive'}
            </span>
          </div>
          <button type="button" class="btn-export-tsv" onclick={exportWords}>
            <i class="fa-solid fa-download"></i> Export
          </button>
        </div>

        <div class="table-container">
          <table class="dataset-table">
            <thead>
              <tr>
                <th onclick={() => setSort('rank')} class="col-center">Rank</th>
                <th onclick={() => setSort('word')}>Word</th>
                <th onclick={() => setSort('len')} class="col-center">Length</th
                >
                <th onclick={() => setSort('count')} class="col-center"
                  >Count</th
                >
                <th onclick={() => setSort('pct')} class="col-center"
                  >Percentage</th
                >
              </tr>
            </thead>
            <tbody>
              {#each filteredWords as r}
                <tr>
                  <td class="col-center font-bold">{r.rank}</td>
                  <td class="font-medium font-mono">{r.word}</td>
                  <td class="col-center">{r.len}</td>
                  <td class="col-center font-semibold">{r.count}</td>
                  <td class="col-center font-mono">{r.pct}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <!-- 3. Characters Sub-view -->
      {#if activeReportTab === 'chars'}
        <div class="report-toolbar">
          <div class="toolbar-left-group">
            <div class="search-box">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input
                type="text"
                placeholder="Search characters or hex..."
                bind:value={datasetState.charSearch}
              />
            </div>
            <span
              class="toolbar-mode-badge"
              title={datasetState.lowercaseTranscripts ||
              kpi.lowercaseTranscripts
                ? 'Characters evaluated from lowercased transcripts'
                : 'Characters evaluated with original casing'}
            >
              <i class="fa-solid fa-font"></i>
              {datasetState.lowercaseTranscripts || kpi.lowercaseTranscripts
                ? 'Lowercased'
                : 'Case-Sensitive'}
            </span>
          </div>
          <button type="button" class="btn-export-tsv" onclick={exportChars}>
            <i class="fa-solid fa-download"></i> Export
          </button>
        </div>

        <div class="table-container">
          <table class="dataset-table">
            <thead>
              <tr>
                <th onclick={() => setSort('rank')} class="col-center">Rank</th>
                <th onclick={() => setSort('char')} class="col-center"
                  >Character</th
                >
                <th onclick={() => setSort('hex')} class="col-center"
                  >Unicode</th
                >
                <th onclick={() => setSort('count')} class="col-center"
                  >Count</th
                >
                <th onclick={() => setSort('pct')} class="col-center"
                  >Percentage</th
                >
              </tr>
            </thead>
            <tbody>
              {#each filteredChars as r}
                <tr>
                  <td class="col-center font-bold">{r.rank}</td>
                  <td class="col-center font-bold char-glyph">{r.char}</td>
                  <td class="col-center font-mono text-muted">{r.hex}</td>
                  <td class="col-center font-semibold">{r.count}</td>
                  <td class="col-center font-mono">{r.pct}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <!-- 4. Bigrams Sub-view -->
      {#if activeReportTab === 'bigrams'}
        <div class="report-toolbar">
          <div class="toolbar-left-group">
            <div class="search-box">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input
                type="text"
                placeholder="Search bigrams..."
                bind:value={datasetState.bigramSearch}
              />
            </div>
            <span
              class="toolbar-mode-badge"
              title={datasetState.lowercaseTranscripts ||
              kpi.lowercaseTranscripts
                ? 'Bigrams evaluated from lowercased transcripts'
                : 'Bigrams evaluated with original casing'}
            >
              <i class="fa-solid fa-font"></i>
              {datasetState.lowercaseTranscripts || kpi.lowercaseTranscripts
                ? 'Lowercased'
                : 'Case-Sensitive'}
            </span>
          </div>
          <button type="button" class="btn-export-tsv" onclick={exportBigrams}>
            <i class="fa-solid fa-download"></i> Export
          </button>
        </div>

        <div class="table-container">
          <table class="dataset-table">
            <thead>
              <tr>
                <th onclick={() => setSort('rank')} class="col-center">Rank</th>
                <th onclick={() => setSort('bigram')} class="col-center"
                  >Bigram</th
                >
                <th onclick={() => setSort('count')} class="col-center"
                  >Count</th
                >
                <th onclick={() => setSort('pct')} class="col-center"
                  >Percentage</th
                >
              </tr>
            </thead>
            <tbody>
              {#each filteredBigrams as r}
                <tr>
                  <td class="col-center font-bold">{r.rank}</td>
                  <td class="col-center font-bold font-mono">{r.bigram}</td>
                  <td class="col-center font-semibold">{r.count}</td>
                  <td class="col-center font-mono">{r.pct}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <!-- 4. Dataset Assessment Sub-view (Final Tab After Bigrams) -->
      {#if activeReportTab === 'assessment'}
        <!-- Educational Guide Collapsible on Model Training Roles & Lexical Metrics -->
        <div class="edu-guide-collapsible">
          <button
            type="button"
            class="edu-guide-toggle"
            onclick={() => (isEduGuideExpanded = !isEduGuideExpanded)}
            aria-expanded={isEduGuideExpanded}
          >
            <div class="toggle-title">
              <i class="fa-solid fa-circle-question"></i>
              <span
                >Understanding Dataset Assessment &amp; Lexical Metrics (TyTo
                &amp; ToTy)</span
              >
            </div>
            <i
              class="fa-solid {isEduGuideExpanded
                ? 'fa-chevron-up'
                : 'fa-chevron-down'} chevron"
            ></i>
          </button>

          {#if isEduGuideExpanded}
            <div class="edu-guide-content">
              <p class="guide-intro">
                To get the best results when fine-tuning speech recognition
                models (like Whisper), you need datasets that include a wide
                variety of words and phrases, with multiple examples for each.
                This report analyzes how each recording contributes to acoustic
                duration, word tokens, and unique vocabulary to suggest its role
                in training.
              </p>

              <div class="roles-legend-grid">
                <!-- <div class="role-desc-card">
                  <div class="desc-header">
                    <span class="role-badge role-core">Core Training</span>
                  </div>
                  <p>
                    Recordings that provide the bulk of your audio hours and
                    utterance variety. Crucial for acoustic modeling.
                  </p>
                </div>

                <div class="role-desc-card">
                  <div class="desc-header">
                    <span class="role-badge role-vocab">Vocabulary Anchor</span>
                  </div>
                  <p>
                    Files rich in rare or unique words that expand the model's
                    lexical breadth and phonetic recognition.
                  </p>
                </div>

                <div class="role-desc-card">
                  <div class="desc-header">
                    <span class="role-badge role-eval"
                      >Evaluation Candidate</span
                    >
                  </div>
                  <p>
                    Short, highly representative recordings suitable for a
                    holdout evaluation test set to verify word error rate (WER).
                  </p>
                </div>

                <div class="role-desc-card">
                  <div class="desc-header">
                    <span class="role-badge role-balanced"
                      >Balanced Contributor</span
                    >
                  </div>
                  <p>
                    Well-rounded files with consistent segment durations and
                    solid lexical diversity for standard training.
                  </p>
                </div> -->

                <div class="role-desc-card">
                  <div class="desc-header">
                    <span class="role-badge role-diversity">TyTo Ratio</span>
                  </div>
                  <p>
                    Lexical diversity index: <code>Types / Tokens</code>. Higher
                    values indicate richer vocabulary and less word repetition.
                  </p>
                </div>

                <div class="role-desc-card">
                  <div class="desc-header">
                    <span class="role-badge role-speech">Normalised ToTy</span>
                  </div>
                  <p>
                    ToTy normalized by audio duration:
                    <code>Tokens / (Types &times; Seconds)</code>. Quantifies
                    speech repetition density over recording time.
                  </p>
                </div>
              </div>

              <div class="guide-rules-info">
                <span class="guide-info-title">
                  <i class="fa-solid fa-circle-info"></i> How Casing, Punctuation
                  &amp; Tokens Are Measured
                </span>
                <ul class="guide-info-list">
                  <li>
                    <strong>Tokens (Word Count):</strong> Total word instances in
                    selected speech tiers, delimited by whitespace and punctuation.
                    Surrounding punctuation is stripped from word boundaries.
                  </li>
                  <li>
                    <strong>Types (Vocabulary Size):</strong> Count of unique
                    word forms.
                    {#if datasetState.lowercaseTranscripts || kpi.lowercaseTranscripts}
                      <span class="badge-inline-active"
                        >Currently lowercased</span
                      >: Casing differences (e.g. <code>The</code> vs
                      <code>the</code>) are folded into a single type.
                    {:else}
                      <span class="badge-inline-muted"
                        >Currently case-sensitive</span
                      >: Different casings (e.g. <code>The</code> vs
                      <code>the</code>) are counted as separate types. To fold
                      them, enable <em>"Lowercase all texts"</em> in Step 5.
                    {/if}
                  </li>
                  <li>
                    <strong>Characters &amp; Bigrams:</strong> Computed from transcripts
                    after Step 5 cleaning rules (and lowercasing, if enabled).
                  </li>
                  <li>
                    <strong>TyTo &amp; ToTy:</strong> Lexical metrics reflect the
                    active casing setting above.
                  </li>
                </ul>
              </div>
            </div>
          {/if}
        </div>

        <div class="report-toolbar">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input
              type="text"
              placeholder="Search files or roles..."
              bind:value={datasetState.assessmentSearch}
            />
          </div>
          <button
            type="button"
            class="btn-export-tsv"
            onclick={exportAssessment}
          >
            <i class="fa-solid fa-download"></i> Export
          </button>
        </div>

        <div class="table-container">
          <table class="dataset-table">
            <thead>
              <tr>
                <th onclick={() => setSort('rank')} class="col-center">Rank</th>
                <th onclick={() => setSort('file')}>File</th>
                <!-- <th onclick={() => setSort('trainingRole')}>Training Impact</th> -->
                <th onclick={() => setSort('segments')} class="col-center"
                  >Segments</th
                >
                <th onclick={() => setSort('duration')} class="col-center"
                  >Audio Duration</th
                >
                <th onclick={() => setSort('tokens')} class="col-center"
                  >Words <br /> (Tokens)</th
                >
                <th onclick={() => setSort('types')} class="col-center"
                  >Words <br /> (Types)</th
                >
                <th
                  onclick={() => setSort('tyto')}
                  class="col-center"
                  title="TyTo Ratio (Types / Tokens)"
                >
                  TyTo <br /> Ratio
                </th>
                <th
                  onclick={() => setSort('toty')}
                  class="col-center"
                  title="Normalised ToTy Ratio: Tokens / (Types × Audio Length in sec)"
                >
                  Normalised <br /> ToTy
                </th>
              </tr>
            </thead>
            <tbody>
              {#each filteredAssessment as r}
                <tr>
                  <td class="col-center font-bold">{r.rank}</td>
                  <td class="font-medium">{r.file}</td>
                  <!-- <td>
                    {#if r.trainingRole}
                      <span
                        class="role-badge {r.trainingRole
                          .toLowerCase()
                          .includes('core')
                          ? 'role-core'
                          : r.trainingRole.toLowerCase().includes('vocab')
                            ? 'role-vocab'
                            : r.trainingRole.toLowerCase().includes('eval')
                              ? 'role-eval'
                              : 'role-balanced'}"
                        title={r.trainingReason || ''}
                      >
                        {r.trainingRole}
                      </span>
                    {:else}
                      <span class="text-muted">—</span>
                    {/if}
                  </td> -->
                  <td class="col-center">{r.segments}</td>
                  <td class="col-center font-mono">
                    {formatTimeSec(r.durationSec)}
                    {#if r.durationShare}
                      <span class="share-tag">({r.durationShare}%)</span>
                    {/if}
                  </td>
                  <td class="col-center font-semibold">
                    {r.tokens}
                    {#if r.tokenShare}
                      <span class="share-tag">({r.tokenShare}%)</span>
                    {/if}
                  </td>
                  <td class="col-center font-semibold text-purple"
                    >{r.types || 0}</td
                  >
                  <td
                    class="col-center font-mono font-semibold text-success"
                    title="TyTo Ratio (Types / Tokens)"
                  >
                    {r.tyto}
                  </td>
                  <td
                    class="col-center font-mono font-semibold text-primary"
                    title="Normalised ToTy Ratio: Tokens / (Types × Audio Duration in sec)"
                  >
                    {r.toty}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <!-- Step Navigation Footer -->
      <div class="step-nav-footer">
        <button
          type="button"
          class="btn-step-prev"
          onclick={() => datasetState.setTab('replacements')}
        >
          <i class="fa-solid fa-arrow-left"></i>
          <span>Back to Step 5: Clean &amp; Replace</span>
        </button>

        <button
          type="button"
          class="btn-step-next {totalIssues > 0 ? 'btn-next-warn' : ''}"
          onclick={() => datasetState.setTab('export')}
        >
          {#if totalIssues > 0}
            <span
              >Proceed to Export with {totalIssues} Issue{totalIssues === 1
                ? ''
                : 's'}</span
            >
          {:else}
            <span>Proceed to Step 7: Export Dataset</span>
          {/if}
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dataset-review-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    margin-bottom: 12px;
  }

  .card-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .review-card-title {
    font-size: 1.12rem;
    font-weight: 800;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 2px 0;
  }

  .section-icon {
    color: #0284c7;
  }

  .review-card-subtitle {
    font-size: 0.82rem;
    color: var(--text-muted, #64748b);
    margin: 0;
    line-height: 1.4;
  }

  /* Issues warning banner */
  .issues-warning-banner {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 6px;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .warning-icon-box {
    font-size: 1.15rem;
    color: #d97706;
    display: flex;
    align-items: center;
  }

  .warning-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 200px;
    font-size: 0.8rem;
  }

  .warning-content strong {
    color: #92400e;
  }

  .warning-content span {
    color: #b45309;
  }

  .btn-review-issues {
    background: #fef3c7;
    border: 1px solid #fde68a;
    color: #92400e;
    padding: 4px 10px;
    border-radius: 5px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: all 0.15s ease;
  }

  .btn-review-issues:hover {
    background: #fde68a;
  }

  .review-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Assessment KPIs */
  .assessment-kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 8px;
  }

  .kpi-card {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  :global([data-theme='dark']) .kpi-card {
    background: rgba(255, 255, 255, 0.02);
  }

  .kpi-label {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .kpi-val {
    font-size: 1.15rem;
    font-weight: 800;
  }

  .text-primary {
    color: #0284c7;
  }

  .text-info {
    color: #2563eb;
  }

  .text-purple {
    color: #7c3aed;
  }

  .text-success {
    color: #16a34a;
  }

  .kpi-sub {
    font-size: 0.72rem;
    color: var(--text-muted, #64748b);
  }

  /* Normalization & Casing Status Bar */
  .stats-config-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    padding: 6px 12px;
  }

  :global([data-theme='dark']) .stats-config-bar {
    background: rgba(255, 255, 255, 0.02);
  }

  .config-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
  }

  .text-sky {
    color: #0284c7;
  }

  .config-label {
    font-weight: 700;
    color: var(--text-muted, #64748b);
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .config-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.74rem;
    font-weight: 600;
  }

  .tag-active {
    background: rgba(2, 132, 199, 0.12);
    color: #0284c7;
    border: 1px solid rgba(2, 132, 199, 0.25);
  }

  .tag-muted {
    background: rgba(100, 116, 139, 0.1);
    color: var(--text-base, #475569);
    border: 1px solid var(--border-color, #cbd5e1);
  }

  /* Reports Sub-nav */
  .reports-sub-nav {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    padding-bottom: 6px;
  }

  .report-sub-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .report-sub-btn:hover {
    background: #e2e8f0;
  }

  .report-sub-btn.active {
    background: #0284c7;
    border-color: #0284c7;
    color: #ffffff;
  }

  .sub-badge {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.08);
  }

  .report-sub-btn.active .sub-badge {
    background: rgba(255, 255, 255, 0.25);
    color: #ffffff;
  }

  /* Report Toolbar */
  .report-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 5px;
    padding: 4px 8px;
    font-size: 0.78rem;
    min-width: 200px;
  }

  .search-box i {
    color: var(--text-muted, #94a3b8);
  }

  .search-box input {
    border: none;
    outline: none;
    background: transparent;
    font-size: 0.78rem;
    color: var(--text-base, #0f172a);
    width: 100%;
  }

  .toolbar-left-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .toolbar-mode-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    background: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-muted, #64748b);
  }

  :global([data-theme='dark']) .toolbar-mode-badge {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.1);
    color: #94a3b8;
  }

  .btn-export-tsv {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 5px;
    font-size: 0.76rem;
    font-weight: 600;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-export-tsv:hover {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
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

  .dataset-table tr:hover {
    background: rgba(2, 132, 199, 0.04);
  }

  .col-center {
    text-align: center;
  }

  .char-glyph {
    font-size: 1.05rem;
    font-family: monospace;
  }

  .share-tag {
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
    margin-left: 2px;
  }

  /* Educational Guide Collapsible */
  .edu-guide-collapsible {
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    background: var(--bg-hover, #f8fafc);
    margin-bottom: 8px;
    overflow: hidden;
  }

  .edu-guide-toggle {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-base, #334155);
    transition: background 0.15s ease;
  }

  .edu-guide-toggle:hover {
    background: rgba(0, 0, 0, 0.03);
  }

  :global([data-theme='dark']) .edu-guide-toggle:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .toggle-title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #0284c7;
  }

  .chevron {
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
  }

  .edu-guide-content {
    padding: 8px 12px 10px 12px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    font-size: 0.78rem;
    color: var(--text-base, #475569);
    line-height: 1.45;
  }

  .guide-intro {
    margin: 0 0 8px 0;
  }

  .roles-legend-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 8px;
  }

  .role-desc-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 5px;
    padding: 6px 8px;
  }

  :global([data-theme='dark']) .role-desc-card {
    background: rgba(255, 255, 255, 0.02);
  }

  .desc-header {
    display: flex;
    align-items: center;
    margin-bottom: 3px;
  }

  .role-badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .role-diversity {
    background: #dcfce7;
    color: #166534;
  }

  :global([data-theme='dark']) .role-diversity {
    background: rgba(22, 101, 52, 0.3);
    color: #86efac;
  }

  .role-speech {
    background: #e0f2fe;
    color: #0369a1;
  }

  :global([data-theme='dark']) .role-speech {
    background: rgba(3, 105, 161, 0.3);
    color: #7dd3fc;
  }

  .role-desc-card p {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--text-muted, #64748b);
  }

  .role-desc-card code {
    font-family: monospace;
    font-size: 0.74rem;
    background: var(--bg-hover, #f1f5f9);
    padding: 1px 4px;
    border-radius: 3px;
    color: var(--text-base, #334155);
  }

  :global([data-theme='dark']) .role-desc-card code {
    background: rgba(255, 255, 255, 0.06);
    color: #e2e8f0;
  }

  .guide-rules-info {
    margin-top: 10px;
    padding: 8px 12px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    font-size: 0.76rem;
  }

  :global([data-theme='dark']) .guide-rules-info {
    background: rgba(255, 255, 255, 0.02);
  }

  .guide-info-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    color: #0284c7;
    margin-bottom: 6px;
  }

  .guide-info-list {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text-muted, #64748b);
    line-height: 1.4;
  }

  .guide-info-list strong {
    color: var(--text-base, #334155);
  }

  :global([data-theme='dark']) .guide-info-list strong {
    color: #cbd5e1;
  }

  .guide-info-list code {
    font-family: monospace;
    font-size: 0.72rem;
    background: var(--bg-hover, #f1f5f9);
    padding: 1px 4px;
    border-radius: 3px;
    color: var(--text-base, #334155);
  }

  :global([data-theme='dark']) .guide-info-list code {
    background: rgba(255, 255, 255, 0.06);
    color: #e2e8f0;
  }

  .badge-inline-active {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(2, 132, 199, 0.12);
    color: #0284c7;
    font-weight: 700;
    font-size: 0.72rem;
  }

  .badge-inline-muted {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(217, 119, 6, 0.12);
    color: #b45309;
    font-weight: 700;
    font-size: 0.72rem;
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

  /* Empty State */
  .empty-review-card {
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
    background: #ede9fe;
    color: #7c3aed;
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
    max-width: 540px;
    margin: 0;
    line-height: 1.45;
  }
</style>
