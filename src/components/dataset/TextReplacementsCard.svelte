<script>
  import { datasetState } from '../../state/datasetState.svelte.js';

  let newFind = $state('');
  let newReplace = $state('');
  let newIsRegex = $state(false);

  let fileInputTsv = $state(null);
  let importSuccessNotice = $state('');
  let searchQuery = $state('');
  let selectedRuleId = $state(null);
  let previewSectionEl = $state(null);

  function toggleRulePreview(ruleId) {
    if (selectedRuleId === ruleId) {
      selectedRuleId = null;
    } else {
      selectedRuleId = ruleId;
      setTimeout(() => {
        if (previewSectionEl) {
          previewSectionEl.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }
      }, 50);
    }
  }

  let selectedRule = $derived(
    selectedRuleId
      ? datasetState.replacementRules.find((r) => r.id === selectedRuleId) ||
          null
      : null,
  );

  // Common transcription token presets
  const COMMON_PRESETS = [
    { find: '<hes>', desc: 'Hesitation marker' },
    { find: '<laughter>', desc: 'Laughter marker' },
    { find: '<cough>', desc: 'Cough marker' },
    { find: '<sigh>', desc: 'Sigh marker' },
    { find: '<gasp>', desc: 'Gasp marker' },
    { find: '[laughter]', desc: 'Bracket laughter' },
    { find: '[inaudible]', desc: 'Inaudible speech' },
    { find: '[music]', desc: 'Music / background' },
    { find: '*pause*', desc: 'Pause token' },
  ];

  // Scan current ELAN annotations for special tokens
  let detectedTokens = $derived(datasetState.getDetectedSpecialTokens());

  // Drag-and-drop reordering state
  let draggedRuleId = $state(null);
  let dragOverRuleId = $state(null);

  function handleDragStart(e, ruleId) {
    draggedRuleId = ruleId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ruleId);
  }

  function handleDragOver(e, ruleId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverRuleId !== ruleId) {
      dragOverRuleId = ruleId;
    }
  }

  function handleDrop(e, targetRuleId) {
    e.preventDefault();
    if (draggedRuleId && draggedRuleId !== targetRuleId) {
      const fromIdx = datasetState.replacementRules.findIndex(
        (r) => r.id === draggedRuleId,
      );
      const toIdx = datasetState.replacementRules.findIndex(
        (r) => r.id === targetRuleId,
      );
      if (fromIdx >= 0 && toIdx >= 0) {
        datasetState.moveRule(fromIdx, toIdx);
      }
    }
    draggedRuleId = null;
    dragOverRuleId = null;
  }

  function handleDragEnd() {
    draggedRuleId = null;
    dragOverRuleId = null;
  }

  // Get text after applying all enabled rules that precede targetRuleId in pipeline order
  function getTextBeforeRule(initialText, targetRuleId) {
    let text = initialText || '';
    for (const r of datasetState.replacementRules) {
      if (r.id === targetRuleId) break;
      if (r.enabled && r.find) {
        try {
          const pat = r.isRegex
            ? new RegExp(r.find, 'g')
            : new RegExp(escapeRegex(r.find), 'g');
          text = text.replace(pat, r.replace ?? '');
        } catch {}
      }
    }
    return text;
  }

  // Count occurrences of a specific pattern in loaded annotations (respecting pipeline order)
  function countMatchesInAnnotations(rule) {
    if (!rule.find) return 0;
    try {
      const pattern = rule.isRegex
        ? new RegExp(rule.find, 'g')
        : new RegExp(escapeRegex(rule.find), 'g');
      let count = 0;

      for (const pair of datasetState.pairedFiles) {
        const fileName = pair.eafFile.name;
        const fileTiers = datasetState.tierSelections[fileName] || {};
        if (pair.parsedEaf && pair.parsedEaf.tiers) {
          for (const tier of pair.parsedEaf.tiers) {
            if (fileTiers[tier.tierId]) {
              for (const ann of tier.annotations || []) {
                if (ann.text) {
                  const textBefore = getTextBeforeRule(ann.text, rule.id);
                  pattern.lastIndex = 0;
                  const matches = textBefore.match(pattern);
                  if (matches) {
                    count += matches.length;
                  }
                }
              }
            }
          }
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  function escapeRegex(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function handleAddRule() {
    const trimmed = newFind.trim();
    if (!trimmed) return;
    datasetState.addReplacementRule(trimmed, newReplace, newIsRegex);
    newFind = '';
    newReplace = '';
    newIsRegex = false;
  }

  function handleAddPreset(findToken) {
    const existing = datasetState.replacementRules.find(
      (r) => r.find.toLowerCase() === findToken.toLowerCase(),
    );
    if (existing) {
      if (!existing.enabled) {
        datasetState.toggleReplacementRule(existing.id);
      }
    } else {
      datasetState.addReplacementRule(findToken, '', false);
    }
  }

  function handleAddAllDetected() {
    for (const dt of detectedTokens) {
      const existing = datasetState.replacementRules.find(
        (r) => r.find.toLowerCase() === dt.token.toLowerCase(),
      );
      if (!existing) {
        datasetState.addReplacementRule(dt.token, '', false);
      } else if (!existing.enabled) {
        datasetState.toggleReplacementRule(existing.id);
      }
    }
  }

  async function handleImportTsvFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const count = datasetState.importRulesFromTsv(text);
      importSuccessNotice = `Imported ${count} new rules from "${file.name}"`;
      setTimeout(() => {
        importSuccessNotice = '';
      }, 4000);
    } catch (err) {
      alert(`Error reading TSV file: ${err.message || err}`);
    }
    e.target.value = '';
  }

  // Live Annotation Sample Preview:
  // If a specific rule is selected (via clicking its match badge), show ALL matching annotations for that transformation.
  // Otherwise, show up to 6 sample annotations across all active rules.
  let previewSamples = $derived.by(() => {
    if (selectedRule) {
      if (!selectedRule.find) return [];

      let pattern;
      try {
        pattern = selectedRule.isRegex
          ? new RegExp(selectedRule.find, 'g')
          : new RegExp(escapeRegex(selectedRule.find), 'g');
      } catch {
        return [];
      }

      const replacement = selectedRule.replace ?? '';
      const samples = [];

      for (const pair of datasetState.pairedFiles) {
        const fileName = pair.eafFile.name;
        const fileTiers = datasetState.tierSelections[fileName] || {};
        if (pair.parsedEaf && pair.parsedEaf.tiers) {
          for (const tier of pair.parsedEaf.tiers) {
            if (fileTiers[tier.tierId]) {
              for (const ann of tier.annotations || []) {
                if (ann.text) {
                  const textBefore = getTextBeforeRule(
                    ann.text,
                    selectedRule.id,
                  );
                  pattern.lastIndex = 0;
                  if (pattern.test(textBefore)) {
                    pattern.lastIndex = 0;
                    let cleaned = textBefore.replace(pattern, replacement);
                    pattern.lastIndex = 0;
                    if (datasetState.lowercaseTranscripts) {
                      cleaned = cleaned.toLowerCase();
                    }
                    samples.push({
                      original: textBefore,
                      cleaned: cleaned.trim(),
                      tierId: tier.tierId,
                      fileName,
                    });
                  }
                }
              }
            }
          }
        }
      }
      return samples;
    }

    const activeRules = datasetState.getNormalizationRulesData();
    if (activeRules.length === 0) return [];

    const compiled = activeRules.map((r) => ({
      pattern: new RegExp(r.rawPattern, 'g'),
      replacement: r.replacement,
    }));

    const samples = [];
    for (const pair of datasetState.pairedFiles) {
      const fileName = pair.eafFile.name;
      const fileTiers = datasetState.tierSelections[fileName] || {};
      if (pair.parsedEaf && pair.parsedEaf.tiers) {
        for (const tier of pair.parsedEaf.tiers) {
          if (fileTiers[tier.tierId]) {
            for (const ann of tier.annotations || []) {
              if (ann.text) {
                let cleaned = ann.text;
                let changed = false;
                for (const rule of compiled) {
                  if (rule.pattern.test(cleaned)) {
                    cleaned = cleaned.replace(rule.pattern, rule.replacement);
                    changed = true;
                  }
                }
                if (datasetState.lowercaseTranscripts) {
                  const lower = cleaned.toLowerCase();
                  if (lower !== cleaned) {
                    cleaned = lower;
                    changed = true;
                  }
                }
                if (changed && cleaned !== ann.text) {
                  samples.push({
                    original: ann.text,
                    cleaned: cleaned.trim(),
                    tierId: tier.tierId,
                    fileName,
                  });
                  if (samples.length >= 6) return samples;
                }
              }
            }
          }
        }
      }
    }
    return samples;
  });

  let totalActiveMatches = $derived.by(() => {
    let sum = 0;
    for (const r of datasetState.replacementRules) {
      if (r.enabled) {
        sum += countMatchesInAnnotations(r);
      }
    }
    return sum;
  });

  let filteredRules = $derived(
    datasetState.replacementRules.filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.find.toLowerCase().includes(q) ||
        (r.replace || '').toLowerCase().includes(q)
      );
    }),
  );

  function proceedToReview() {
    datasetState.startChecking();
    datasetState.setTab('review');
    datasetState.hasVisitedReplacements = true;
    datasetState.startChecking('review');
  }
