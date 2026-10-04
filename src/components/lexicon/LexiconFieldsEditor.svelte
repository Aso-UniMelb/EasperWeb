<script>
  import { lexiconState } from '../../state/lexiconState.svelte.js';
  import {
    COMMON_POS_LEXICON,
    UNIVERSAL_POS_LEXICON,
    LEIPZIG_GLOSS_LEXICON,
    parseLexicon,
    formatLexicon,
    formatLexiconItem,
  } from '../../utils/subTiers.js';

  let activeLex = $derived(lexiconState.activeLexicon);
  let fields = $derived(activeLex?.fields || []);

  let newFieldName = $state('');
  let newFieldValidValues = $state('');
  let isAddingField = $state(false);

  // Tracks which field is currently expanded for valid values editing
  let expandedFieldId = $state(null);

  function handleAddField() {
    const name = newFieldName.trim();
    if (!name) return;

    lexiconState.addField(activeLex.id, {
      name,
      validValues: newFieldValidValues.trim(),
    });

    newFieldName = '';
    newFieldValidValues = '';
    isAddingField = false;
  }

  function handleQuickAddField(name, validValues = '') {
    if (!activeLex) return;
    // Check if field with same name already exists
    const exists = fields.some(
      (f) => f.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      lexiconState.showStatus(
        `Field "${name}" already exists in this lexicon.`,
      );
      return;
    }

    lexiconState.addField(activeLex.id, {
      name,
      validValues: validValues,
    });
  }

  function handleNameChange(field, newName) {
    if (!activeLex || !newName.trim()) return;
    lexiconState.updateField(activeLex.id, field.id, {
      name: newName.trim(),
    });
  }

  function handleValidValuesChange(field, rawString) {
    if (!activeLex) return;
    lexiconState.updateField(activeLex.id, field.id, {
      validValues: rawString,
    });
  }

  function applyPreset(field, presetList) {
    if (!activeLex) return;
    const formatted = formatLexicon(presetList);
    lexiconState.updateField(activeLex.id, field.id, {
      validValues: formatted,
    });
  }

  function removeChip(field, chipItem) {
    if (!activeLex) return;
    const currentList = parseLexicon(field.validValues || '');
    const tagVal = typeof chipItem === 'object' ? chipItem.value : chipItem;
    const updated = currentList.filter(
      (item) => (item.value || item) !== tagVal,
    );
    lexiconState.updateField(activeLex.id, field.id, {
      validValues: formatLexicon(updated),
    });
  }

  function handleRemoveField(field) {
    if (!activeLex) return;
    const hasData = (activeLex.entries || []).some(
      (e) => e.fields && e.fields[field.id],
    );

    if (hasData) {
      const confirmed = window.confirm(
        `Field "${field.name}" contains data in some entries. Are you sure you want to remove it?`,
      );
      if (!confirmed) return;
    }

    lexiconState.removeField(activeLex.id, field.id);
  }

  function moveField(index, direction) {
    if (!activeLex) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= fields.length) return;
    lexiconState.reorderFields(activeLex.id, index, targetIdx);
  }

  function focusOnMount(node) {
    node.focus();
  }
</script>

