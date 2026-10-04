<script>
  import { projectState } from '../../state/projectState.svelte.js';
  import { router } from '../../services/router.svelte.js';
  import EasperLoopPipeline from '../common/EasperLoopPipeline.svelte';
</script>

<div class="starting-page-root">
  <!-- =========================================================================
       1. HERO — what Easper is, in plain terms
       ========================================================================= -->
  <section class="hero-section">
    <div class="hero-glow-backdrop"></div>
    <div class="hero-container">
      <div class="hero-eyebrow-pill">
        <span class="pulse-indicator"></span>
        <span>Runs in your browser &bull; No account &bull; No backend</span>
      </div>

      <h1 class="hero-title">
        Transcribe field recordings
        <br />
        <span class="hero-highlight">with your own model</span>
        <br />
        <span class="hero-highlight">on your own device!</span>
      </h1>

      <p class="hero-subtitle">
        Easper is a free, open-source workspace for language documentation. It
        runs speech recognition, speech segmentation, and speaker diarization
        locally in your browser, so your recordings stay on your computer. Edit
        on a <strong>vertical waveform</strong>, then export to ELAN, or build a
        training dataset and fine-tune a model for your language.
      </p>

      <div class="hero-actions-group">
        <button
          type="button"
          class="btn-cta-primary"
          onclick={() => projectState.goToWorkspace()}
        >
          <i class="fa-solid fa-microphone"></i>
          <span>Open Transcriber</span>
          <i class="fa-solid fa-arrow-right cta-arrow"></i>
        </button>

        <button
          type="button"
          class="btn-cta-secondary"
          onclick={() => projectState.goToDataset()}
        >
          <i class="fa-solid fa-database"></i>
          <span>Open Dataset Builder</span>
        </button>

        <button
          type="button"
          class="btn-cta-secondary"
          onclick={() => router.navigate('/lexicon')}
        >
          <i class="fa-solid fa-book-bookmark"></i>
          <span>Lexicon Manager</span>
        </button>

        <button
          type="button"
          class="btn-cta-ghost"
          onclick={() => router.navigate('/guide')}
        >
          <i class="fa-solid fa-book"></i>
          <span>Read the Guide</span>
        </button>
      </div>
    </div>
  </section>

  <!-- =========================================================================
       2. THE TWO APPS
       ========================================================================= -->
  <section class="apps-showcase-section">
    <div class="section-header-centered">
      <h2 class="section-heading">Two apps, one workflow</h2>
      <p class="section-lead">
        Transcribe recordings in the Studio; turn finished annotations into a
        training dataset in the Builder.
      </p>
    </div>

    <div class="apps-grid">
      <!-- App 1: Transcription Studio -->
      <div class="app-card card-transcribe">
        <div class="app-card-header">
          <div class="app-icon-wrap icon-sky">
            <i class="fa-solid fa-microphone"></i>
          </div>
          <div>
            <h3 class="app-title">Transcription Studio</h3>
            <p class="app-tagline">Transcribe, segment, and annotate</p>
          </div>
        </div>

        <div class="app-feature-bullets">
          <div class="feature-bullet">
            <i class="fa-solid fa-check check-sky"></i>
            <span>
              <strong>Whisper, on your device.</strong> Two English presets are built
              in; you can also point Easper at any ONNX Whisper model on Hugging
              Face, or load your own fine-tuned model from a folder on disk.
            </span>
          </div>
          <div class="feature-bullet">
            <i class="fa-solid fa-check check-sky"></i>
            <span>
              <strong>Automatic segmentation.</strong> Silero VAD splits long recordings
              into utterance-level segments.
            </span>
          </div>
          <div class="feature-bullet">
            <i class="fa-solid fa-check check-sky"></i>
            <span>
              <strong>Speaker diarization.</strong> Groups segments by voice using
              CAM++ speaker embeddings and agglomerative clustering, for 1&ndash;5
              speakers.
            </span>
          </div>
          <div class="feature-bullet">
            <i class="fa-solid fa-check check-sky"></i>
            <span>
              <strong>Waveform editing.</strong> Vertical timeline with a horizontal
              overview; drag segment boundaries, loop playback, and correct the text
              as you listen.
            </span>
          </div>
          <div class="feature-bullet">
            <i class="fa-solid fa-check check-sky"></i>
            <span>
              <strong>Exports.</strong> ELAN <code>.eaf</code> with one tier per
              speaker, plus <code>.srt</code>, <code>.txt</code>, and portable
              <code>.easper</code> project packages.
            </span>
          </div>
        </div>

        <div class="app-card-footer">
          <button
            type="button"
            class="btn-app-launch btn-launch-transcribe"
            onclick={() => projectState.goToWorkspace()}
          >
            <span>Launch Transcriber</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>

      <!-- App 2: Dataset Builder -->
      <div class="app-card card-dataset">
        <div class="app-card-header">
          <div class="app-icon-wrap icon-purple">
            <i class="fa-solid fa-database"></i>
          </div>
          <div>
            <h3 class="app-title">Dataset Builder</h3>
            <p class="app-tagline">ELAN annotations to a training dataset</p>
          </div>
        </div>

        <div class="app-feature-bullets">
          <div class="feature-bullet">
            <i class="fa-solid fa-check check-purple"></i>
            <span>
              <strong>Reads your archive.</strong> Pairs existing ELAN
              <code>.eaf</code>
              files with their media and slices each annotation into its own clip.
            </span>
          </div>
          <div class="feature-bullet">
            <i class="fa-solid fa-check check-purple"></i>
            <span>
              <strong>Normalizes audio.</strong> Clips are written as 16 kHz mono
              16-bit WAV, the format Whisper fine-tuning expects.
            </span>
          </div>
          <div class="feature-bullet">
            <i class="fa-solid fa-check check-purple"></i>
            <span>
              <strong>Packages a bundle.</strong> Downloads a <code>.zip</code>
              containing the clips and a <code>metadata.tsv</code> mapping each file
              to its transcript.
            </span>
          </div>
          <div class="feature-bullet">
            <i class="fa-solid fa-check check-purple"></i>
            <span>
              <strong>Ready to train.</strong> Feed the bundle to the Colab notebook
              to fine-tune Whisper for your language.
            </span>
          </div>
        </div>

        <div class="app-card-footer">
          <button
            type="button"
            class="btn-app-launch btn-launch-dataset"
            onclick={() => projectState.goToDataset()}
          >
            <span>Launch Dataset Builder</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- =========================================================================
       3. THE EASPER LOOP — the accuracy argument from the paper
       ========================================================================= -->
  <section class="pipeline-section">
    <div class="section-header-centered">
      <span class="section-kicker">Improving accuracy</span>
      <h2 class="section-heading">
        When the model's performance is poor for your language
      </h2>
      <p class="section-lead">
        Speech recognition models are often trained on high-resource languages,
        so on an under-documented one the first pass can need significant
        correction. Easper treats that correction as training data: every
        transcript you verify becomes material for fine-tuning, and the improved
        model comes back into the Studio to make the next batch easier. Each
        loop through your data should leave you correcting less.
      </p>
    </div>

    <EasperLoopPipeline activeStep="none" mode="full" collapsible={false} />
  </section>

  <!-- =========================================================================
       4. WHERE YOUR DATA GOES — specific, including the one exception
       ========================================================================= -->
  <section class="privacy-section">
    <div class="privacy-card">
      <div class="privacy-header">
        <div class="privacy-icon-badge">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
        <div>
          <h2 class="privacy-heading">Where your data goes</h2>
          <p class="privacy-sub">
            Easper has no server of its own. There is no account, no telemetry
            (transfer of data, error logs, system information, etc.), and no
            database we can read. Easper is a browser-based application, a type
            of application commonly used to allow computers to interact with
            services on the World Wide Web. However, Easper uses the browser to
            work with files stored locally on your computer. Like opening a
            locally stored PDF in a web browser, the files processed by Easper
            remain on your computer and are not sent to a server.
          </p>
        </div>
      </div>

      <div class="privacy-rows">
        <div class="privacy-row row-stays">
          <div class="row-label">
            <span>What stays on your computer?</span>
          </div>
          <p class="row-text">
            Your recordings, transcripts, speaker names, and projects stay on
            your computer. Audio is decoded, segmented, recognized, and exported
            in the browser tab, and projects are saved to your browser's own
            storage (IndexedDB). None of it is uploaded anywhere.
          </p>
        </div>

        <div class="privacy-row row-download">
          <div class="row-label">
            <span>What is downloaded to your computer?</span>
          </div>
          <p class="row-text">
            Model files. The first time you use a model, Easper fetches it from
            Hugging Face and caches it for offline use &mdash; or you can load
            one from a folder on disk and stay fully offline. This traffic is a
            download only; nothing of yours is sent with it.
          </p>
        </div>

        <div class="privacy-row row-leaves">
          <div class="row-label">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>What leaves your computer? <br />(only if you choose it)</span
            >
          </div>
          <p class="row-text">
            Fine-tuning (step 3 of the loop) is the one step Easper cannot run
            in a browser tab, because it needs a GPU. If you use the Google
            Colab notebook, you upload your exported dataset to your personal
            Google Drive and it is handled under Google's terms. Skip that step
            and nothing ever leaves. If your material is sensitive or under
            community access restrictions, fine-tune on your own hardware
            instead.
          </p>
        </div>
      </div>
    </div>
  </section>
