<script>
  import { audioState } from '../state/audioState.svelte.js';
  import { transcriptState } from '../state/transcriptState.svelte.js';

  /**
   * The single <audio> element backing every playback path in the studio.
   *
   * It lives here, at the workspace root, rather than inside the sidebar panel:
   * there it was unmounted whenever the panel was collapsed, which cleared
   * `audioState.audioElement` and silently killed playback until the panel was
   * reopened. Nothing about it is visual, so it belongs outside any collapsible UI.
   */
</script>

{#if audioState.currentAudioUrl}
  <audio
    style="display: none;"
    bind:this={audioState.audioElement}
    controls
    src={audioState.currentAudioUrl}
    class="audio-player"
    onloadedmetadata={(e) => audioState.handleAudioMetadata(e)}
    ondurationchange={(e) => audioState.handleAudioMetadata(e)}
    ontimeupdate={(e) => {
      audioState.handleAudioTimeUpdate(e);
      if (transcriptState.waveformState) {
        requestAnimationFrame(() => transcriptState.drawVerticalWaveform());
      }
    }}
    onplay={() => {
      if (audioState.audioElement) {
        audioState.audioElement.playbackRate = audioState.playbackSpeed;
      }
      transcriptState.isAudioPlaying = true;
      requestAnimationFrame(() => transcriptState.drawVerticalWaveform());
    }}
    onpause={() => {
      transcriptState.isAudioPlaying = false;
      transcriptState.activeSnippetPlayId = null;
      requestAnimationFrame(() => transcriptState.drawVerticalWaveform());
    }}
    onended={() => {
      transcriptState.isAudioPlaying = false;
      transcriptState.activeSnippetPlayId = null;
      requestAnimationFrame(() => transcriptState.drawVerticalWaveform());
    }}
    onseeking={(e) => {
      audioState.handleAudioTimeUpdate(e);
      if (transcriptState.waveformState) {
        requestAnimationFrame(() => transcriptState.drawVerticalWaveform());
      }
    }}
    onseeked={(e) => {
      audioState.handleAudioTimeUpdate(e);
      if (transcriptState.waveformState) {
        requestAnimationFrame(() => transcriptState.drawVerticalWaveform());
      }
    }}
  ></audio>
{/if}
