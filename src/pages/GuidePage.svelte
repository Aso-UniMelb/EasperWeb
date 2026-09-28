<script>
  import Header from '../components/Header.svelte';
  import { router } from '../services/router.svelte.js';

  let activeSection = $state('transcription');

  const SECTIONS = [
    { id: 'transcription', title: 'Transcription Studio' },
    { id: 'waveform', title: 'Waveform & Boundaries' },
    { id: 'speakers', title: 'Speaker Diarization' },
    { id: 'subtiers', title: 'Translations & Sub-Tiers' },
    { id: 'elan-guidelines', title: 'ELAN Guidelines for ASR' },
    { id: 'dataset-builder', title: 'Dataset Builder' },
    { id: 'field-audio', title: 'Field Recording Tips' },
  ];

  let currentIndex = $derived(
    SECTIONS.findIndex((s) => s.id === activeSection),
  );
  let prevSection = $derived(
    currentIndex > 0 ? SECTIONS[currentIndex - 1] : null,
  );
  let nextSection = $derived(
    currentIndex < SECTIONS.length - 1 ? SECTIONS[currentIndex + 1] : null,
  );

  function setSection(id) {
    activeSection = id;
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
</script>

<Header />

<div class="guide-page-container">
  <!-- Minimalist Hero Header -->
  <header class="guide-hero">
    <h1 class="guide-hero-title">Documentation &amp; Guides</h1>
  </header>

  <!-- Mobile Section Selector Dropdown (Shown on <= 640px) -->
  <div class="mobile-section-picker">
    <label for="mobile-guide-select" class="mobile-picker-label">Section</label>
    <select
      id="mobile-guide-select"
      class="mobile-picker-select"
      value={activeSection}
      onchange={(e) => setSection(e.target.value)}
    >
      {#each SECTIONS as sec}
        <option value={sec.id}>{sec.title}</option>
      {/each}
    </select>
  </div>

  <div class="guide-layout">
    <!-- Sidebar Navigation -->
    <aside class="guide-sidebar" aria-label="Documentation Navigation">
      <nav class="sidebar-nav" aria-label="Sections">
        {#each SECTIONS as sec}
          <button
            type="button"
            class="sidebar-nav-btn {activeSection === sec.id
              ? 'nav-active'
              : ''}"
            onclick={() => setSection(sec.id)}
          >
            <span class="nav-title">{sec.title}</span>
          </button>
        {/each}
      </nav>

      <!-- Clean Sidebar Actions -->
      <div class="sidebar-links-card">
        <button
          type="button"
          class="sidebar-action-link"
          onclick={() => router.navigate('/transcriber')}
        >
          Open Transcriber Studio
        </button>
        <button
          type="button"
          class="sidebar-action-link"
          onclick={() => router.navigate('/dataset-builder')}
        >
          Open Dataset Builder
        </button>
      </div>
    </aside>

    <!-- Main Content Panel -->
    <main class="guide-content-area">
      <!-- 1. TRANSCRIPTION STUDIO -->
      {#if activeSection === 'transcription'}
        <article class="guide-card">
          <h2 class="section-title">Transcription Studio</h2>

          <div class="guide-body-content">
            <div class="topic-block">
              <h3 class="topic-title">The Two-Step Workflow</h3>
              <p class="topic-text">
                Transcribing in Easper follows two structured stages to give you
                full control over timing boundaries and text:
              </p>
              <div class="clean-steps-grid">
                <div class="clean-step-card">
                  <h4 class="step-card-title">Step 1: Speech Detection</h4>
                  <p class="step-card-text">
                    Easper scans the audio and automatically identifies where
                    speech occurs, filtering out background pauses and silence.
                    You can adjust the sensitivity slider to match recording
                    conditions—higher for noisy field settings, or lower for
                    quiet speech.
                  </p>
                </div>
                <div class="clean-step-card">
                  <h4 class="step-card-title">Step 2: AI Transcription</h4>
                  <p class="step-card-text">
                    The speech recognition model transcribes the detected
                    segments into text directly on your device. You can
                    transcribe the entire file at once, or transcribe individual
                    segments one by one as you review.
                  </p>
                </div>
              </div>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">
                Editing Text &amp; Speaker Attribution
              </h3>
              <p class="topic-text">
                Speech recognition models provide a helpful initial draft, but
                human verification remains essential:
              </p>
              <ul class="guide-text-list">
                <li>
                  <strong>Inline Editing</strong>: Click into any transcript
                  card to correct spellings, insert phonemic diacritics, or
                  adjust phrasing. All revisions save automatically.
                </li>
                <li>
                  <strong>Speaker Assignment</strong>: Click the speaker label
                  on any segment to assign the utterance to a different speaker
                  or rename the speaker profile.
                </li>
                <li>
                  <strong>Word Alignment</strong>: Switch to the Word Alignment
                  view to review individual words alongside their exact acoustic
                  timestamps.
                </li>
              </ul>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">
                Writing in Right-to-Left (RTL) Scripts
              </h3>
              <p class="topic-text">
                For languages using Arabic, Hebrew, Sorani Kurdish, or other
                right-to-left scripts, click the LTR / RTL button in the
                toolbar. The text input areas, cursors, and punctuation align
                immediately to right-to-left reading order.
              </p>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Exporting Your Work</h3>
              <p class="topic-text">
                When your review is complete, export your transcript into
                standard formats:
              </p>
              <ul class="guide-text-list">
                <li>
                  <strong>ELAN (.eaf)</strong>: An XML annotation document with
                  linked audio, speaker tiers, and sub-tiers, ready to open in
                  ELAN.
                </li>
                <li>
                  <strong>Subtitles (.srt)</strong>: Standard timed subtitles
                  for video presentations or sharing with speakers.
                </li>
                <li>
                  <strong>Plain Text (.txt)</strong>: A readable transcript
                  document with speaker tags and timestamps.
                </li>
                <li>
                  <strong>Audio (.wav)</strong>: A standardized 16 kHz mono
                  audio file of your recording.
                </li>
              </ul>
            </div>
          </div>

          <!-- Bottom Article Navigation -->
          <nav class="guide-nav-footer" aria-label="Article navigation">
            {#if prevSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-prev"
                onclick={() => setSection(prevSection.id)}
              >
                <span class="nav-dir-label">Previous</span>
                <span class="nav-target-title">{prevSection.title}</span>
              </button>
            {:else}
              <div></div>
            {/if}

            {#if nextSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-next"
                onclick={() => setSection(nextSection.id)}
              >
                <span class="nav-dir-label">Next</span>
                <span class="nav-target-title">{nextSection.title}</span>
              </button>
            {/if}
          </nav>
        </article>

        <!-- 2. WAVEFORM & BOUNDARIES -->
      {:else if activeSection === 'waveform'}
        <article class="guide-card">
          <h2 class="section-title">Waveform &amp; Boundaries</h2>

          <div class="guide-body-content">
            <div class="topic-block">
              <h3 class="topic-title">The Vertical Timeline</h3>
              <p class="topic-text">
                Easper presents audio using a vertical waveform that scrolls
                downward alongside your transcript cards. This arrangement
                mirrors how linguists read interlinear glosses and narrative
                texts, allowing seamless visual synchronization between sound
                and transcription.
              </p>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Listening &amp; Playback Speed</h3>
              <p class="topic-text">
                You can interact directly with the waveform at any point:
              </p>
              <ul class="guide-text-list">
                <li>
                  <strong>Seek Playback</strong>: Click anywhere on the waveform
                  or timeline bar to begin playback from that moment.
                </li>
                <li>
                  <strong>Play Single Utterance</strong>: Click the play button
                  on any segment box or card to hear only that sentence.
                </li>
                <li>
                  <strong>Adjust Speed</strong>: Use the playback speed selector
                  (0.5x to 1.5x) to slow down fast conversational passages or
                  unfamiliar phonetic sequences.
                </li>
              </ul>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Adjusting Boundaries by Hand</h3>
              <p class="topic-text">
                Speech segments appear as colored boxes over the waveform. Hover
                over the top edge to drag the start time, or the bottom edge to
                adjust the end time. Use the zoom slider to magnify the waveform
                for precise placement around consonant bursts and breath onsets.
              </p>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Splitting &amp; Merging Turns</h3>
              <p class="topic-text">
                Right-click anywhere on a segment to open the editing menu:
              </p>
              <ul class="guide-text-list">
                <li>
                  <strong>Split Segment</strong>: Divide a single utterance into
                  two separate segments at the current playhead position.
                </li>
                <li>
                  <strong>Merge with Next</strong>: Join two adjacent segments
                  into one continuous sentence.
                </li>
                <li>
                  <strong>Delete Segment</strong>: Remove false detections
                  caused by coughs or external noises.
                </li>
                <li>
                  <strong>Add Segment</strong>: Drag across empty space on the
                  waveform to manually define a new speech box.
                </li>
              </ul>
            </div>
          </div>

          <!-- Bottom Article Navigation -->
          <nav class="guide-nav-footer" aria-label="Article navigation">
            {#if prevSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-prev"
                onclick={() => setSection(prevSection.id)}
              >
                <span class="nav-dir-label">Previous</span>
                <span class="nav-target-title">{prevSection.title}</span>
              </button>
            {:else}
              <div></div>
            {/if}

            {#if nextSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-next"
                onclick={() => setSection(nextSection.id)}
              >
                <span class="nav-dir-label">Next</span>
                <span class="nav-target-title">{nextSection.title}</span>
              </button>
            {/if}
          </nav>
        </article>

        <!-- 3. SPEAKER DIARIZATION -->
      {:else if activeSection === 'speakers'}
        <article class="guide-card">
          <h2 class="section-title">Speaker Diarization</h2>

          <div class="guide-body-content">
            <div class="topic-block">
              <h3 class="topic-title">Identifying Voices</h3>
              <p class="topic-text">
                Speaker diarization addresses the question of who spoke when.
                Easper analyzes voice acoustic patterns across the recording and
                groups speech intervals into distinct speaker profiles.
              </p>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Operating Modes</h3>
              <div class="clean-steps-grid">
                <div class="clean-step-card">
                  <h4 class="step-card-title">Fresh Diarization</h4>
                  <p class="step-card-text">
                    Best suited for new recordings. Easper detects speech and
                    reconstructs boundary segments whenever conversational turns
                    change between speakers.
                  </p>
                </div>
                <div class="clean-step-card">
                  <h4 class="step-card-title">Diarize Existing Segments</h4>
                  <p class="step-card-text">
                    Best suited when you already have custom boundaries or
                    imported an ELAN file. It assigns speaker labels to your
                    existing segments without shifting any boundary timestamps.
                  </p>
                </div>
              </div>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Practical Recommendations</h3>
              <ul class="guide-text-list">
                <li>
                  <strong>Set the Known Speaker Count</strong>: Specify the
                  expected number of speakers (2 to 5) in the settings panel
                  before running diarization.
                </li>
                <li>
                  <strong>Fast Conversational Overlap</strong>: When speakers
                  interrupt each other frequently, select a shorter diarization
                  window (0.8 seconds) in Settings to capture brief turns.
                </li>
                <li>
                  <strong>Noisy Field Conditions</strong>: For recordings made
                  outdoors or in rooms with reverberation, use a longer window
                  (1.5 seconds) for more reliable voice clustering.
                </li>
              </ul>
            </div>
          </div>

          <!-- Bottom Article Navigation -->
          <nav class="guide-nav-footer" aria-label="Article navigation">
            {#if prevSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-prev"
                onclick={() => setSection(prevSection.id)}
              >
                <span class="nav-dir-label">Previous</span>
                <span class="nav-target-title">{prevSection.title}</span>
              </button>
            {:else}
              <div></div>
            {/if}

            {#if nextSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-next"
                onclick={() => setSection(nextSection.id)}
              >
                <span class="nav-dir-label">Next</span>
                <span class="nav-target-title">{nextSection.title}</span>
              </button>
            {/if}
          </nav>
        </article>

        <!-- 4. TRANSLATIONS & SUB-TIERS -->
      {:else if activeSection === 'subtiers'}
        <article class="guide-card">
          <h2 class="section-title">Translations &amp; Sub-Tiers</h2>

          <div class="guide-body-content">
            <div class="topic-block">
              <h3 class="topic-title">Multi-Layered Documentation</h3>
              <p class="topic-text">
                Field documentation typically requires multiple analytical
                layers: a vernacular transcription, a free translation,
                morphological breakdown, and field notes.
              </p>
              <p class="topic-text">
                In Easper, each project can define up to three dependent
                sub-tiers that remain aligned one-to-one with every utterance.
              </p>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Configuring Sub-Tiers</h3>
              <p class="topic-text">
                Open Project Settings to configure your tiers. You can choose
                from standard presets—such as Translation, Morphology, Gloss,
                Notes, or Phonetic—or provide custom names tailored to your
                community's archiving standards.
              </p>
              <p class="topic-text">
                Each segment card displays input fields for your active
                sub-tiers directly beneath the primary transcription.
              </p>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Archival Compatibility</h3>
              <p class="topic-text">
                When exporting to ELAN, sub-tiers are written as dependent
                reference tiers linked to the primary transcription tier. You
                can open exported files in ELAN or process them using linguistic
                packages like pympi without reformatting.
              </p>
            </div>
          </div>

          <!-- Bottom Article Navigation -->
          <nav class="guide-nav-footer" aria-label="Article navigation">
            {#if prevSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-prev"
                onclick={() => setSection(prevSection.id)}
              >
                <span class="nav-dir-label">Previous</span>
                <span class="nav-target-title">{prevSection.title}</span>
              </button>
            {:else}
              <div></div>
            {/if}

            {#if nextSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-next"
                onclick={() => setSection(nextSection.id)}
              >
                <span class="nav-dir-label">Next</span>
                <span class="nav-target-title">{nextSection.title}</span>
              </button>
            {/if}
          </nav>
        </article>

        <!-- 5. ELAN GUIDELINES FOR ASR -->
      {:else if activeSection === 'elan-guidelines'}
        <article class="guide-card">
          <h2 class="section-title">Preparing ELAN Files for Model Training</h2>

          <div class="guide-body-content">
            <p class="topic-text">
              Speech recognition models learn directly from the text within your
              ELAN tiers. Consistent, well-structured annotations provide the
              strongest foundation for model accuracy.
            </p>

            <div class="topic-block">
              <h3 class="topic-title">Managing Tiers &amp; Length</h3>
              <ul class="guide-text-list">
                <li>
                  <strong>Keep segments under 20 seconds</strong>: Utterances
                  between 3 and 15 seconds provide optimal alignment between
                  text and sound during model training.
                </li>
                <li>
                  <strong>Place overlapping speech on separate tiers</strong>:
                  When speakers talk at the same time, giving each participant
                  their own tier prevents acoustic confusion.
                </li>
              </ul>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Orthography &amp; Formatting</h3>
              <ul class="guide-text-list">
                <li>
                  <strong>Use lowercase consistently</strong>: Speech models do
                  not hear capital letters. Standardize on lowercase text,
                  reserving capitalization strictly for required phonemic
                  distinctions.
                </li>
                <li>
                  <strong>Transcribe verbatim</strong>: Record what was actually
                  spoken, including hesitations and false starts, rather than
                  correcting slips of the tongue.
                </li>
                <li>
                  <strong>Spell out numbers and symbols</strong>: Write "twenty
                  three" rather than "23", and "percent" rather than "%".
                </li>
              </ul>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Markers &amp; Special Codes</h3>
              <ul class="guide-text-list">
                <li>
                  <strong>Uniform non-verbal tags</strong>: Use consistent
                  markers like &lt;laughter&gt; or &lt;cough&gt;, or remove them
                  cleanly in the Dataset Builder prior to training.
                </li>
                <li>
                  <strong>Handle code-switching</strong>: If speakers shift into
                  a trade or colonial language, mark those words or place them
                  on a separate tier to avoid confusing the primary language
                  model.
                </li>
              </ul>
            </div>
          </div>

          <!-- Bottom Article Navigation -->
          <nav class="guide-nav-footer" aria-label="Article navigation">
            {#if prevSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-prev"
                onclick={() => setSection(prevSection.id)}
              >
                <span class="nav-dir-label">Previous</span>
                <span class="nav-target-title">{prevSection.title}</span>
              </button>
            {:else}
              <div></div>
            {/if}

            {#if nextSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-next"
                onclick={() => setSection(nextSection.id)}
              >
                <span class="nav-dir-label">Next</span>
                <span class="nav-target-title">{nextSection.title}</span>
              </button>
            {/if}
          </nav>
        </article>

        <!-- 6. DATASET BUILDER -->
      {:else if activeSection === 'dataset-builder'}
        <article class="guide-card">
          <h2 class="section-title">Dataset Builder</h2>

          <div class="guide-body-content">
            <div class="topic-block">
              <h3 class="topic-title">Creating Speech Datasets</h3>
              <p class="topic-text">
                The Dataset Builder packages your paired ELAN files and audio
                recordings into standardized training archives ready for OpenAI
                Whisper fine-tuning, without requiring command-line scripts or
                server uploads.
              </p>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">The Seven Steps</h3>
              <ul class="guide-text-list">
                <li>
                  <strong>1. Select Files</strong>: Load paired ELAN files and
                  audio recordings. A safety limit of 50 pairs is maintained to
                  keep the browser responsive and stable.
                </li>
                <li>
                  <strong>2. Select Tiers</strong>: Choose which tiers represent
                  the spoken target language.
                </li>
                <li>
                  <strong>3. Target Characters</strong>: Review the unique
                  character inventory and identify accidental symbols.
                </li>
                <li>
                  <strong>4. Issues &amp; Validation</strong>: Automatically
                  check for unaligned annotations, overlapping turns, or
                  segments exceeding maximum duration.
                </li>
                <li>
                  <strong>5. Clean &amp; Replace</strong>: Clean up non-verbal
                  markers or punctuation using customizable text replacement
                  rules.
                </li>
                <li>
                  <strong>6. Review &amp; Splits</strong>: Review total spoken
                  duration and vocabulary size, and configure train, validation,
                  and test splits.
                </li>
                <li>
                  <strong>7. Export</strong>: Download a compressed ZIP package
                  containing sliced 16 kHz audio clips and metadata manifests.
                </li>
              </ul>
            </div>
          </div>

          <!-- Bottom Article Navigation -->
          <nav class="guide-nav-footer" aria-label="Article navigation">
            {#if prevSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-prev"
                onclick={() => setSection(prevSection.id)}
              >
                <span class="nav-dir-label">Previous</span>
                <span class="nav-target-title">{prevSection.title}</span>
              </button>
            {:else}
              <div></div>
            {/if}

            {#if nextSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-next"
                onclick={() => setSection(nextSection.id)}
              >
                <span class="nav-dir-label">Next</span>
                <span class="nav-target-title">{nextSection.title}</span>
              </button>
            {/if}
          </nav>
        </article>

        <!-- 7. FIELD AUDIO TIPS -->
      {:else if activeSection === 'field-audio'}
        <article class="guide-card">
          <h2 class="section-title">Field Recording Recommendations</h2>

          <div class="guide-body-content">
            <div class="topic-block">
              <h3 class="topic-title">Microphone Placement</h3>
              <p class="topic-text">
                Position the microphone 15 to 20 cm (6 to 8 inches) from the
                speaker's mouth. Placing the microphone too far away introduces
                room reverberation; placing it too close causes breath plosives.
                Use a foam windscreen even when recording indoors.
              </p>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Sound Levels</h3>
              <p class="topic-text">
                Adjust input gain so natural speech peaks around -12 dB. Avoid
                letting audio levels reach 0 dB (digital clipping). Distorted
                speech waveforms degrade transcription accuracy.
              </p>
            </div>

            <div class="topic-block">
              <h3 class="topic-title">Background Noise &amp; Environment</h3>
              <p class="topic-text">
                Choose quiet spaces with soft furnishings, rugs, or curtains to
                dampen echo. Point directional microphones away from roads,
                fans, or metal roofs during rain.
              </p>
            </div>
          </div>

          <!-- Bottom Article Navigation -->
          <nav class="guide-nav-footer" aria-label="Article navigation">
            {#if prevSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-prev"
                onclick={() => setSection(prevSection.id)}
              >
                <span class="nav-dir-label">Previous</span>
                <span class="nav-target-title">{prevSection.title}</span>
              </button>
            {:else}
              <div></div>
            {/if}

            {#if nextSection}
              <button
                type="button"
                class="nav-page-btn nav-btn-next"
                onclick={() => setSection(nextSection.id)}
              >
                <span class="nav-dir-label">Next</span>
                <span class="nav-target-title">{nextSection.title}</span>
              </button>
            {/if}
          </nav>
        </article>
      {/if}
    </main>
  </div>
</div>

<style>
  .guide-page-container {
    max-width: 1040px;
    margin: 0 auto;
    padding: 24px 20px 80px 20px;
    width: 100%;
    box-sizing: border-box;
    overflow-x: hidden;
  }

  /* Minimalist Hero Header */
  .guide-hero {
    margin-bottom: 28px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .guide-hero {
    border-bottom-color: #334155;
  }

  .guide-hero-title {
    margin: 0;
    font-size: 1.45rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    letter-spacing: -0.01em;
    line-height: 1.3;
  }

  /* Mobile Section Selector (Hidden on desktop) */
  .mobile-section-picker {
    display: none;
  }

  /* Two-Column Guide Layout */
  .guide-layout {
    display: flex;
    gap: 36px;
    align-items: flex-start;
    width: 100%;
    min-width: 0;
  }

  /* Sidebar Navigation */
  .guide-sidebar {
    width: 230px;
    flex-shrink: 0;
    position: sticky;
    top: 72px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-width: 0;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    min-width: 0;
  }

  .sidebar-nav-btn {
    display: block;
    width: 100%;
    padding: 9px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted, #64748b);
    text-align: left;
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1.4;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }

  .sidebar-nav-btn:hover {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
  }

  .sidebar-nav-btn.nav-active {
    background: var(--bg-hover, #f1f5f9);
    color: var(--text-heading, #0f172a);
    font-weight: 600;
  }

  :global([data-theme='dark']) .sidebar-nav-btn.nav-active {
    background: rgba(255, 255, 255, 0.08);
    color: #f8fafc;
  }

  .nav-title {
    display: block;
  }

  /* Clean Sidebar Links */
  .sidebar-links-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color, #e2e8f0);
  }

  :global([data-theme='dark']) .sidebar-links-card {
    border-top-color: #334155;
  }

  .sidebar-action-link {
    background: transparent;
    border: 1px solid var(--border-color, #cbd5e1);
    color: var(--text-base, #334155);
    padding: 7px 12px;
    border-radius: 6px;
    font-size: 0.82rem;
    text-align: left;
    cursor: pointer;
    line-height: 1.4;
    transition:
      background 0.12s ease,
      border-color 0.12s ease;
  }

  .sidebar-action-link:hover {
    background: var(--bg-hover, #f1f5f9);
    border-color: #94a3b8;
  }

  :global([data-theme='dark']) .sidebar-action-link {
    border-color: #475569;
    color: #cbd5e1;
  }

  :global([data-theme='dark']) .sidebar-action-link:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  /* Main Content Area */
  .guide-content-area {
    flex: 1;
    min-width: 0;
    width: 100%;
    max-width: 100%;
  }

  .guide-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 10px;
    padding: 32px 36px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  :global([data-theme='dark']) .guide-card {
    background: rgba(30, 41, 59, 0.45);
    border-color: #334155;
  }

  .section-title {
    margin: 0 0 24px 0;
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--text-heading, #0f172a);
    line-height: 1.35;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color, #f1f5f9);
  }

  :global([data-theme='dark']) .section-title {
    border-bottom-color: rgba(255, 255, 255, 0.06);
  }

  .guide-body-content {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .topic-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .topic-title {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    margin: 0;
    line-height: 1.4;
  }

  .topic-text {
    margin: 0;
    font-size: 0.94rem;
    line-height: 1.8;
    color: var(--text-base, #334155);
  }

  :global([data-theme='dark']) .topic-text {
    color: #cbd5e1;
  }

  /* Clean Two-Step Cards Grid */
  .clean-steps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin-top: 4px;
    width: 100%;
  }

  .clean-step-card {
    background: var(--bg-hover, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  :global([data-theme='dark']) .clean-step-card {
    background: rgba(30, 41, 59, 0.4);
    border-color: #334155;
  }

  .step-card-title {
    margin: 0;
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    line-height: 1.4;
  }

  .step-card-text {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.75;
    color: var(--text-base, #334155);
  }

  :global([data-theme='dark']) .step-card-text {
    color: #94a3b8;
  }

  /* Clean Text Lists */
  .guide-text-list {
    list-style-type: disc;
    padding-left: 20px;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .guide-text-list li {
    font-size: 0.92rem;
    line-height: 1.75;
    color: var(--text-base, #334155);
  }

  :global([data-theme='dark']) .guide-text-list li {
    color: #cbd5e1;
  }

  .guide-text-list li strong {
    color: var(--text-heading, #0f172a);
    font-weight: 600;
  }

  /* Article Navigation Footer */
  .guide-nav-footer {
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: 16px;
    margin-top: 36px;
    padding-top: 20px;
    border-top: 1px solid var(--border-color, #f1f5f9);
    width: 100%;
  }

  :global([data-theme='dark']) .guide-nav-footer {
    border-top-color: rgba(255, 255, 255, 0.08);
  }

  .nav-page-btn {
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: transparent;
    border: 1px solid var(--border-color, #cbd5e1);
    border-radius: 8px;
    padding: 10px 16px;
    cursor: pointer;
    transition:
      background 0.12s ease,
      border-color 0.12s ease;
    text-align: left;
    max-width: 48%;
  }

  .nav-btn-next {
    margin-left: auto;
    text-align: right;
  }

  .nav-page-btn:hover {
    background: var(--bg-hover, #f1f5f9);
    border-color: #94a3b8;
  }

  :global([data-theme='dark']) .nav-page-btn {
    border-color: #475569;
  }

  :global([data-theme='dark']) .nav-page-btn:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .nav-dir-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .nav-target-title {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-heading, #0f172a);
    line-height: 1.35;
  }

  :global([data-theme='dark']) .nav-target-title {
    color: #f1f5f9;
  }

  /* Responsive Adjustments for Tablets (<= 840px) */
  @media (max-width: 840px) {
    .guide-page-container {
      padding: 20px 16px 60px 16px;
    }

    .guide-layout {
      flex-direction: column;
      gap: 18px;
    }

    .guide-sidebar {
      width: 100%;
      max-width: 100%;
      position: static;
      gap: 0;
    }

    .sidebar-nav {
      flex-direction: row;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      gap: 8px;
      padding: 2px 2px 8px 2px;
      scrollbar-width: none;
    }

    .sidebar-nav::-webkit-scrollbar {
      display: none;
    }

    .sidebar-nav-btn {
      flex-shrink: 0;
      width: auto;
      white-space: nowrap;
      padding: 7px 14px;
      border: 1px solid var(--border-color, #cbd5e1);
      border-radius: 20px;
      font-size: 0.84rem;
      background: var(--bg-card, #ffffff);
    }

    .sidebar-nav-btn.nav-active {
      background: var(--text-heading, #0f172a);
      color: #ffffff;
      border-color: var(--text-heading, #0f172a);
    }

    :global([data-theme='dark']) .sidebar-nav-btn {
      background: rgba(30, 41, 59, 0.6);
      border-color: #334155;
    }

    :global([data-theme='dark']) .sidebar-nav-btn.nav-active {
      background: #f1f5f9;
      color: #0f172a;
      border-color: #f1f5f9;
    }

    .sidebar-links-card {
      display: none;
    }

    .guide-card {
      padding: 24px 20px;
    }
  }

  /* Responsive Adjustments for Mobile Phones (<= 640px) */
  @media (max-width: 640px) {
    .guide-page-container {
      padding: 14px 12px 60px 12px;
    }

    .guide-hero {
      margin-bottom: 14px;
      padding-bottom: 10px;
    }

    .guide-hero-title {
      font-size: 1.25rem;
    }

    /* Show dropdown picker on mobile */
    .mobile-section-picker {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 14px;
      width: 100%;
    }

    .mobile-picker-label {
      font-size: 0.74rem;
      font-weight: 600;
      color: var(--text-muted, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .mobile-picker-select {
      width: 100%;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--border-color, #cbd5e1);
      background-color: var(--bg-card, #ffffff);
      color: var(--text-heading, #0f172a);
      font-size: 0.92rem;
      font-weight: 600;
      line-height: 1.4;
      cursor: pointer;
      outline: none;
      -webkit-appearance: none;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 14px center;
      background-size: 16px;
      padding-right: 40px;
    }

    :global([data-theme='dark']) .mobile-picker-select {
      background-color: #1e293b;
      border-color: #334155;
      color: #f1f5f9;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    }

    /* Stack cards cleanly on mobile */
    .clean-steps-grid {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .guide-card {
      padding: 18px 14px;
      border-radius: 8px;
    }

    .section-title {
      font-size: 1.2rem;
      margin-bottom: 18px;
      padding-bottom: 10px;
    }

    .topic-block {
      gap: 8px;
    }

    .topic-title {
      font-size: 0.98rem;
    }

    .topic-text {
      font-size: 0.9rem;
      line-height: 1.7;
    }

    .guide-text-list {
      padding-left: 18px;
      gap: 8px;
    }

    .guide-text-list li {
      font-size: 0.88rem;
      line-height: 1.65;
    }

    .guide-nav-footer {
      flex-direction: column;
      gap: 10px;
      align-items: stretch;
    }

    .nav-page-btn {
      max-width: 100%;
      width: 100%;
      text-align: center;
      padding: 12px 14px;
    }

    .nav-btn-next {
      text-align: center;
      margin-left: 0;
    }
  }
</style>
