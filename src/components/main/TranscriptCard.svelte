<script>
  import { transcriptState } from '../../state/transcriptState.svelte.js';
  import WaveformDualView from './WaveformDualView.svelte';

  let { onWorkerReset } = $props();
</script>

<section
  class="card main-card transcript-card {transcriptState.textDirection === 'rtl'
    ? 'direction-rtl'
    : 'direction-ltr'}"
>
  <WaveformDualView {onWorkerReset} />
</section>

