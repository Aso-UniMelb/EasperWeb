<script>
  import { hunspellState } from '../../state/hunspellState.svelte.js';
  import { lexiconState } from '../../state/lexiconState.svelte.js';

  let activeLex = $derived(lexiconState.activeLexicon);
  let activeTab = $state('tester'); // 'tester' | 'aff'
  let customAffInput = $state(hunspellState.affContent);
  let copyFeedback = $state('');

  function handleTestInput(e) {
    hunspellState.runTest(e.currentTarget.value);
  }

  function handleSelectSuggestion(sug) {
    hunspellState.runTest(sug);
  }

  async function handleSaveCustomAff() {
    await hunspellState.setCustomAff(customAffInput, activeLex);
    copyFeedback = 'Affix rules updated and rebuilt!';
    setTimeout(() => (copyFeedback = ''), 2500);
  }

  async function handleResetAff() {
    await hunspellState.resetAffToDefault(activeLex);
    customAffInput = hunspellState.affContent;
    copyFeedback = 'Reset to default UTF-8 affix.';
    setTimeout(() => (copyFeedback = ''), 2500);
  }

  function handleClose() {
    hunspellState.isModalOpen = false;
  }
</script>

<div
  class="modal-backdrop"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  onclick={(e) => {
    if (e.target === e.currentTarget) handleClose();
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') handleClose();
  }}