</script>

<div class="card dataset-replacements-card">
  <!-- Card Header -->
  <div class="card-header-bar">
    <div class="header-left">
      <h3 class="replacements-card-title">
        <i class="fa-solid fa-wand-magic-sparkles section-icon"></i>
        5. Clean &amp; Replace Strings
      </h3>
      <p class="card-subtitle">
        Delete or replace special tokens, markup, and strings in ELAN
        annotations before exporting dataset. Rules are saved automatically for
        future sessions.
      </p>
    </div>

    <div class="header-actions-group">
      <button
        type="button"
        class="btn-action-outline"
        onclick={() => fileInputTsv?.click()}
        title="Import replacement rules from a .tsv or .txt file (columns: find \t replace \t isRegex)"
      >
        <i class="fa-solid fa-file-import"></i> Import .tsv
      </button>

      <button
        type="button"
        class="btn-action-outline"
        onclick={() => datasetState.exportRulesToTsv()}
        title="Export rules to a .tsv file with find, replace, and isRegex columns"
        disabled={datasetState.replacementRules.length === 0}
      >
        <i class="fa-solid fa-file-export"></i> Export .tsv
      </button>

      <button
        type="button"
        class="btn-action-outline btn-reset-rules"
        onclick={() => datasetState.resetDefaultRules()}
        title="Reset to default deletion rules (<hes>, <laughter>, etc.)"
      >
        <i class="fa-solid fa-arrow-rotate-left"></i> Defaults
      </button>
    </div>

    <input
      bind:this={fileInputTsv}
      type="file"
      accept=".tsv,.txt"
      class="hidden-file-input"
      onchange={handleImportTsvFile}
    />
  </div>

  {#if importSuccessNotice}
    <div class="notice-banner success-banner">
      <i class="fa-solid fa-circle-check"></i>
      <span>{importSuccessNotice}</span>
    </div>
  {/if}

  <!-- Text Casing & Normalization Options -->
  <div class="casing-option-card">
    <label class="casing-checkbox-label">
      <input
        type="checkbox"
        checked={datasetState.lowercaseTranscripts}
        onchange={(e) =>
          datasetState.setLowercaseTranscripts(e.currentTarget.checked)}
      />
      <div class="casing-info-col">
        <span class="casing-main-title"> Lowercase all texts </span>
        <span class="casing-subtitle">
          Convert all transcription annotations to lowercase before review and
          export. Improves ASR performance if transcriptions do not follow
          consistent capitalization.
        </span>
      </div>
    </label>
    {#if datasetState.lowercaseTranscripts}
      <span class="casing-status-tag">
        <i class="fa-solid fa-check"></i> Lowercasing Active
      </span>
    {/if}
  </div>

  <!-- Detected Special Tokens Scanner from Loaded ELAN Files -->
  {#if detectedTokens.length > 0}
    <section class="detected-tokens-panel">
      <div class="detected-header">
        <div class="detected-title">
          <i class="fa-solid fa-wand-magic-sparkles text-amber"></i>
          <span
            >Detected Special Tokens in Your ELAN Files ({detectedTokens.length})</span
          >
          <span class="detected-hint"
            >Found markup in speech annotations. Click to add as deletion rule:</span
          >
        </div>
        <button
          type="button"
          class="btn-quick-all"
          onclick={handleAddAllDetected}
          title="Add all detected tokens as deletion rules"
        >
          <i class="fa-solid fa-plus-double"></i> Delete All Detected
        </button>
      </div>

      <div class="tokens-chip-cloud">
        {#each detectedTokens as dt}
          {@const isAlreadyAdded = datasetState.replacementRules.some(
            (r) => r.find.toLowerCase() === dt.token.toLowerCase(),
          )}
          <button
            type="button"
            class="token-chip {isAlreadyAdded ? 'chip-active' : ''}"
            onclick={() => handleAddPreset(dt.token)}
            title={isAlreadyAdded
              ? `"${dt.token}" is already in your rules`
              : `Click to delete "${dt.token}" (${dt.count} occurrences)`}
          >
            {#if isAlreadyAdded}
              <i class="fa-solid fa-check text-success"></i>
            {:else}
              <i class="fa-solid fa-plus text-primary"></i>
            {/if}
            <code>{dt.token}</code>
            <span class="chip-count">{dt.count}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Quick Presets Cloud -->
  <div class="presets-row">
    <span class="presets-label">Quick Presets:</span>
    <div class="presets-pills">
      {#each COMMON_PRESETS as preset}
        {@const isAdded = datasetState.replacementRules.some(
          (r) => r.find.toLowerCase() === preset.find.toLowerCase(),
        )}
        <button
          type="button"
          class="preset-pill {isAdded ? 'preset-added' : ''}"
          onclick={() => handleAddPreset(preset.find)}
          title="{preset.desc} - Click to add"
        >
          {#if isAdded}
            <i class="fa-solid fa-check text-success"></i>
          {:else}
            <i class="fa-solid fa-plus"></i>
          {/if}
          <code>{preset.find}</code>
        </button>
      {/each}
    </div>
  </div>

  <!-- Add New Replacement Rule Form -->
  <section class="add-rule-card">
    <form
      class="add-rule-form"
      onsubmit={(e) => {
        e.preventDefault();
        handleAddRule();
      }}
    >
      <div class="form-field field-find">
        <label for="input-find-token">
          Find String / Token
          <span class="required-star">*</span>
        </label>
        <div class="input-with-icon">
          <input
            id="input-find-token"
            type="text"
            bind:value={newFind}
            placeholder="e.g. <hes> or <laughter> or &amp;"
            class="form-input"
            required
          />
        </div>
      </div>

      <div class="form-field field-arrow" aria-hidden="true">
        <i class="fa-solid fa-arrow-right-long"></i>
      </div>

      <div class="form-field field-replace">
        <label for="input-replace-token">
          Replace With
          <span class="sub-label">(leave empty to delete)</span>
        </label>
        <div class="input-with-icon">
          <input
            id="input-replace-token"
            type="text"
            bind:value={newReplace}
            placeholder="[Deleted when empty]"
            class="form-input"
          />
        </div>
      </div>

      <div class="form-field field-regex">
        <label
          class="checkbox-label"
          title="Treat Find pattern as a Regular Expression"
        >
          <input type="checkbox" bind:checked={newIsRegex} />
          <span>Regex</span>
        </label>
      </div>

      <div class="form-field field-submit">
        <button
          type="submit"
          class="btn-add-rule"
          disabled={!newFind.trim()}
          title="Add this replacement or deletion rule"
        >
          <i class="fa-solid fa-plus"></i>
          <span>Add Rule</span>
        </button>
      </div>
    </form>
  </section>

  <!-- Rules Table Header & Search Filter -->
  <div class="table-controls-bar">
    <div class="controls-left">
      <h3 class="rules-section-title">
        <i class="fa-solid fa-list-check"></i>
        Active Replacement &amp; Deletion Rules ({datasetState.replacementRules
          .length})
      </h3>
      <span
        class="pipeline-order-tag"
        title="Rules are executed sequentially top-to-bottom. You can reorder rules using drag & drop or the arrow buttons."
      >
        <i class="fa-solid fa-arrow-down-1-9"></i> Applied top-to-bottom in order
      </span>
      {#if totalActiveMatches > 0}
        <span class="active-matches-badge">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          {totalActiveMatches} total replacements in loaded files
        </span>
      {/if}
    </div>

    {#if datasetState.replacementRules.length > 5}
      <div class="rules-search-wrap">
        <i class="fa-solid fa-magnifying-glass search-icon"></i>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Filter rules..."
          class="rules-search-input"
        />
      </div>
    {/if}
  </div>

  <!-- Rules Table -->
  {#if filteredRules.length > 0}
    <div class="table-container">
      <table class="rules-table">
        <thead>
          <tr>
            <th class="th-order" title="Execution order sequence">#</th>
            <th class="th-status" title="Toggle rule on or off">Active</th>
            <th class="th-type">Mode</th>
            <th class="th-find">Find String / Token</th>
            <th class="th-arrow"></th>
            <th class="th-replace">Replace With</th>
            <th class="th-matches">Matches in Files</th>
            <th class="th-reorder" title="Change priority order">Order</th>
            <th class="th-actions">Action</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredRules as rule (rule.id)}
            {@const actualIndex = datasetState.replacementRules.findIndex(
              (r) => r.id === rule.id,
            )}
            {@const matches = countMatchesInAnnotations(rule)}
            <tr
              class="{!rule.enabled ? 'row-disabled' : ''} {draggedRuleId ===
              rule.id
                ? 'row-dragging'
                : ''} {dragOverRuleId === rule.id ? 'row-drag-over' : ''}"
              draggable="true"
              ondragstart={(e) => handleDragStart(e, rule.id)}
              ondragover={(e) => handleDragOver(e, rule.id)}
              ondrop={(e) => handleDrop(e, rule.id)}
              ondragend={handleDragEnd}
            >
              <td class="td-order">
                <div class="order-cell">
                  <span class="drag-grip" title="Drag row to reorder"
                    ><i class="fa-solid fa-grip-vertical"></i></span
                  >
                  <span
                    class="order-number"
                    title="Execution step #{actualIndex + 1}"
                    >#{actualIndex + 1}</span
                  >
                </div>
              </td>

              <td class="td-status">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onchange={() => datasetState.toggleReplacementRule(rule.id)}
                  title={rule.enabled ? 'Click to disable' : 'Click to enable'}
                />
              </td>

              <td class="td-type">
                <button
                  type="button"
                  class="badge-type-toggle {rule.isRegex
                    ? 'is-regex'
                    : 'is-text'}"
                  onclick={() =>
                    datasetState.updateReplacementRule(rule.id, {
                      isRegex: !rule.isRegex,
                    })}
                  title="Click to toggle between Exact Text and Regular Expression"
                >
                  {rule.isRegex ? 'Regex' : 'Exact'}
                </button>
              </td>

              <td class="td-find">
                <input
                  type="text"
                  value={rule.find}
                  class="rule-inline-input find-input"
                  onchange={(e) =>
                    datasetState.updateReplacementRule(rule.id, {
                      find: e.target.value,
                    })}
                  placeholder="Find token..."
                />
              </td>

              <td class="td-arrow">
                <i class="fa-solid fa-arrow-right text-muted"></i>
              </td>

              <td class="td-replace">
                <input
                  type="text"
                  value={rule.replace || ''}
                  class="rule-inline-input replace-input"
                  placeholder="(deleted)"
                  onchange={(e) =>
                    datasetState.updateReplacementRule(rule.id, {
                      replace: e.target.value,
                    })}
                />
              </td>

              <td class="td-matches">
                {#if matches > 0}
                  <button
                    type="button"
                    class="match-badge match-found clickable {selectedRuleId ===
                    rule.id
                      ? 'badge-active'
                      : ''}"
                    onclick={() => toggleRulePreview(rule.id)}
                    title={selectedRuleId === rule.id
                      ? 'Currently showing all samples for this transformation below. Click to reset.'
                      : `Click to show all ${matches} samples of this transformation in the preview below`}
                  >
                    <i
                      class="fa-solid {selectedRuleId === rule.id
                        ? 'fa-circle-check'
                        : 'fa-eye'}"
                    ></i>
                    <span>{matches} {matches === 1 ? 'match' : 'matches'}</span>
                  </button>
                {:else}
                  <span class="match-badge match-none">0 found</span>
                {/if}
              </td>

              <td class="td-reorder">
                <div class="reorder-btn-group">
                  <button
                    type="button"
                    class="btn-reorder"
                    disabled={actualIndex === 0}
                    onclick={() => datasetState.moveRuleUp(rule.id)}
                    title={actualIndex === 0
                      ? 'First rule in execution order'
                      : 'Move up (execute earlier)'}
                  >
                    <i class="fa-solid fa-arrow-up"></i>
                  </button>
                  <button
                    type="button"
                    class="btn-reorder"
                    disabled={actualIndex ===
                      datasetState.replacementRules.length - 1}
                    onclick={() => datasetState.moveRuleDown(rule.id)}
                    title={actualIndex ===
                    datasetState.replacementRules.length - 1
                      ? 'Last rule in execution order'
                      : 'Move down (execute later)'}
                  >
                    <i class="fa-solid fa-arrow-down"></i>
                  </button>
                </div>
              </td>

              <td class="td-actions">
                <button
                  type="button"
                  class="btn-delete-rule"
                  onclick={() => datasetState.removeReplacementRule(rule.id)}
                  title="Remove this rule"
                >
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="empty-rules-box">
      <i class="fa-solid fa-broom empty-icon"></i>
      <p class="empty-title">No Replacement Rules Configured</p>
      <p class="empty-desc">
        Add tokens above to delete them from your transcripts (like
        <code>&lt;hes&gt;</code> or <code>&lt;laughter&gt;</code>), or click
        "Defaults" to restore standard rules.
      </p>
      <button
        type="button"
        class="btn-primary-action"
        onclick={() => datasetState.resetDefaultRules()}
      >
        <i class="fa-solid fa-arrow-rotate-left"></i> Restore Default Rules
      </button>
    </div>
  {/if}

  <!-- Live Annotation Preview Section -->
  {#if previewSamples.length > 0 || selectedRule}
    <section class="live-preview-section" bind:this={previewSectionEl}>
      <div class="preview-header">
        <div class="preview-title-left">
          <i class="fa-solid fa-eye text-primary"></i>
          <h4>Live Annotation Transformation Preview</h4>
          {#if selectedRule}
            <span
              class="preview-rule-badge"
              title="Filtered by transformation rule"
            >
              Rule: <code>{selectedRule.find}</code> &rarr;
              <code>{selectedRule.replace || '(deleted)'}</code>
            </span>
            <span class="preview-count-badge">
              All {previewSamples.length}
              {previewSamples.length === 1 ? 'sample' : 'samples'}
            </span>
          {:else}
            <span class="preview-badge">Sample from loaded annotations</span>
          {/if}
        </div>

        {#if selectedRule}
          <button
            type="button"
            class="btn-reset-preview"
            onclick={() => (selectedRuleId = null)}
            title="Clear filter and show general preview"
          >
            <i class="fa-solid fa-xmark"></i> Show General Preview
          </button>
        {/if}
      </div>

      {#if previewSamples.length > 0}
        <div class="preview-cards-list">
          {#each previewSamples as sample, idx}
            <div class="sample-card">
              <div class="sample-meta">
                {#if selectedRule}
                  <span class="sample-num">#{idx + 1}</span>
                {/if}
                <span class="sample-file"
                  ><i class="fa-solid fa-file-code"></i> {sample.fileName}</span
                >
                <span class="sample-tier"
                  ><i class="fa-solid fa-layer-group"></i> Tier: {sample.tierId}</span
                >
              </div>
              <div class="sample-comparison">
                <div class="sample-row original-row">
                  <span class="row-label">Before:</span>
                  <span class="row-text font-original">{sample.original}</span>
                </div>
                <div class="sample-row cleaned-row">
                  <span class="row-label">After:</span>
                  <span class="row-text font-cleaned">{sample.cleaned}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="preview-empty-match">
          <i class="fa-solid fa-circle-info"></i>
          <span
            >No matching annotations found in currently selected tiers for rule <code
              >{selectedRule?.find}</code
            >.</span
          >
        </div>
      {/if}
    </section>
  {/if}

  <!-- Step Navigation Footer -->
  <div class="step-nav-footer">
    <button
      type="button"
      class="btn-step-back"
      onclick={() => datasetState.setTab('reports')}
    >
      <i class="fa-solid fa-arrow-left"></i>
      <span>Back: Issues</span>
    </button>

    <div class="footer-center-summary">
      <span class="summary-text">
        <i class="fa-solid fa-circle-check text-success"></i>
        {datasetState.replacementRules.filter((r) => r.enabled).length} of {datasetState
          .replacementRules.length} rules active
        {#if totalActiveMatches > 0}
          ({totalActiveMatches} tokens will be cleaned before export)
        {/if}
      </span>
    </div>

    <button
      type="button"
      class="btn-step-next"
      onclick={proceedToReview}
      disabled={datasetState.isChecking}
      title="Apply rules and review dataset metrics"
    >
      <span>Next: Review Dataset</span>
      <i class="fa-solid fa-arrow-right"></i>
      {#if datasetState.isChecking}
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Applying &amp; Reviewing...</span>
      {:else}
        <span>Next: Review Dataset</span>
        <i class="fa-solid fa-arrow-right"></i>
      {/if}
    </button>
  </div>
</div>

<style>
  .dataset-replacements-card {
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

  .replacements-card-title {
    font-size: 1.12rem;
    font-weight: 800;
    margin: 0;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-icon {
    color: #0284c7;
  }

  .card-subtitle {
    font-size: 0.82rem;
    color: var(--text-muted, #64748b);
    margin: 0;
    line-height: 1.4;
    max-width: 680px;
  }

  .header-actions-group {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .btn-action-outline {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .btn-action-outline:hover:not(:disabled) {
    background: var(--bg-hover, #f1f5f9);
    border-color: #94a3b8;
  }

  .btn-action-outline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-reset-rules:hover {
    color: #0284c7;
    border-color: #38bdf8;
  }

  .hidden-file-input {
    display: none;
  }

  .notice-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    margin-bottom: 10px;
  }

  .success-banner {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  /* Casing Option Card */
  .casing-option-card {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    padding: 8px 12px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  :global([data-theme='dark']) .casing-option-card {
    background: rgba(255, 255, 255, 0.02);
  }

  .casing-checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    flex: 1;
    min-width: 240px;
  }

  .casing-checkbox-label input[type='checkbox'] {
    margin-top: 2px;
    cursor: pointer;
    accent-color: #0284c7;
    width: 15px;
    height: 15px;
  }

  .casing-info-col {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .casing-main-title {
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .casing-subtitle {
    font-size: 0.76rem;
    color: var(--text-muted, #64748b);
    line-height: 1.35;
  }

  .casing-status-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(2, 132, 199, 0.1);
    color: #0284c7;
    border: 1px solid rgba(2, 132, 199, 0.2);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 0.74rem;
    font-weight: 600;
    white-space: nowrap;
  }

  /* Detected Tokens Panel */
  .detected-tokens-panel {
    background: #fefce8;
    border: 1px solid #fef08a;
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 10px;
  }

  :global([data-theme='dark']) .detected-tokens-panel {
    background: rgba(234, 179, 8, 0.08);
    border-color: rgba(234, 179, 8, 0.25);
  }

  .detected-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }

  .detected-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.84rem;
    font-weight: 700;
    color: #854d0e;
  }

  :global([data-theme='dark']) .detected-title {
    color: #fde047;
  }

  .detected-hint {
    font-size: 0.76rem;
    font-weight: normal;
    color: #a16207;
    margin-left: 4px;
  }

  .btn-quick-all {
    background: #eab308;
    color: #713f12;
    border: none;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: background 0.15s ease;
  }

  .btn-quick-all:hover {
    background: #facc15;
  }

  .tokens-chip-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .token-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #ffffff;
    border: 1px solid #fde047;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 0.78rem;
    cursor: pointer;
    color: #713f12;
    transition: all 0.15s ease;
  }

  :global([data-theme='dark']) .token-chip {
    background: #1e293b;
    border-color: #854d0e;
    color: #fde047;
  }

  .token-chip:hover {
    border-color: #ca8a04;
    background: #fef08a;
  }

  .token-chip.chip-active {
    border-color: #86efac;
    background: #f0fdf4;
    color: #166534;
  }

  .chip-count {
    background: #fef08a;
    color: #854d0e;
    font-size: 0.68rem;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 8px;
  }

  .token-chip.chip-active .chip-count {
    background: #dcfce7;
    color: #166534;
  }

  /* Presets Row */
  .presets-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 10px;
    padding: 4px 8px;
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
  }

  .presets-label {
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--text-muted, #64748b);
  }

  .presets-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .preset-pill {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 0.74rem;
    color: var(--text-base, #334155);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
  }

  .preset-pill:hover {
    border-color: #0284c7;
    color: #0284c7;
  }

  .preset-pill.preset-added {
    background: #f0fdf4;
    border-color: #86efac;
    color: #166534;
  }

  /* Add Rule Form */
  .add-rule-card {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 10px;
  }

  .add-rule-form {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .form-field label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .required-star {
    color: #dc2626;
  }

  .sub-label {
    font-weight: normal;
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
  }

  .form-input {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 5px;
    padding: 5px 8px;
    font-size: 0.8rem;
    color: var(--text-heading, #0f172a);
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .form-input:focus {
    border-color: #0284c7;
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }

  .field-find {
    flex: 2;
    min-width: 160px;
  }

  .field-arrow {
    padding-bottom: 6px;
    color: var(--text-muted, #94a3b8);
  }

  .field-replace {
    flex: 2;
    min-width: 160px;
  }

  .field-regex {
    padding-bottom: 6px;
  }

  .checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.78rem;
    cursor: pointer;
    font-weight: 600;
    color: var(--text-base, #334155);
  }

  .field-submit {
    padding-bottom: 1px;
  }

  .btn-add-rule {
    background: #0284c7;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: background 0.15s ease;
  }

  .btn-add-rule:hover:not(:disabled) {
    background: #0369a1;
  }

  .btn-add-rule:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Controls Bar */
  .table-controls-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }

  .controls-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .rules-section-title {
    font-size: 0.88rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .active-matches-badge {
    background: #e0f2fe;
    color: #0369a1;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .pipeline-order-tag {
    background: #f1f5f9;
    color: #475569;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .rules-search-wrap {
    position: relative;
  }

  .rules-search-input {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 5px;
    padding: 3px 8px 3px 24px;
    font-size: 0.78rem;
    outline: none;
  }

  .search-icon {
    position: absolute;
    left: 7px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.7rem;
    color: var(--text-muted, #94a3b8);
  }

  /* Table */
  .table-container {
    overflow-x: auto;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    margin-bottom: 10px;
  }

  .rules-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    text-align: left;
  }

  .rules-table th {
    background: var(--bg-hover, #f8fafc);
    padding: 5px 8px;
    font-weight: 700;
    color: var(--text-muted, #475569);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    white-space: nowrap;
    font-size: 0.76rem;
  }

  .rules-table td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
    vertical-align: middle;
    font-size: 0.78rem;
  }

  .rules-table tr:hover {
    background: var(--bg-hover, #f8fafc);
  }

  .row-disabled {
    opacity: 0.55;
    background: var(--bg-hover, #fafafa);
  }

  .th-order,
  .td-order {
    width: 48px;
    text-align: center;
  }

  .order-cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .drag-grip {
    color: #cbd5e1;
    cursor: grab;
    font-size: 0.75rem;
    transition: color 0.15s ease;
  }

  .drag-grip:active {
    cursor: grabbing;
  }

  .rules-table tr:hover .drag-grip {
    color: #64748b;
  }

  .order-number {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-muted, #64748b);
  }

  .th-status,
  .td-status {
    width: 36px;
    text-align: center;
  }

  .th-type,
  .td-type {
    width: 65px;
  }

  .badge-type-toggle {
    border: none;
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 0.68rem;
    font-weight: 700;
    cursor: pointer;
    text-transform: uppercase;
  }

  .badge-type-toggle.is-text {
    background: #f1f5f9;
    color: #475569;
  }

  .badge-type-toggle.is-regex {
    background: #ede9fe;
    color: #6d28d9;
  }

  .th-find {
    min-width: 150px;
  }

  .th-arrow,
  .td-arrow {
    width: 22px;
    text-align: center;
  }

  .th-replace {
    min-width: 150px;
  }

  .th-matches {
    width: 110px;
  }

  .th-reorder,
  .td-reorder {
    width: 58px;
    text-align: center;
  }

  .reorder-btn-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .btn-reorder {
    background: transparent;
    border: 1px solid var(--border-color, #e2e8f0);
    color: var(--text-muted, #64748b);
    border-radius: 4px;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .btn-reorder:hover:not(:disabled) {
    background: var(--bg-hover, #f1f5f9);
    color: var(--primary-color, #0284c7);
    border-color: #0284c7;
  }

  .btn-reorder:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  .row-dragging {
    opacity: 0.35;
  }

  .row-drag-over {
    outline: 2px dashed #0284c7;
    background: rgba(2, 132, 199, 0.08) !important;
  }

  .th-actions,
  .td-actions {
    width: 44px;
    text-align: center;
  }

  .rule-inline-input {
    width: 100%;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 2px 5px;
    font-size: 0.8rem;
    font-family: inherit;
    color: var(--text-heading, #0f172a);
    box-sizing: border-box;
    transition: all 0.15s ease;
  }

  .rule-inline-input:hover {
    border-color: var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
  }

  .rule-inline-input:focus {
    border-color: #0284c7;
    background: var(--bg-card, #ffffff);
    outline: none;
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }

  .replace-input::placeholder {
    color: #94a3b8;
    font-style: italic;
  }

  .match-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 10px;
  }

  button.match-badge {
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  button.match-found:hover {
    background: #bbf7d0;
    border-color: #86efac;
    transform: translateY(-1px);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  button.match-badge.badge-active {
    background: #15803d;
    color: #ffffff;
    border-color: #166534;
    box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.35);
  }

  .match-found {
    background: #dcfce7;
    color: #15803d;
  }

  .match-none {
    background: #f1f5f9;
    color: #94a3b8;
  }

  .btn-delete-rule {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 3px 5px;
    border-radius: 4px;
    transition: all 0.12s ease;
  }

  .btn-delete-rule:hover {
    color: #dc2626;
    background: #fee2e2;
  }

  /* Empty state */
  .empty-rules-box {
    text-align: center;
    padding: 20px 14px;
    background: var(--bg-hover, #f8fafc);
    border: 1px dashed var(--border-color, #cbd5e1);
    border-radius: 6px;
    margin-bottom: 10px;
  }

  .empty-icon {
    font-size: 1.5rem;
    color: #94a3b8;
    margin-bottom: 4px;
  }

  .empty-title {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    margin: 0 0 3px 0;
  }

  .empty-desc {
    font-size: 0.78rem;
    color: var(--text-muted, #64748b);
    max-width: 440px;
    margin: 0 auto 8px auto;
    line-height: 1.4;
  }

  /* Live Preview Section */
  .live-preview-section {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 10px;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }

  .preview-title-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .preview-header h4 {
    margin: 0;
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .preview-badge {
    background: #e2e8f0;
    color: #475569;
    font-size: 0.68rem;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .preview-rule-badge {
    background: #fef08a;
    color: #713f12;
    border: 1px solid #fde047;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .preview-count-badge {
    background: #dcfce7;
    color: #166534;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
  }

  .btn-reset-preview {
    background: transparent;
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-muted, #64748b);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 0.72rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
    margin-left: auto;
  }

  .btn-reset-preview:hover {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
    border-color: #94a3b8;
  }

  .preview-cards-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 480px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .sample-num {
    font-weight: 700;
    color: #0284c7;
  }

  .preview-empty-match {
    padding: 12px;
    text-align: center;
    color: var(--text-muted, #64748b);
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .sample-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 5px;
    padding: 6px 10px;
  }

  .sample-meta {
    display: flex;
    gap: 8px;
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
    margin-bottom: 4px;
  }

  .sample-comparison {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.8rem;
  }

  .sample-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .row-label {
    font-size: 0.72rem;
    font-weight: 700;
    min-width: 40px;
    color: var(--text-muted, #64748b);
  }

  .font-original {
    color: #dc2626;
    background: #fef2f2;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .font-cleaned {
    color: #16a34a;
    background: #f0fdf4;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 500;
  }

  /* Navigation Footer */
  .step-nav-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--border-color, #e2e8f0);
  }

  .btn-step-back {
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btn-step-back:hover {
    background: var(--bg-hover, #f1f5f9);
    border-color: #94a3b8;
  }

  .footer-center-summary {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-base, #334155);
  }

  .btn-step-next {
    background: #0284c7;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
    box-shadow: 0 1px 3px rgba(2, 132, 199, 0.25);
  }

  .btn-step-next:hover:not(:disabled) {
    background: #0369a1;
    box-shadow: 0 2px 6px rgba(2, 132, 199, 0.35);
  }

  .text-amber {
    color: #d97706;
  }

  .text-primary {
    color: #0284c7;
  }

  .text-success {
    color: #16a34a;
  }

  .text-muted {
    color: #94a3b8;
  }

  :global([data-theme='dark']) button.match-badge.badge-active {
    background: #22c55e;
    color: #0f172a;
    border-color: #4ade80;
  }

  :global([data-theme='dark']) .preview-rule-badge {
    background: #854d0e;
    color: #fde047;
    border-color: #ca8a04;
  }

  :global([data-theme='dark']) .preview-count-badge {
    background: #14532d;
    color: #86efac;
  }

  :global([data-theme='dark']) .btn-reset-preview {
    border-color: #475569;
    color: #94a3b8;
  }

  :global([data-theme='dark']) .btn-reset-preview:hover {
    background: #334155;
    color: #f8fafc;
  }

  :global([data-theme='dark']) .pipeline-order-tag {
    background: #334155;
    color: #cbd5e1;
  }

  :global([data-theme='dark']) .btn-reorder {
    border-color: #475569;
    color: #94a3b8;
  }

  :global([data-theme='dark']) .btn-reorder:hover:not(:disabled) {
    background: #334155;
    color: #38bdf8;
    border-color: #38bdf8;
  }

  :global([data-theme='dark']) .row-drag-over {
    outline-color: #38bdf8;
    background: rgba(56, 189, 248, 0.15) !important;
  }

  @media (max-width: 768px) {
    .dataset-replacements-card {
      padding: 10px 12px;
    }

    .add-rule-form {
      flex-direction: column;
      align-items: stretch;
    }

    .field-arrow {
      display: none;
    }

    .step-nav-footer {
      flex-direction: column;
      align-items: stretch;
    }

    .btn-step-next,
    .btn-step-back {
      width: 100%;
      justify-content: center;
    }

    .footer-center-summary {
      text-align: center;
    }
  }
</style>