</div>

<style>
  .starting-page-root {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 16px 48px;
    box-sizing: border-box;
  }

  /* --------------------------------------------------------------------------
     1. Hero
     -------------------------------------------------------------------------- */
  .hero-section {
    position: relative;
    padding: 56px 0 36px;
    text-align: center;
    overflow: hidden;
  }

  @media (min-width: 768px) {
    .hero-section {
      padding: 76px 0 48px;
    }
  }

  .hero-glow-backdrop {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 800px;
    height: 380px;
    background: radial-gradient(
      circle,
      rgba(2, 132, 199, 0.12) 0%,
      rgba(2, 132, 199, 0) 70%
    );
    pointer-events: none;
    z-index: 0;
  }

  :global([data-theme='dark']) .hero-glow-backdrop {
    background: radial-gradient(
      circle,
      rgba(56, 189, 248, 0.1) 0%,
      rgba(56, 189, 248, 0) 70%
    );
  }

  .hero-container {
    position: relative;
    z-index: 1;
    max-width: 860px;
    margin: 0 auto;
  }

  .hero-eyebrow-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
    border-radius: 20px;
    background: rgba(2, 132, 199, 0.08);
    border: 1px solid rgba(2, 132, 199, 0.25);
    color: var(--primary-color);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    margin-bottom: 20px;
  }

  .pulse-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
    }
    70% {
      transform: scale(1);
      box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
    }
    100% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
    }
  }

  .hero-title {
    font-size: 2.3rem;
    font-weight: 850;
    line-height: 1.18;
    color: var(--text-heading);
    letter-spacing: -0.8px;
    margin: 0 0 20px;
  }

  @media (min-width: 768px) {
    .hero-title {
      font-size: 3.2rem;
      letter-spacing: -1.2px;
    }
  }

  .hero-highlight {
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  :global([data-theme='dark']) .hero-highlight {
    background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .hero-subtitle {
    font-size: 1.05rem;
    line-height: 1.62;
    color: var(--text-muted);
    margin: 0 auto 30px;
    max-width: 720px;
  }

  @media (min-width: 768px) {
    .hero-subtitle {
      font-size: 1.14rem;
    }
  }

  .hero-actions-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .btn-cta-primary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 0.98rem;
    font-weight: 650;
    color: #ffffff;
    background: linear-gradient(135deg, #0284c7, #0369a1);
    border: none;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(2, 132, 199, 0.35);
    transition: all 0.2s ease;
  }

  .btn-cta-primary:hover {
    background: linear-gradient(135deg, #0369a1, #075985);
    box-shadow: 0 4px 14px rgba(2, 132, 199, 0.45);
    transform: translateY(-2px);
  }

  .cta-arrow {
    font-size: 0.82rem;
    transition: transform 0.2s ease;
  }

  .btn-cta-primary:hover .cta-arrow {
    transform: translateX(3px);
  }

  .btn-cta-secondary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 22px;
    border-radius: 8px;
    font-size: 0.98rem;
    font-weight: 650;
    color: #6b21a8;
    background: #f3e8ff;
    border: 1px solid #d8b4fe;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  :global([data-theme='dark']) .btn-cta-secondary {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border-color: rgba(168, 85, 247, 0.35);
  }

  .btn-cta-secondary:hover {
    background: #e9d5ff;
    transform: translateY(-2px);
  }

  :global([data-theme='dark']) .btn-cta-secondary:hover {
    background: rgba(168, 85, 247, 0.25);
  }

  .btn-cta-ghost {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-heading);
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-cta-ghost:hover {
    background: var(--bg-hover);
    transform: translateY(-2px);
  }

  /* --------------------------------------------------------------------------
     Shared section header
     -------------------------------------------------------------------------- */
  .section-header-centered {
    text-align: center;
    max-width: 720px;
    margin: 0 auto 32px;
  }

  .section-kicker {
    display: block;
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--primary-color);
    margin-bottom: 8px;
  }

  .section-heading {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--text-heading);
    letter-spacing: -0.5px;
    margin: 0 0 10px;
  }

  @media (min-width: 768px) {
    .section-heading {
      font-size: 2.05rem;
    }
  }

  .section-lead {
    font-size: 0.97rem;
    color: var(--text-muted);
    line-height: 1.62;
    margin: 0;
  }

  /* --------------------------------------------------------------------------
     2. Two apps
     -------------------------------------------------------------------------- */
  .apps-showcase-section {
    padding: 36px 0 20px;
  }

  .apps-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 22px;
  }

  @media (min-width: 860px) {
    .apps-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .app-card {
    display: flex;
    flex-direction: column;
    padding: 24px;
    border-radius: 14px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    transition: all 0.2s ease;
  }

  .app-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  }

  :global([data-theme='dark']) .app-card:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }

  .card-transcribe {
    border-top: 3px solid #0284c7;
  }

  .card-dataset {
    border-top: 3px solid #9333ea;
  }

  .app-card-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 18px;
  }

  .app-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    flex-shrink: 0;
    border-radius: 11px;
    font-size: 1.2rem;
  }

  .icon-sky {
    background: rgba(2, 132, 199, 0.12);
    color: #0284c7;
  }

  .icon-purple {
    background: rgba(147, 51, 234, 0.12);
    color: #9333ea;
  }

  .app-title {
    font-size: 1.16rem;
    font-weight: 750;
    color: var(--text-heading);
    margin: 0 0 2px;
  }

  .app-tagline {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin: 0;
  }

  .app-feature-bullets {
    display: flex;
    flex-direction: column;
    gap: 11px;
    flex: 1;
  }

  .feature-bullet {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--text-muted);
  }

  .feature-bullet strong {
    color: var(--text-heading);
    font-weight: 650;
  }

  .feature-bullet i {
    margin-top: 5px;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .check-sky {
    color: #0284c7;
  }

  .check-purple {
    color: #9333ea;
  }

  .feature-bullet code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading);
  }

  :global([data-theme='dark']) .feature-bullet code {
    background: rgba(255, 255, 255, 0.07);
  }

  .app-card-footer {
    margin-top: 20px;
  }

  .btn-app-launch {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 0.92rem;
    font-weight: 650;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-launch-transcribe {
    background: rgba(2, 132, 199, 0.1);
    color: #0284c7;
  }

  .btn-launch-transcribe:hover {
    background: rgba(2, 132, 199, 0.18);
  }

  .btn-launch-dataset {
    background: rgba(147, 51, 234, 0.1);
    color: #9333ea;
  }

  .btn-launch-dataset:hover {
    background: rgba(147, 51, 234, 0.18);
  }

  /* --------------------------------------------------------------------------
     3. Easper Loop
     -------------------------------------------------------------------------- */
  .pipeline-section {
    padding: 44px 0 20px;
  }

  /* --------------------------------------------------------------------------
     4. Where your data goes
     -------------------------------------------------------------------------- */
  .privacy-section {
    padding: 44px 0 0;
  }

  .privacy-card {
    padding: 26px;
    border-radius: 14px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
  }

  @media (min-width: 768px) {
    .privacy-card {
      padding: 32px;
    }
  }

  .privacy-header {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 24px;
  }

  .privacy-icon-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    flex-shrink: 0;
    border-radius: 11px;
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
    font-size: 1.2rem;
  }

  .privacy-heading {
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--text-heading);
    margin: 0 0 6px;
  }

  .privacy-sub {
    font-size: 0.93rem;
    color: var(--text-muted);
    line-height: 1.55;
    margin: 0;
  }

  .privacy-rows {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }

  @media (min-width: 900px) {
    .privacy-rows {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .privacy-row {
    padding: 16px;
    border-radius: 10px;
    border: 1px solid var(--border-color);
    background: var(--bg-hover, #f8fafc);
  }

  :global([data-theme='dark']) .privacy-row {
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .row-label {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 0.88rem;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .row-stays .row-label {
    color: #059669;
  }

  .row-download .row-label {
    color: #0284c7;
  }

  .row-leaves .row-label {
    color: #d97706;
  }

  :global([data-theme='dark']) .row-stays .row-label {
    color: #34d399;
  }

  :global([data-theme='dark']) .row-download .row-label {
    color: #38bdf8;
  }

  :global([data-theme='dark']) .row-leaves .row-label {
    color: #fbbf24;
  }

  .row-text {
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--text-muted);
    margin: 0;
  }
</style>