>
  <div class="modal-card">
    <!-- Header -->
    <div class="modal-header">
      <div class="header-title-wrap">
        <div class="header-icon-badge">
          <i class="fa-solid fa-spell-check"></i>
        </div>
        <div>
          <h3 class="modal-title">Hunspell Dictionary</h3>
          <p class="modal-subtitle">
            Dynamically built from <strong
              >{activeLex?.title || 'active lexicon'}</strong
            >
            ({hunspellState.wordCount} word{hunspellState.wordCount === 1
              ? ''
              : 's'})
          </p>
        </div>
      </div>
      <button
        type="button"
        class="btn-close-modal"
        onclick={handleClose}
        title="Close dialog"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <!-- Live Synced Status Banner -->
    <div class="synced-banner">
      <div class="synced-left">
        <span class="status-dot"></span>
        <span>
          <strong>Live Synced:</strong> Built exclusively from mandatory
          <span class="source-field-tag"
            ><i class="fa-solid fa-lock"></i> Headword</span
          >
        </span>
      </div>
      <div class="synced-badge">
        <i class="fa-solid fa-arrows-rotate"></i> Auto-updates on edit
      </div>
    </div>

    <!-- Tab navigation -->
    <div class="modal-tabs">
      <button
        type="button"
        class="tab-btn {activeTab === 'tester' ? 'active' : ''}"
        onclick={() => (activeTab = 'tester')}
      >
        <i class="fa-solid fa-vial"></i>
        <span>Spellcheck Tester</span>
      </button>

      <button
        type="button"
        class="tab-btn {activeTab === 'aff' ? 'active' : ''}"
        onclick={() => {
          activeTab = 'aff';
          customAffInput = hunspellState.affContent;
        }}
      >
        <i class="fa-solid fa-code"></i>
        <span>Hunspell Code</span>
      </button>
    </div>

    <!-- Tab Content -->
    <div class="tab-body">
      {#if activeTab === 'tester'}
        <!-- Spellcheck Tester -->
        <div class="tester-section">
          <label for="hunspell-tester-input" class="tester-label">
            Type any word to test with current Hunspell dictionary:
          </label>
          <div class="tester-input-wrap">
            <input
              id="hunspell-tester-input"
              type="text"
              class="tester-input"
              placeholder="e.g. kitêb, mamoste, apple..."
              value={hunspellState.testWord}
              oninput={handleTestInput}
            />
            {#if hunspellState.testWord}
              <button
                type="button"
                class="btn-clear-test"
                onclick={() => hunspellState.runTest('')}
                aria-label="Clear test word"
                title="Clear test word"
              >
                <i class="fa-solid fa-xmark"></i>
              </button>
            {/if}
          </div>

          <!-- Result Area -->
          {#if hunspellState.testResult}
            <div
              class="test-result-card {hunspellState.testResult.isCorrect
                ? 'valid'
                : 'invalid'}"
            >
              <div class="result-header">
                {#if hunspellState.testResult.isCorrect}
                  <i class="fa-solid fa-circle-check result-icon text-success"
                  ></i>
                  <span class="result-title text-success">Correct spelling</span
                  >
                  <span class="result-word"
                    >"{hunspellState.testResult.word}"</span
                  >
                {:else}
                  <i class="fa-solid fa-circle-xmark result-icon text-danger"
                  ></i>
                  <span class="result-title text-danger">Misspelled</span>
                  <span class="result-word"
                    >"{hunspellState.testResult.word}"</span
                  >
                {/if}
              </div>

              {#if !hunspellState.testResult.isCorrect}
                <div class="suggestions-area">
                  <span class="suggestions-heading">Hunspell Suggestions:</span>
                  {#if hunspellState.testResult.suggestions.length > 0}
                    <div class="suggestions-pills">
                      {#each hunspellState.testResult.suggestions as sug}
                        <button
                          type="button"
                          class="suggestion-pill"
                          onclick={() => handleSelectSuggestion(sug)}
                          title="Click to test suggestion"
                        >
                          {sug}
                        </button>
                      {/each}
                    </div>
                  {:else}
                    <p class="no-suggestions-note">
                      No phonetic or edit-distance suggestions found.
                    </p>
                  {/if}
                </div>
              {/if}
            </div>
          {:else}
            <div class="tester-empty-prompt">
              <i class="fa-solid fa-keyboard prompt-icon"></i>
              <p>
                Type a word above to test real-time validation and Hunspell
                suggestion ranking.
              </p>
            </div>
          {/if}
        </div>
      {:else if activeTab === 'aff'}
        <!-- Hunspell Code (.aff affix rules editor & downloads) -->
        <div class="aff-section">
          <div class="file-toolbar">
            <span class="file-info-label">
              Affix Rules (.aff): Defines character encoding and morphological rules
            </span>
            <div class="file-actions">
              <button
                type="button"
                class="btn-small-action"
                onclick={handleResetAff}
                title="Reset to standard UTF-8"
              >
                <i class="fa-solid fa-arrow-rotate-left"></i>
                <span>Reset Default</span>
              </button>
              <button
                type="button"
                class="btn-small-action"
                onclick={() => hunspellState.exportDic()}
                title="Download .dic file ({hunspellState.wordCount} words)"
              >
                <i class="fa-solid fa-download"></i>
                <span>Download .dic</span>
              </button>
              <button
                type="button"
                class="btn-small-action primary"
                onclick={() => hunspellState.exportAff()}
                title="Download .aff file"
              >
                <i class="fa-solid fa-download"></i>
                <span>Download .aff</span>
              </button>
            </div>
          </div>

          <textarea
            class="aff-editor-textarea"
            rows="10"
            bind:value={customAffInput}
            placeholder="Hunspell affix rules..."
          ></textarea>

          <div class="aff-save-bar">
            <button
              type="button"
              class="btn-save-aff"
              onclick={handleSaveCustomAff}
            >
              <i class="fa-solid fa-check"></i>
              <span>Apply &amp; Rebuild Affix Rules</span>
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- Footer actions -->
    <div class="modal-footer">
      <div class="footer-left">
        {#if copyFeedback}
          <span class="feedback-msg">
            <i class="fa-solid fa-check-circle"></i>
            {copyFeedback}
          </span>
        {/if}
      </div>

      <div class="footer-actions">
        <button type="button" class="btn-secondary" onclick={handleClose}>
          Close
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }

  .modal-card {
    background: var(--bg-card, #ffffff);
    border-radius: 12px;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.15),
      0 8px 10px -6px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 680px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color, #e2e8f0);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-card, #ffffff);
  }

  .header-title-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-icon-badge {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    background: rgba(2, 132, 199, 0.1);
    color: var(--primary-color, #0284c7);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
  }

  .modal-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
  }

  .modal-subtitle {
    margin: 2px 0 0 0;
    font-size: 0.8rem;
    color: var(--text-muted, #64748b);
  }

  .btn-close-modal {
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    transition: all 0.15s ease;
  }

  .btn-close-modal:hover {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
  }

  /* Live Synced Banner */
  .synced-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 20px;
    background: #f0fdf4;
    border-bottom: 1px solid #bbf7d0;
    font-size: 0.775rem;
    color: #166534;
  }

  .synced-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
  }

  .source-field-tag {
    background: #dcfce7;
    color: #15803d;
    padding: 1px 7px;
    border-radius: 4px;
    font-weight: 700;
  }

  .synced-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #15803d;
    background: #ffffff;
    border: 1px solid #bbf7d0;
    padding: 3px 9px;
    border-radius: 12px;
  }

  /* Tabs */
  .modal-tabs {
    display: flex;
    gap: 4px;
    padding: 8px 16px 0 16px;
    background: var(--bg-table-header, #f8fafc);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border: none;
    background: transparent;
    color: var(--text-muted, #64748b);
    font-size: 0.825rem;
    font-weight: 500;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    color: var(--text-heading, #0f172a);
    background: rgba(0, 0, 0, 0.03);
  }

  .tab-btn.active {
    color: var(--primary-color, #0284c7);
    border-bottom-color: var(--primary-color, #0284c7);
    background: var(--bg-card, #ffffff);
    font-weight: 600;
  }

  /* Body */
  .tab-body {
    padding: 16px 20px;
    overflow-y: auto;
    max-height: 480px;
  }

  /* Tester section */
  .tester-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tester-label {
    font-size: 0.825rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
  }

  .tester-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .tester-input {
    width: 100%;
    padding: 10px 36px 10px 14px;
    border: 1.5px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    font-size: 0.95rem;
    background: var(--bg-input, #ffffff);
    color: var(--text-base, #334155);
    outline: none;
    transition: border-color 0.15s ease;
  }

  .tester-input:focus {
    border-color: var(--primary-color, #0284c7);
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
  }

  .btn-clear-test {
    position: absolute;
    right: 10px;
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 4px;
  }

  .test-result-card {
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: all 0.2s ease;
  }

  .test-result-card.valid {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
  }

  .test-result-card.invalid {
    background: #fef2f2;
    border: 1px solid #fecaca;
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
  }

  .result-icon {
    font-size: 1.15rem;
  }

  .result-title {
    font-weight: 700;
  }

  .result-word {
    font-weight: 600;
    color: var(--text-base, #334155);
  }

  .text-success {
    color: #16a34a;
  }

  .text-danger {
    color: #dc2626;
  }

  .suggestions-area {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(239, 68, 68, 0.15);
  }

  .suggestions-heading {
    font-size: 0.775rem;
    font-weight: 600;
    color: #991b1b;
  }

  .suggestions-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .suggestion-pill {
    padding: 4px 10px;
    background: #ffffff;
    border: 1px solid #fca5a5;
    color: #b91c1c;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .suggestion-pill:hover {
    background: #fee2e2;
    border-color: #ef4444;
  }

  .no-suggestions-note {
    margin: 0;
    font-size: 0.775rem;
    color: var(--text-muted, #64748b);
    font-style: italic;
  }

  .tester-empty-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    text-align: center;
    color: var(--text-muted, #94a3b8);
  }

  .prompt-icon {
    font-size: 2rem;
    margin-bottom: 8px;
    opacity: 0.4;
  }

  .tester-empty-prompt p {
    margin: 0;
    font-size: 0.85rem;
  }

  /* File views */
  .file-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .file-info-label {
    font-size: 0.775rem;
    color: var(--text-muted, #64748b);
  }

  .file-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-small-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    border-radius: 6px;
    font-size: 0.775rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .btn-small-action:hover {
    background: var(--bg-hover, #f1f5f9);
    border-color: var(--primary-color, #0284c7);
  }

  .btn-small-action.primary {
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border-color: var(--primary-color, #0284c7);
  }

  .aff-editor-textarea {
    width: 100%;
    padding: 10px;
    font-family: monospace;
    font-size: 0.8rem;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    outline: none;
    box-sizing: border-box;
    background: var(--bg-input, #ffffff);
    color: var(--text-base, #334155);
  }

  .aff-editor-textarea:focus {
    border-color: var(--primary-color, #0284c7);
  }

  .aff-save-bar {
    margin-top: 10px;
    display: flex;
    justify-content: flex-end;
  }

  .btn-save-aff {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: var(--primary-color, #0284c7);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  /* Footer */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-top: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-table-header, #f8fafc);
  }

  .feedback-msg {
    font-size: 0.775rem;
    color: #16a34a;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
  }

  .btn-secondary {
    padding: 6px 14px;
    border: 1px solid var(--border-color, #cbd5e1);
    background: var(--bg-card, #ffffff);
    color: var(--text-base, #334155);
    border-radius: 6px;
    font-size: 0.825rem;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: var(--bg-hover, #f1f5f9);
  }
</style>
