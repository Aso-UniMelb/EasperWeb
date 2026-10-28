<script>
  import Header from '../components/Header.svelte';
</script>

<Header />

<div class="page-container page-whats-new">
  <header class="whats-new-header">
    <div class="header-icon-wrap">
      <i class="fa-solid fa-bullhorn"></i>
    </div>
    <div class="header-text-wrap">
      <h1 class="page-title">What's New</h1>
      <p class="page-subtitle">
        Recent updates, improvements, and features in EasperWeb.
      </p>
    </div>
  </header>

  <div class="updates-list">
    <!-- October 28, 2026 -->
    <section class="update-section">
      <h2 class="update-date">
        <span>October 28, 2026</span>
        <span class="sub-app-badge badge-transcriber">
          <i class="fa-solid fa-microphone"></i> Transcriber
        </span>
      </h2>
      <ul class="update-bullets">
        <li>
          <strong>Audio Player:</strong> Rebuilt the audio player engine for higher
          precision and more accurate segment playback.
        </li>
        <li>
          <strong>Find &amp; Replace:</strong> Added support for Regular Expressions
          (Regex) and preserved whitespace characters without auto-trimming, enabling
          batch replacement of consecutive spaces.
        </li>
        <li>
          <strong>Waveform Interval Selection:</strong> Added range selection
          directly on the waveform. The selected interval can now be played
          using the new toolbar button or by pressing <kbd>Shift</kbd> +
          <kbd>Space</kbd> (matching ELAN behavior).
        </li>
        <li>
          <strong>Waveform Playback Controls:</strong> Clicking or
          right-clicking anywhere on the waveform now stops audio playback
          immediately. Pressing <kbd>Ctrl</kbd> + <kbd>Space</kbd> toggles playback
          starting directly from the red waveform cursor.
        </li>
        <li>
          <strong>Resizable Sidebar:</strong> Made the waveform sidebar resizable
          by dragging its right edge.
        </li>
        <li>
          <strong>Waveform Interface:</strong> Applied several visual and interaction
          refinements across the waveform view.
        </li>
      </ul>
    </section>

    <!-- October 24, 2026 -->
    <section class="update-section">
      <h2 class="update-date">
        <span>October 24, 2026</span>
        <span class="sub-app-badge badge-transcriber">
          <i class="fa-solid fa-microphone"></i> Transcriber
        </span>
      </h2>
      <ul class="update-bullets">
        <li>
          <strong>Validation Rules:</strong> Introduced transcription validation
          rules. Segments matching invalid patterns are now automatically tagged
          with their error category and actionable suggestions to resolve them.
        </li>
        <li>
          <strong>Project Settings:</strong> Reorganized the project settings interface
          for easier navigation and cleaner configuration.
        </li>
      </ul>
    </section>

    <!-- October 21, 2026 -->
    <section class="update-section">
      <h2 class="update-date">
        <span>October 21, 2026</span>
        <span class="sub-app-badge badge-transcriber">
          <i class="fa-solid fa-microphone"></i> Transcriber
        </span>
      </h2>
      <ul class="update-bullets">
        <li>
          <strong>Navigation Header:</strong> Redesigned the application header for
          a cleaner, more organized layout.
        </li>
        <li>
          <strong>ELAN Import:</strong> Added the ability to import ELAN (<code
            >.eaf</code
          >) files directly into an existing project.
        </li>
        <li>
          <strong>Automation Tools:</strong> Automation utilities now open in a dedicated
          slide-out sidebar panel.
        </li>
        <li>
          <strong>Speaker Diarization:</strong> Improved speaker diarization accuracy,
          including detection of overlapping speech.
        </li>
        <li>
          <strong>Speech Recognition:</strong> Added custom time range selection
          to the speech recognition panel.
        </li>
        <li>
          <strong>Project Export:</strong> Exports now prompt you to choose a destination
          folder instead of automatically downloading to the default Downloads directory.
        </li>
        <li>
          <strong>Waveform Zoom:</strong> Added horizontal zoom controls (equivalent
          to ELAN's vertical amplitude zoom).
        </li>
        <li>
          <strong>Find &amp; Replace:</strong> Introduced the Find &amp; Replace
          panel for quick text corrections across segments.
        </li>
        <li>
          <strong>Context Menu:</strong> Improved the "Add segment here" action in
          the waveform context menu.
        </li>
        <li>
          <strong>Bug Fix:</strong> Fixed an issue with the "Merge with next" segment
          function (special thanks to Glitch for reporting).
        </li>
      </ul>
    </section>
  </div>
</div>

<style>
  .page-whats-new {
    max-width: 900px;
    margin: 0 auto;
    padding: 36px 20px 80px;
    width: 100%;
    color: var(--text-base, #334155);
  }

  .whats-new-header {
    display: flex;
    align-items: center;
    gap: 18px;
    padding-bottom: 24px;
    margin-bottom: 36px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  .header-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 12px;
    background: rgba(59, 130, 246, 0.12);
    color: var(--primary, #3b82f6);
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .header-text-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .page-title {
    font-size: 1.85rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    margin: 0;
    line-height: 1.2;
  }

  .page-subtitle {
    font-size: 1rem;
    color: var(--text-muted, #64748b);
    margin: 0;
  }

  .updates-list {
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  .update-section {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    padding: 24px 28px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .update-date {
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    margin: 0 0 18px 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
  }

  .sub-app-badge {
    font-size: 0.78rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 9999px;
    background: rgba(59, 130, 246, 0.1);
    color: var(--primary, #3b82f6);
    border: 1px solid rgba(59, 130, 246, 0.25);
    line-height: 1.3;
  }

  :global(.sub-app-badge.badge-dataset) {
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    border-color: rgba(16, 185, 129, 0.25);
  }

  .update-date::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--primary, #3b82f6);
  }

  .update-bullets {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    line-height: 1.6;
    font-size: 0.96rem;
  }

  .update-bullets li {
    color: var(--text-base, #334155);
  }

  .update-bullets li strong {
    color: var(--text-heading, #0f172a);
  }

  /* Keyboard shortcut tags */
  kbd {
    display: inline-block;
    padding: 2px 6px;
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1;
    color: var(--text-heading, #1e293b);
    background-color: var(--bg-hover, #f1f5f9);
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 4px;
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
  }

  /* Optional screenshot styling */
  :global(.update-screenshot) {
    margin: 14px 0 8px 0;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-card, #ffffff);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
    max-width: 680px;
  }

  :global(.update-screenshot img) {
    display: block;
    width: 100%;
    height: auto;
  }

  :global(.update-screenshot figcaption) {
    font-size: 0.82rem;
    color: var(--text-muted, #64748b);
    padding: 8px 12px;
    background: var(--bg-hover, #f8fafc);
    border-top: 1px solid var(--border-color, #e2e8f0);
  }

  /* Dark Theme */
  :global([data-theme='dark']) .update-section {
    background: #1e293b;
    border-color: #334155;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  :global([data-theme='dark']) .page-title,
  :global([data-theme='dark']) .update-date,
  :global([data-theme='dark']) .update-bullets li strong {
    color: #f8fafc;
  }

  :global([data-theme='dark']) .update-date {
    border-bottom-color: #334155;
  }

  :global([data-theme='dark']) .sub-app-badge {
    background: rgba(59, 130, 246, 0.18);
    color: #60a5fa;
    border-color: rgba(59, 130, 246, 0.35);
  }

  :global([data-theme='dark']) .sub-app-badge.badge-dataset {
    background: rgba(16, 185, 129, 0.18);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.35);
  }

  :global([data-theme='dark']) .update-bullets li {
    color: #cbd5e1;
  }

  :global([data-theme='dark']) kbd {
    background-color: #334155;
    color: #f1f5f9;
    border-color: #475569;
  }

  :global([data-theme='dark']) :global(.update-screenshot) {
    border-color: #334155;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
  }

  :global([data-theme='dark']) :global(.update-screenshot figcaption) {
    background: #0f172a;
    border-color: #334155;
    color: #94a3b8;
  }

  @media (max-width: 768px) {
    .page-whats-new {
      padding: 20px 14px 60px;
    }

    .update-section {
      padding: 18px 16px;
    }

    .whats-new-header {
      gap: 14px;
      margin-bottom: 24px;
    }

    .header-icon-wrap {
      width: 44px;
      height: 44px;
      font-size: 1.25rem;
    }

    .page-title {
      font-size: 1.5rem;
    }
  }
</style>
