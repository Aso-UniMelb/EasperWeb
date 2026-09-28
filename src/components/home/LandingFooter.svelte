<script>
  import { appState } from '../../state/appState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import { router } from '../../services/router.svelte.js';
</script>

<footer class="landing-footer">
  <div class="landing-footer-container">
    <!-- Top Grid: 4 Columns -->
    <div class="footer-grid">
      <!-- Col 1: Brand & Mission -->
      <div class="footer-col brand-col">
        <div class="footer-brand">
          <div class="footer-logo-wrap">
            <img src="/icon.png" alt="Easper Logo" class="footer-logo-img" />
          </div>
          <span class="footer-brand-title">Easper</span>
        </div>
        <p class="footer-mission-text">
          A local-first speech transcription and dataset pipeline for field
          linguistics, language documentation, and speech AI.
        </p>
        <div class="footer-trust-pills">
          <span class="trust-pill">
            <i class="fa-solid fa-shield-halved"></i> 100% In-Browser
          </span>
          <span class="trust-pill">
            <i class="fa-solid fa-lock"></i> Zero Backend
          </span>
          <span class="trust-pill">
            <i class="fa-solid fa-code"></i> MIT Licensed
          </span>
        </div>
      </div>

      <!-- Col 2: Applications -->
      <div class="footer-col">
        <h4 class="footer-heading">Applications</h4>
        <ul class="footer-links">
          <li>
            <button
              type="button"
              class="footer-link-btn"
              onclick={() => projectState.goToWorkspace()}
            >
              Transcription Studio
            </button>
          </li>
          <li>
            <button
              type="button"
              class="footer-link-btn"
              onclick={() => projectState.goToDataset()}
            >
              Dataset Builder
            </button>
          </li>
          <li>
            <button
              type="button"
              class="footer-link-btn"
              onclick={() => router.navigate('/models')}
            >
              Model Hub
            </button>
          </li>
        </ul>
      </div>

      <!-- Col 3: Research & Docs -->
      <div class="footer-col">
        <h4 class="footer-heading">Research & Docs</h4>
        <ul class="footer-links">
          <li>
            <button
              type="button"
              class="footer-link-btn"
              onclick={() => router.navigate('/guide')}
            >
              User Guide
            </button>
          </li>
          <li>
            <a
              href="https://arxiv.org/abs/2608.11629"
              target="_blank"
              rel="noopener noreferrer"
              class="footer-link"
            >
              Academic Paper (arXiv)
            </a>
          </li>
          <li>
            <a
              href="https://github.com/Aso-UniMelb/Easper"
              target="_blank"
              rel="noopener noreferrer"
              class="footer-link"
            >
              GitHub Source Code
            </a>
          </li>
          <li>
            <a
              href="https://colab.research.google.com/drive/1vRt5T4FHj_z3KHv0_Z4fReHYW8IMOxNv?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              class="footer-link"
            >
              Fine-Tuning Colab
            </a>
          </li>
        </ul>
      </div>

      <!-- Col 4: Privacy & Technology -->
      <div class="footer-col">
        <h4 class="footer-heading">Privacy & Tech</h4>
        <ul class="footer-links">
          <li>
            <span class="footer-link-text">
              <i class="fa-solid fa-microchip text-sky-500"></i> WebAssembly Multi-thread
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Bottom Copyright & Hardware Bar -->
    <div class="footer-bottom-bar">
      <div class="bottom-left">
        <span
          >© 2026 Easper Project &bull; The University of Melbourne &bull; Free
          & Open Source (MIT)</span
        >
      </div>
      <div class="bottom-right">
        <span class="engine-badge" title="Local runtime details">
          <i class="fa-solid fa-circle-check text-emerald-500"></i>
          <span>Running locally on your device</span>
          {#if appState.hardwareConcurrency}
            <span class="engine-tag">{appState.hardwareConcurrency} Cores</span>
          {/if}
        </span>
      </div>
    </div>
  </div>
</footer>

<style>
  .landing-footer {
    width: 100%;
    background: var(--bg-card);
    border-top: 1px solid var(--border-color);
    margin-top: 60px;
    padding: 48px 0 24px;
    color: var(--text-base);
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease;
  }

  .landing-footer-container {
    max-width: 1240px;
    margin: 0 auto;
    padding: 0 24px;
    box-sizing: border-box;
  }

  .footer-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1.2fr;
    gap: 36px;
    padding-bottom: 40px;
    border-bottom: 1px solid var(--border-color);
  }

  @media (max-width: 960px) {
    .footer-grid {
      grid-template-columns: 1fr 1fr;
      gap: 28px;
    }
    .brand-col {
      grid-column: span 2;
    }
  }

  @media (max-width: 600px) {
    .footer-grid {
      grid-template-columns: 1fr;
      gap: 24px;
    }
    .brand-col {
      grid-column: span 1;
    }
  }

  /* Brand Col */
  .footer-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .footer-logo-wrap {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: #ffffff;
    border: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    box-sizing: border-box;
  }

  :global([data-theme='dark']) .footer-logo-wrap {
    background: #1e293b;
  }

  .footer-logo-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .footer-brand-title {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--text-heading);
    letter-spacing: -0.3px;
  }

  .footer-mission-text {
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.5;
    margin: 0 0 16px;
    max-width: 340px;
  }

  .footer-trust-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .trust-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 12px;
    background: var(--bg-hover);
    color: var(--text-muted);
    border: 1px solid var(--border-color);
  }

  /* Links & Headings */
  .footer-heading {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-heading);
    margin: 0 0 14px 0;
    letter-spacing: -0.2px;
  }

  .footer-links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .footer-link,
  .footer-link-btn {
    font-size: 0.84rem;
    color: var(--text-muted);
    text-decoration: none;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    transition: color 0.15s ease;
  }

  .footer-link:hover,
  .footer-link-btn:hover {
    color: var(--primary-color);
  }

  .footer-link-text {
    font-size: 0.84rem;
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* Bottom Bar */
  .footer-bottom-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 20px;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .engine-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-base);
    background: var(--bg-hover);
    padding: 3px 10px;
    border-radius: 14px;
    border: 1px solid var(--border-color);
  }

  .engine-tag {
    font-size: 0.68rem;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(2, 132, 199, 0.1);
    color: var(--primary-color);
    font-weight: 700;
  }
</style>
