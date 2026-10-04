<script>
  import {
    lexiconState,
    createDefaultLexiconFields,
  } from '../../state/lexiconState.svelte.js';
  import { generateId } from '../../utils/lexiconTsv.js';

  let title = $state('');
  let languageVariety = $state('');
  let description = $state('');
  let template = $state('default'); // 'default' | 'minimal' | 'empty'
  let isSubmitting = $state(false);
  let errorMessage = $state('');

  function handleClose() {
    lexiconState.isNewLexiconModalOpen = false;
    title = '';
    languageVariety = '';
    description = '';
    errorMessage = '';
  }

  function getTemplateFields() {
    if (template === 'empty') {
      return [{ id: generateId('field'), name: 'Headword', validValues: '' }];
    }
    if (template === 'minimal') {
      return [
        { id: generateId('field'), name: 'Headword', validValues: '' },
        {
          id: generateId('field'),
          name: 'POS',
          validValues: 'n {Noun}, v {Verb}, adj {Adjective}, adv {Adverb}',
        },
        { id: generateId('field'), name: 'Gloss', validValues: '' },
      ];
    }
    return createDefaultLexiconFields();
  }

  async function handleCreate() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      errorMessage = 'Please enter a title for the lexicon.';
      return;
    }

    isSubmitting = true;
    errorMessage = '';

    try {
      await lexiconState.createLexicon({
        title: cleanTitle,
        languageVariety: languageVariety.trim(),
        description: description.trim(),
        fields: getTemplateFields(),
      });
      handleClose();
    } catch (err) {
      console.error('Failed to create lexicon:', err);
      errorMessage = err.message || 'Failed to create lexicon.';
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleCreate();
    }
  }

  function focusOnMount(node) {
    node.focus();
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if lexiconState.isNewLexiconModalOpen}
  <div class="modal-backdrop" onclick={handleClose} role="presentation"></div>

  <div
    class="lex-modal-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <div class="lex-modal-header">
      <div class="lex-modal-title-wrap">
        <div class="lex-modal-icon">
          <i class="fa-solid fa-book-bookmark"></i>
        </div>
        <div>
          <h2 id="modal-title" class="lex-modal-title">Create New Lexicon</h2>
          <p class="lex-modal-sub">
            Define a new dictionary or controlled vocabulary database
          </p>
        </div>
      </div>
      <button
        type="button"
        class="btn-modal-close"
        onclick={handleClose}
        aria-label="Close modal"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <form
      class="lex-modal-body"
      onsubmit={(e) => {
        e.preventDefault();
        handleCreate();
      }}
    >
      {#if errorMessage}
        <div class="alert-error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>{errorMessage}</span>
        </div>
      {/if}

      <div class="form-group">
        <label for="lexicon-title" class="form-label">
          Lexicon Title <span class="required">*</span>
        </label>
        <input
          id="lexicon-title"
          type="text"
          class="form-input"
          placeholder="My Lexicon"
          bind:value={title}
          required
          use:focusOnMount
        />
      </div>

      <div class="form-group">
        <label for="lexicon-language" class="form-label">
          Language Variety <span class="required">*</span>
        </label>
        <input
          id="lexicon-language"
          type="text"
          class="form-input"
          placeholder="Tok Pisin"
          bind:value={languageVariety}
        />
        <span class="field-hint">
          Name, dialect, or ISO/Glottocode of the language variety represented
          by this lexicon.
        </span>
      </div>

      <div class="form-group">
        <label for="lexicon-desc" class="form-label">
          Description (Optional)
        </label>
        <textarea
          id="lexicon-desc"
          class="form-input form-textarea"
          rows="2"
          placeholder="Description of this lexicon..."
          bind:value={description}
        ></textarea>
      </div>

      <div class="form-group">
        <span class="form-label">Initial Fields Template</span>
        <div
          class="template-options-grid"
          role="radiogroup"
          aria-label="Fields Template"
        >
          <label
            class="template-card {template === 'default' ? 'selected' : ''}"
          >
            <input
              type="radio"
              name="lex-template"
              value="default"
              class="visually-hidden"
              bind:group={template}
            />
            <div class="template-card-top">
              <div class="template-icon-wrap">
                <i class="fa-solid fa-layer-group"></i>
              </div>
              <span class="card-radio-indicator">
                <i class="fa-solid fa-check"></i>
              </span>
            </div>
            <div class="template-name-row">
              <span class="template-name">Linguistic Standard</span>
              <span class="template-pill">6 fields</span>
            </div>
            <p class="template-desc">
              Headword, Sense, POS, Gloss, Meaning, Etymology
            </p>
          </label>

          <label
            class="template-card {template === 'minimal' ? 'selected' : ''}"
          >
            <input
              type="radio"
              name="lex-template"
              value="minimal"
              class="visually-hidden"
              bind:group={template}
            />
            <div class="template-card-top">
              <div class="template-icon-wrap">
                <i class="fa-solid fa-list-check"></i>
              </div>
              <span class="card-radio-indicator">
                <i class="fa-solid fa-check"></i>
              </span>
            </div>
            <div class="template-name-row">
              <span class="template-name">Minimal</span>
              <span class="template-pill">3 fields</span>
            </div>
            <p class="template-desc">Headword, POS, Gloss</p>
          </label>

          <label class="template-card {template === 'empty' ? 'selected' : ''}">
            <input
              type="radio"
              name="lex-template"
              value="empty"
              class="visually-hidden"
              bind:group={template}
            />
            <div class="template-card-top">
              <div class="template-icon-wrap">
                <i class="fa-solid fa-file-circle-plus"></i>
              </div>
              <span class="card-radio-indicator">
                <i class="fa-solid fa-check"></i>
              </span>
            </div>
            <div class="template-name-row">
              <span class="template-name">Word List</span>
              <span class="template-pill">1 field</span>
            </div>
            <p class="template-desc">Starts with mandatory Headword field</p>
          </label>
        </div>
      </div>

      <div class="lex-modal-footer">
        <button
          type="button"
          class="btn-cancel"
          onclick={handleClose}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="btn-primary"
          disabled={isSubmitting || !title.trim()}
        >
          {#if isSubmitting}
            <i class="fa-solid fa-circle-notch fa-spin"></i>
            <span>Creating...</span>
          {:else}
            <i class="fa-solid fa-plus"></i>
            <span>Create Lexicon</span>
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

  .lex-modal-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 92%;
    max-width: 580px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.2),
      0 10px 10px -5px rgba(0, 0, 0, 0.08);
    z-index: 1001;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }

  .lex-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-hover, #f8fafc);
  }

  .lex-modal-title-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .lex-modal-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: rgba(2, 132, 199, 0.12);
    color: var(--primary-color, #0284c7);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
  }

  .lex-modal-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .lex-modal-sub {
    margin: 2px 0 0 0;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .btn-modal-close {
    background: transparent;
    border: none;
    font-size: 1.1rem;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
  }

  .btn-modal-close:hover {
    color: var(--text-heading, #0f172a);
    background: rgba(0, 0, 0, 0.05);
  }

  .lex-modal-body {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .alert-error {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .required {
    color: #ef4444;
  }

  .form-input {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 6px;
    font-size: 0.9rem;
    background: var(--bg-input, #ffffff);
    color: var(--text-base, #334155);
    outline: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .form-input:focus {
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
  }

  .form-textarea {
    resize: vertical;
  }

  .field-hint {
    font-size: 0.75rem;
    color: var(--text-muted, #64748b);
  }

  .template-options-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  @media (max-width: 520px) {
    .template-options-grid {
      grid-template-columns: 1fr;
    }
  }

  .template-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 12px;
    border: 1.5px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    background: var(--bg-card, #ffffff);
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
    box-sizing: border-box;
  }

  .template-card:hover {
    border-color: #93c5fd;
    background: var(--bg-hover, #f8fafc);
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.04);
  }

  .template-card.selected {
    border-color: var(--primary-color, #0284c7);
    background: #f0f9ff;
    box-shadow:
      0 0 0 1px var(--primary-color, #0284c7),
      0 4px 12px rgba(2, 132, 199, 0.1);
  }

  .template-card:has(input:focus-visible) {
    outline: 2px solid var(--primary-color, #0284c7);
    outline-offset: 2px;
  }

  .template-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-bottom: 8px;
  }

  .template-icon-wrap {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #f1f5f9;
    color: #475569;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
    transition: all 0.15s ease;
  }

  .template-card.selected .template-icon-wrap {
    background: #e0f2fe;
    color: var(--primary-color, #0284c7);
  }

  .card-radio-indicator {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1.5px solid #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.625rem;
    color: transparent;
    transition: all 0.15s ease;
  }

  .template-card.selected .card-radio-indicator {
    border-color: var(--primary-color, #0284c7);
    background: var(--primary-color, #0284c7);
    color: #ffffff;
  }

  .template-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .template-name {
    font-size: 0.825rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    line-height: 1.25;
  }

  .template-pill {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 10px;
    background: #f1f5f9;
    color: #64748b;
    white-space: nowrap;
  }

  .template-card.selected .template-pill {
    background: #bae6fd;
    color: #0369a1;
  }

  .template-desc {
    font-size: 0.725rem;
    color: var(--text-muted, #64748b);
    line-height: 1.35;
    margin: 0;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .lex-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color, #e2e8f0);
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

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