<div class="fields-editor-container">
  <div class="fields-editor-header">
    <div>
      <h3 class="fields-section-title">
        <i class="fa-solid fa-table-columns"></i>
        Lexicon Fields Schema ({fields.length})
      </h3>
      <p class="fields-section-desc">
        Configure the data columns for <strong>{activeLex?.title}</strong>. Each
        field can have controlled valid values in the format
        <code>value1 &#123;label1&#125;, value2 &#123;label2&#125;</code>.
      </p>
    </div>

    <div class="fields-header-actions">
      <button
        type="button"
        class="btn-back-entries"
        onclick={() => (lexiconState.activeTab = 'entries')}
        title="Return to Entries table"
      >
        <i class="fa-solid fa-arrow-left"></i>
        <span>Back to Entries</span>
      </button>

      <button
        type="button"
        class="btn-add-field-primary"
        onclick={() => (isAddingField = true)}
      >
        <i class="fa-solid fa-plus"></i>
        <span>Add New Field</span>
      </button>
    </div>
  </div>

  <!-- Quick Add Common Linguistic Fields -->
  <div class="quick-add-bar">
    <span class="quick-add-label">Quick Add Standard Fields:</span>
    <button
      type="button"
      class="btn-quick-field"
      disabled={fields.some((f) => (f.name || '').trim().toLowerCase() === 'headword')}
      onclick={() => handleQuickAddField('Headword')}
      title={fields.some((f) => (f.name || '').trim().toLowerCase() === 'headword') ? 'Headword is already present in this lexicon (mandatory)' : 'Add Headword / Lemma column'}
    >
      + Headword
    </button>
    <button
      type="button"
      class="btn-quick-field"
      onclick={() => handleQuickAddField('Sense Number')}
      title="Add Sense Number column"
    >
      + Sense Number
    </button>
    <button
      type="button"
      class="btn-quick-field"
      onclick={() =>
        handleQuickAddField('POS', formatLexicon(COMMON_POS_LEXICON))}
      title="Add Part of Speech column with common tags"
    >
      + POS
    </button>
    <button
      type="button"
      class="btn-quick-field"
      onclick={() => handleQuickAddField('Gloss')}
      title="Add Gloss column"
    >
      + Gloss
    </button>
    <button
      type="button"
      class="btn-quick-field"
      onclick={() => handleQuickAddField('Meaning')}
      title="Add Meaning / Definition column"
    >
      + Meaning
    </button>
    <button
      type="button"
      class="btn-quick-field"
      onclick={() => handleQuickAddField('Etymology')}
      title="Add Etymology / Origin column"
    >
      + Etymology
    </button>
    <button
      type="button"
      class="btn-quick-field"
      onclick={() => handleQuickAddField('IPA Pronunciation')}
      title="Add IPA Pronunciation column"
    >
      + IPA
    </button>
  </div>

  {#if isAddingField}
    <div class="add-field-panel">
      <div class="add-field-title">
        <i class="fa-solid fa-circle-plus"></i>
        <span>Create New Field</span>
      </div>
      <div class="add-field-form">
        <div class="form-row">
          <div class="form-col flex-1">
            <label for="new-field-name" class="field-label">Field Name</label>
            <input
              id="new-field-name"
              type="text"
              class="form-input"
              placeholder="e.g. Tone, Dialect, Dialectal Variant, Domain, Example"
              bind:value={newFieldName}
              use:focusOnMount
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-col flex-1">
            <label for="new-field-values" class="field-label">
              Valid Values / Controlled Vocabulary (Optional)
            </label>
            <textarea
              id="new-field-values"
              class="form-input"
              rows="2"
              placeholder="e.g. n &#123;Noun&#125;, v &#123;Verb&#125;, adj &#123;Adjective&#125;"
              bind:value={newFieldValidValues}
            ></textarea>
            <span class="field-hint">
              Format: <code
                >value1 &#123;label1&#125;, value2 &#123;label2&#125;</code
              > (comma, space, or newline separated).
            </span>
          </div>
        </div>

        <div class="add-field-actions">
          <button
            type="button"
            class="btn-secondary"
            onclick={() => {
              isAddingField = false;
              newFieldName = '';
              newFieldValidValues = '';
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary"
            disabled={!newFieldName.trim()}
            onclick={handleAddField}
          >
            <i class="fa-solid fa-check"></i>
            <span>Add Field</span>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Fields List -->
  <div class="fields-list">
    {#if fields.length === 0}
      <div class="fields-empty-state">
        <i class="fa-solid fa-table-cells empty-icon"></i>
        <h4>No fields defined yet</h4>
        <p>Add fields above to specify the columns of your lexicon.</p>
        <button
          type="button"
          class="btn-primary"
          onclick={() => (isAddingField = true)}
        >
          <i class="fa-solid fa-plus"></i> Add First Field
        </button>
      </div>
    {:else}
      {#each fields as field, index (field.id)}
        {@const parsedChips = parseLexicon(field.validValues || '')}
        {@const isExpanded = expandedFieldId === field.id}
        {@const isHeadword = (field.name || '').trim().toLowerCase() === 'headword'}
        <div class="field-card {isExpanded ? 'is-expanded' : ''} {isHeadword ? 'is-headword' : ''}">
          <div class="field-card-main">
            <!-- Reorder handles -->
            <div class="reorder-controls">
              <button
                type="button"
                class="btn-reorder"
                disabled={index === 0}
                onclick={() => moveField(index, -1)}
                title="Move column up"
                aria-label="Move column up"
              >
                <i class="fa-solid fa-chevron-up"></i>
              </button>
              <span class="field-order-index">#{index + 1}</span>
              <button
                type="button"
                class="btn-reorder"
                disabled={index === fields.length - 1}
                onclick={() => moveField(index, 1)}
                title="Move column down"
                aria-label="Move column down"
              >
                <i class="fa-solid fa-chevron-down"></i>
              </button>
            </div>

            <!-- Field Name & Info -->
            <div class="field-name-wrap">
              <div class="field-label-row">
                <label for="field-name-{field.id}" class="field-input-label">
                  Field Column Name
                </label>
                {#if isHeadword}
                  <span class="badge-mandatory" title="Headword is the mandatory primary field for this lexicon and Hunspell">
                    <i class="fa-solid fa-lock"></i> Mandatory
                  </span>
                {/if}
              </div>
              <div class="field-name-input-group {isHeadword ? 'is-locked' : ''}">
                <i class="fa-solid {isHeadword ? 'fa-lock' : 'fa-font'} field-name-icon"></i>
                <input
                  id="field-name-{field.id}"
                  type="text"
                  class="field-name-input {isHeadword ? 'input-locked' : ''}"
                  value={field.name}
                  disabled={isHeadword}
                  title={isHeadword ? 'Headword is mandatory and its name cannot be changed' : 'Field name'}
                  placeholder="Field name..."
                  onchange={(e) => handleNameChange(field, e.target.value)}
                />
              </div>
            </div>

            <!-- Valid Values Summary / Toggle -->
            <div class="field-valid-summary">
              {#if parsedChips.length > 0}
                <span class="badge-controlled" title="{parsedChips.length} controlled values">
                  <i class="fa-solid fa-list-check"></i>
                  <span><strong>{parsedChips.length}</strong> values</span>
                </span>
              {:else}
                <span class="badge-freetext" title="No value restrictions set">
                  <i class="fa-solid fa-align-left"></i>
                  <span>Free text</span>
                </span>
              {/if}

              <button
                type="button"
                class="btn-toggle-vocab {isExpanded ? 'active' : ''}"
                onclick={() => {
                  expandedFieldId = isExpanded ? null : field.id;
                }}
                title={isExpanded ? 'Close valid values panel' : 'Configure valid values'}
              >
                <i class="fa-solid {isExpanded ? 'fa-chevron-up' : 'fa-sliders'}"></i>
                <span>{isExpanded ? 'Close' : 'Values'}</span>
              </button>
            </div>

            <!-- Delete Field Button -->
            <div class="field-card-actions">
              <button
                type="button"
                class="btn-delete-field {isHeadword ? 'btn-disabled' : ''}"
                disabled={isHeadword}
                onclick={() => !isHeadword && handleRemoveField(field)}
                title={isHeadword ? 'The Headword field is mandatory and cannot be removed' : 'Delete this field'}
                aria-label={isHeadword ? 'Headword field cannot be removed' : `Delete field ${field.name}`}
              >
                <i class="fa-solid {isHeadword ? 'fa-lock' : 'fa-trash-can'}"></i>
              </button>
            </div>
          </div>

          <!-- Controlled Vocabulary / Valid Values Panel -->
          {#if isExpanded}
            <div class="field-vocab-panel">
              <div class="vocab-header">
                <div class="vocab-title-wrap">
                  <i class="fa-solid fa-sliders vocab-title-icon"></i>
                  <span class="vocab-title">Valid Values / Controlled Vocabulary</span>
                </div>
                <div class="vocab-presets-bar">
                  <span class="presets-text">Quick Presets:</span>
                  <button
                    type="button"
                    class="btn-preset-mini"
                    onclick={() => applyPreset(field, COMMON_POS_LEXICON)}
                    title="Common POS (prop, n, v, adj, adv...)"
                  >
                    Common POS
                  </button>
                  <button
                    type="button"
                    class="btn-preset-mini"
                    onclick={() => applyPreset(field, UNIVERSAL_POS_LEXICON)}
                    title="Universal Dependencies POS (NOUN, VERB, ADJ...)"
                  >
                    Universal POS
                  </button>
                  <button
                    type="button"
                    class="btn-preset-mini"
                    onclick={() => applyPreset(field, LEIPZIG_GLOSS_LEXICON)}
                    title="Leipzig Glossing Rules (1SG, 2SG, NOM, PAST...)"
                  >
                    Leipzig Gloss
                  </button>
                  {#if parsedChips.length > 0}
                    <button
                      type="button"
                      class="btn-preset-mini btn-clear"
                      onclick={() => applyPreset(field, [])}
                      title="Clear valid values"
                    >
                      Clear
                    </button>
                  {/if}
                </div>
              </div>

              <textarea
                id="vocab-input-{field.id}"
                class="form-input vocab-textarea"
                rows="2"
                placeholder="e.g. n &#123;Noun&#125;, v &#123;Verb&#125;, adj &#123;Adjective&#125;"
                value={field.validValues || ''}
                oninput={(e) => handleValidValuesChange(field, e.target.value)}
              ></textarea>
              <div class="vocab-hint-row">
                <i class="fa-solid fa-circle-info hint-icon"></i>
                <span class="vocab-hint">
                  Enter valid values in format: <code>value1 &#123;label1&#125;, value2 &#123;label2&#125;</code> (values enforce inputs; labels show descriptions).
                </span>
              </div>

              {#if parsedChips.length > 0}
                <div class="chips-section">
                  <span class="chips-label">Configured Values ({parsedChips.length}):</span>
                  <div class="chips-list">
                    {#each parsedChips as chip (chip.value)}
                      <span
                        class="vocab-chip"
                        title={chip.label
                          ? `${chip.value}: ${chip.label}`
                          : chip.value}
                      >
                        <span class="chip-val">{chip.value}</span>
                        {#if chip.label}
                          <span class="chip-label">{chip.label}</span>
                        {/if}
                        <button
                          type="button"
                          class="btn-chip-remove"
                          onclick={() => removeChip(field, chip)}
                          title="Remove {chip.value}"
                          aria-label="Remove {chip.value}"
                        >
                          <i class="fa-solid fa-xmark"></i>
                        </button>
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .fields-editor-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .fields-editor-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  .fields-section-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .fields-section-desc {
    margin: 4px 0 0 0;
    font-size: 0.85rem;
    color: var(--text-muted, #64748b);
  }

  .fields-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .btn-back-entries {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: #ffffff;
    color: var(--text-heading, #0f172a);
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .btn-back-entries:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
  }

  .btn-add-field-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s ease;
  }

  .btn-add-field-primary:hover {
    opacity: 0.9;
  }

  .quick-add-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 14px;
    background: var(--bg-hover, #f8fafc);
    border: 1px dashed var(--border-dashed, #cbd5e1);
    border-radius: 8px;
  }

  .quick-add-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
  }

  .btn-quick-field {
    padding: 4px 10px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    border-radius: 4px;
    font-size: 0.775rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-quick-field:hover:not(:disabled) {
    background: var(--bg-hover, #f1f5f9);
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  .btn-quick-field:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    background: #f1f5f9;
    border-color: #e2e8f0;
    color: #94a3b8;
  }

  .add-field-panel {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--primary-color, #0284c7);
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }

  .add-field-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--primary-color, #0284c7);
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .add-field-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-row {
    display: flex;
    gap: 12px;
  }

  .form-col {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .flex-1 {
    flex: 1;
  }

  .field-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .field-hint {
    font-size: 0.725rem;
    color: var(--text-muted, #64748b);
  }

  .form-input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    font-size: 0.875rem;
    background: var(--bg-input, #ffffff);
    color: var(--text-base, #334155);
    outline: none;
  }

  .form-input:focus {
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }

  .add-field-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .btn-secondary {
    padding: 6px 14px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: transparent;
    color: var(--text-base, #334155);
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: var(--bg-hover, #f1f5f9);
  }

  .btn-primary {
    padding: 6px 14px;
    border: none;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .fields-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .fields-empty-state {
    text-align: center;
    padding: 40px 20px;
    border: 2px dashed var(--border-dashed, #cbd5e1);
    border-radius: 8px;
    color: var(--text-muted, #64748b);
  }

  .empty-icon {
    font-size: 2.2rem;
    margin-bottom: 8px;
    opacity: 0.5;
  }

  .field-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
  }

  .field-card:hover {
    border-color: #cbd5e1;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
  }

  .field-card.is-expanded {
    border-color: #93c5fd;
    box-shadow: 0 4px 16px rgba(2, 132, 199, 0.08);
  }

  .field-card.is-headword {
    border-left: 4px solid var(--primary-color, #0284c7);
  }

  .field-card-main {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 18px;
    background: var(--bg-card, #ffffff);
  }

  @media (max-width: 768px) {
    .field-card-main {
      flex-wrap: wrap;
      gap: 12px;
      padding: 12px;
    }
  }

  /* Reorder Controls */
  .reorder-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 2px 4px;
    flex-shrink: 0;
  }

  .btn-reorder {
    background: transparent;
    border: none;
    color: var(--text-muted, #64748b);
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-reorder:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  .btn-reorder:not(:disabled):hover {
    background: #e0f2fe;
    color: var(--primary-color, #0284c7);
  }

  .field-order-index {
    font-size: 0.775rem;
    font-weight: 700;
    color: #475569;
    padding: 0 4px;
    min-width: 24px;
    text-align: center;
  }

  /* Field Name Wrap */
  .field-name-wrap {
    flex: 1;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .badge-mandatory {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--primary-color, #0284c7);
    background: #e0f2fe;
    border: 1px solid #bae6fd;
    padding: 1px 7px;
    border-radius: 12px;
  }

  .field-input-label {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field-name-input-group {
    position: relative;
    display: flex;
    align-items: center;
  }

  .field-name-icon {
    position: absolute;
    left: 10px;
    font-size: 0.8rem;
    color: #94a3b8;
    pointer-events: none;
  }

  .field-name-input {
    width: 100%;
    padding: 7px 12px 7px 30px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    background: #ffffff;
    box-sizing: border-box;
    transition: all 0.15s ease;
  }

  .field-name-input.input-locked {
    background: #f8fafc;
    color: #475569;
    cursor: not-allowed;
    border-color: #e2e8f0;
    font-weight: 700;
  }

  .field-name-input:focus {
    outline: none;
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
  }

  /* Valid Values Summary */
  .field-valid-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .badge-controlled {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.775rem;
    font-weight: 600;
    padding: 5px 10px;
    border-radius: 20px;
    background: #e0f2fe;
    color: #0369a1;
    border: 1px solid #bae6fd;
    white-space: nowrap;
  }

  .badge-controlled i {
    font-size: 0.85rem;
  }

  .badge-freetext {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.775rem;
    font-weight: 500;
    padding: 5px 10px;
    border-radius: 20px;
    background: #f1f5f9;
    color: #64748b;
    border: 1px solid #e2e8f0;
    white-space: nowrap;
  }

  .btn-toggle-vocab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: #ffffff;
    color: var(--text-heading, #0f172a);
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .btn-toggle-vocab:hover {
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
    background: #f0f9ff;
  }

  .btn-toggle-vocab.active {
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25);
  }

  .field-card-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .btn-delete-field {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.15s ease;
  }

  .btn-delete-field:hover:not(:disabled) {
    color: #ef4444;
    background: #fef2f2;
    border-color: #fecaca;
  }

  .btn-delete-field.btn-disabled,
  .btn-delete-field:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    color: #94a3b8;
  }

  .btn-delete-field.btn-disabled:hover,
  .btn-delete-field:disabled:hover {
    color: #94a3b8;
    background: transparent;
    border-color: transparent;
  }

  /* Controlled Vocabulary Panel */
  .field-vocab-panel {
    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    border-top: 1px solid var(--border-color, #e2e8f0);
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
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

  .vocab-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }

  .vocab-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .vocab-title-icon {
    color: var(--primary-color, #0284c7);
    font-size: 0.95rem;
  }

  .vocab-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .vocab-presets-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .presets-text {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
  }

  .btn-preset-mini {
    padding: 3px 9px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: #ffffff;
    color: var(--text-base, #334155);
    border-radius: 12px;
    font-size: 0.725rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-preset-mini:hover {
    background: #f0f9ff;
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  .btn-preset-mini.btn-clear {
    color: #ef4444;
    border-color: #fca5a5;
  }

  .btn-preset-mini.btn-clear:hover {
    background: #fef2f2;
    border-color: #ef4444;
  }

  .vocab-textarea {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    padding: 10px 12px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    background: #ffffff;
    color: var(--text-heading, #0f172a);
    box-sizing: border-box;
    width: 100%;
    resize: vertical;
  }

  .vocab-textarea:focus {
    outline: none;
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
  }

  .vocab-hint-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hint-icon {
    font-size: 0.75rem;
    color: #64748b;
  }

  .vocab-hint {
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
  }

  .vocab-hint code {
    background: #e2e8f0;
    color: #0f172a;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 0.9em;
  }

  /* Chips Section */
  .chips-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
  }

  .chips-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .chips-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .vocab-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #ffffff;
    color: #0369a1;
    border: 1px solid #bae6fd;
    padding: 4px 10px;
    border-radius: 16px;
    font-size: 0.8rem;
    box-shadow: 0 1px 2px rgba(2, 132, 199, 0.05);
    transition: all 0.15s ease;
  }

  .vocab-chip:hover {
    border-color: #7dd3fc;
    box-shadow: 0 2px 4px rgba(2, 132, 199, 0.1);
  }

  .chip-val {
    font-weight: 700;
    color: #0369a1;
  }

  .chip-label {
    font-size: 0.725rem;
    color: #475569;
    border-left: 1px solid #e2e8f0;
    padding-left: 6px;
  }

  .btn-chip-remove {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 2px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease;
  }

  .btn-chip-remove:hover {
    background: #fee2e2;
    color: #ef4444;
  }
</style>
