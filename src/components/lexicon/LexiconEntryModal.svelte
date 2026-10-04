<script>
  import { lexiconState } from '../../state/lexiconState.svelte.js';
  import { parseLexicon, isLexiconValueValid } from '../../utils/subTiers.js';
  import { getEntryFieldValue, setEntryFieldValue } from '../../utils/lexiconTsv.js';

  let activeLex = $derived(lexiconState.activeLexicon);
  let fields = $derived(activeLex?.fields || []);
  let isEditing = $derived(lexiconState.editingEntry !== null);

  // Form values mapped by field ID
  let formValues = $state({});
  let isSubmitting = $state(false);

  // Sync form values when modal opens or editingEntry changes
  $effect(() => {
    if (!lexiconState.isEntryModalOpen) {
      formValues = {};
      return;
    }

    const initial = {};
    const entry = lexiconState.editingEntry;

    for (const field of fields) {
      if (entry) {
        initial[field.id] = getEntryFieldValue(entry, field);
      } else {
        initial[field.id] = '';
      }
    }
    formValues = initial;
  });

  function handleClose() {
    lexiconState.closeEntryModal();
  }

  async function handleSave(andAddAnother = false) {
    if (!activeLex) return;
    isSubmitting = true;

    try {
      if (isEditing) {
        await lexiconState.updateEntry(
          activeLex.id,
          lexiconState.editingEntry.id,
          formValues,
        );
        lexiconState.showStatus('Entry updated.');
        handleClose();
      } else {
        await lexiconState.addEntry(activeLex.id, formValues);
        lexiconState.showStatus('Entry created.');

        if (andAddAnother) {
          // Reset form values for next entry
          const resetValues = {};
          for (const field of fields) {
            resetValues[field.id] = '';
          }
          formValues = resetValues;
          // Focus first input
          const firstInput = document.querySelector('.entry-field-input');
          if (firstInput) firstInput.focus();
        } else {
          handleClose();
        }
      }
    } catch (err) {
      console.error('Failed to save entry:', err);
    } finally {
      isSubmitting = false;
    }
  }

  function handleSelectChip(fieldId, value) {
    formValues[fieldId] = value;
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave(false);
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if lexiconState.isEntryModalOpen && activeLex}
  <div class="modal-backdrop" onclick={handleClose} role="presentation"></div>

  <div class="entry-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="entry-modal-title">
    <div class="entry-modal-header">
      <div class="header-info">
        <h2 id="entry-modal-title" class="entry-modal-title">
          <i class="fa-solid {isEditing ? 'fa-pen-to-square' : 'fa-plus'}"></i>
          {isEditing ? 'Edit Lexicon Entry' : 'Add New Lexicon Entry'}
        </h2>
        <span class="header-lex-badge">{activeLex.title}</span>
      </div>
      <button type="button" class="btn-close" onclick={handleClose} aria-label="Close dialog">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <form
      class="entry-modal-body"
      onsubmit={(e) => {
        e.preventDefault();
        handleSave(false);
      }}
    >
      {#if fields.length === 0}
        <div class="no-fields-tip">
          <i class="fa-solid fa-circle-info"></i>
          <span>This lexicon has no fields defined. Please define fields in the Fields Schema tab first.</span>
        </div>
      {:else}
        <div class="fields-form-grid">
          {#each fields as field (field.id)}
            {@const validItems = parseLexicon(field.validValues || '')}
            {@const isLongText = field.name.toLowerCase().includes('meaning') || field.name.toLowerCase().includes('etymology') || field.name.toLowerCase().includes('note')}
            {@const currentVal = formValues[field.id] || ''}
            {@const isCustomValue = validItems.length > 0 && currentVal.trim() && !isLexiconValueValid(currentVal, validItems)}

            <div class="entry-field-group {isLongText ? 'field-span-full' : ''}">
              <div class="field-header-row">
                <label for="field-input-{field.id}" class="field-input-label">
                  {field.name}
                </label>
                {#if isCustomValue}
                  <span class="custom-val-badge" title="Value not found in controlled vocabulary">
                    (custom tag)
                  </span>
                {/if}
              </div>

              {#if isLongText}
                <textarea
                  id="field-input-{field.id}"
                  class="form-input entry-field-input"
                  rows="2"
                  placeholder="Enter {field.name.toLowerCase()}..."
                  bind:value={formValues[field.id]}
                ></textarea>
              {:else}
                <div class="input-with-datalist">
                  <input
                    id="field-input-{field.id}"
                    type="text"
                    list="datalist-{field.id}"
                    class="form-input entry-field-input"
                    placeholder="Enter {field.name.toLowerCase()}..."
                    bind:value={formValues[field.id]}
                  />
                  {#if validItems.length > 0}
                    <datalist id="datalist-{field.id}">
                      {#each validItems as item}
                        <option value={item.value}>{item.label ? `${item.value} - ${item.label}` : item.value}</option>
                      {/each}
                    </datalist>
                  {/if}
                </div>
              {/if}

              <!-- Quick Clickable Chips for Valid Values -->
              {#if validItems.length > 0}
                <div class="quick-chips-row">
                  <span class="chips-hint">Valid tags:</span>
                  {#each validItems.slice(0, 14) as item}
                    <button
                      type="button"
                      class="btn-val-chip {currentVal === item.value ? 'chip-active' : ''}"
                      onclick={() => handleSelectChip(field.id, item.value)}
                      title={item.label ? `${item.value}: ${item.label}` : item.value}
                    >
                      <span>{item.value}</span>
                      {#if item.label}
                        <span class="chip-item-label">{item.label}</span>
                      {/if}
                    </button>
                  {/each}
                  {#if validItems.length > 14}
                    <span class="more-chips-indicator">+{validItems.length - 14} more</span>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <div class="entry-modal-footer">
        <button type="button" class="btn-cancel" onclick={handleClose} disabled={isSubmitting}>
          Cancel
        </button>

        {#if !isEditing}
          <button
            type="button"
            class="btn-secondary"
            disabled={isSubmitting || fields.length === 0}
            onclick={() => handleSave(true)}
            title="Save this entry and start adding another entry immediately"
          >
            <i class="fa-solid fa-plus"></i>
            <span>Save &amp; Add Another</span>
          </button>
        {/if}

        <button
          type="submit"
          class="btn-primary"
          disabled={isSubmitting || fields.length === 0}
        >
          {#if isSubmitting}
            <i class="fa-solid fa-circle-notch fa-spin"></i>
            <span>Saving...</span>
          {:else}
            <i class="fa-solid fa-check"></i>
            <span>{isEditing ? 'Update Entry' : 'Save Entry'}</span>
          {/if}
        </button>
      </div>
    </form>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(2px);
    z-index: 1000;
  }

  .entry-modal-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 94%;
    max-width: 680px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08);
    z-index: 1001;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }

  .entry-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-hover, #f8fafc);
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .entry-modal-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-lex-badge {
    font-size: 0.775rem;
    padding: 2px 8px;
    background: rgba(2, 132, 199, 0.12);
    color: var(--primary-color, #0284c7);
    border-radius: 12px;
    font-weight: 500;
  }

  .btn-close {
    background: transparent;
    border: none;
    font-size: 1.1rem;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
  }

  .btn-close:hover {
    color: var(--text-heading, #0f172a);
    background: rgba(0, 0, 0, 0.05);
  }

  .entry-modal-body {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .fields-form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }

  @media (max-width: 600px) {
    .fields-form-grid {
      grid-template-columns: 1fr;
    }
  }

  .entry-field-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-span-full {
    grid-column: 1 / -1;
  }

  .field-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .field-input-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .custom-val-badge {
    font-size: 0.7rem;
    color: #eab308;
    font-weight: 500;
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
    transition: border-color 0.15s ease;
  }

  .form-input:focus {
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }

  .quick-chips-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .chips-hint {
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
  }

  .btn-val-chip {
    padding: 2px 6px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-hover, #f8fafc);
    color: var(--text-base, #334155);
    border-radius: 4px;
    font-size: 0.725rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.12s ease;
  }

  .btn-val-chip:hover {
    border-color: var(--primary-color, #0284c7);
    color: var(--primary-color, #0284c7);
  }

  .btn-val-chip.chip-active {
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border-color: var(--primary-color, #0284c7);
  }

  .chip-item-label {
    font-size: 0.675rem;
    opacity: 0.8;
  }

  .more-chips-indicator {
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
  }

  .no-fields-tip {
    padding: 24px;
    text-align: center;
    color: var(--text-muted, #64748b);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .entry-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    margin-top: 8px;
  }

  .btn-cancel {
    padding: 8px 16px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: transparent;
    color: var(--text-base, #334155);
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: var(--bg-hover, #f1f5f9);
  }

  .btn-secondary {
    padding: 8px 14px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-hover, #f1f5f9);
  }

  .btn-primary {
    padding: 8px 18px;
    border: none;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled,
  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

