# Speaker Diarization Architecture & Parameter Tuning

EasperWeb includes a high-precision, client-side speaker diarization engine designed for multi-speaker field recordings, interviews, and dialogue documentation. The engine runs 100% locally in the browser using WebAssembly (WASM) without any server calls or external API dependencies.

---

## 1. Pipeline Architecture

The diarization pipeline processes raw 16 kHz mono audio through five stages:

```
Raw Audio (16 kHz Mono)
      │
      ▼
Silero VAD v5 / Pre-existing Segments
      │
      ▼
Sliding-Window Sub-Segmentation (default: window = 1.0s, period = 0.5s)
      │
      ▼
Kaldi 80-Channel Log Mel-Filterbank Extraction (x32768 PCM scale, CMN)
      │
      ▼
3D-Speaker CAM++ ONNX Neural Network (512-dimensional L2-normalized embeddings)
      │
      ▼
Agglomerative Hierarchical Clustering (AHC Average Linkage, Cosine Distance)
      ├──► Mode A (Fresh Diarization): Reconstruct speaker-bounded turns & resolve overlaps
      └──► Mode B (Diarize Segments): Multi-window majority voting per segment
      │
      ▼
Temporal Label Smoothing & Segment Cleanup
      │
      ▼
IndexedDB & Reactive UI State Persistence
```

---

## 2. Feature Extraction & Front-End

- **Module**: [`src/utils/fbank.js`](../src/utils/fbank.js)
- **Standard**: Matched to the Kaldi / 3D-Speaker filterbank implementation.
- **Audio Scaling (`32768.0`)**: Normalized $[-1.0, 1.0]$ floating-point audio is scaled to 16-bit signed PCM range before STFT. This prevents low-amplitude speech formants from hitting the logarithmic floor before Cepstral Mean Normalization.
- **STFT Parameters**:
  - `frameLengthMs = 25` (400 samples at 16 kHz)
  - `frameShiftMs = 10` (160 samples at 16 kHz)
  - `dither = 0.0`
  - `preemphasisCoefficient = 0.97`
- **Filterbank**: 80 triangular Mel filter channels spanning 20 Hz to 8000 Hz.
- **Cepstral Mean Normalization (CMN)**: Computed per window across time frames to eliminate channel bias and room reverberation.

---

## 3. Speaker Embedding Model & ONNX Runtime Requirements

- **Model**: Bundled as `public/spkrec_ecapa.onnx` (~29.6 MB).
- **Architecture**: **3D-Speaker CAM++** (`speech_campplus_sv_en_voxceleb_16k`, producing 512-dimensional output embeddings), *not* SpeechBrain ECAPA-TDNN (192-d). The Kaldi filterbank in `src/utils/fbank.js` is matched to this architecture.
- **L2 Normalization**: All raw embedding vectors are normalized to unit length before clustering (`l2Normalize`).

### Critical Runtime Fix: ONNX Runtime Web >= 1.30.0

EasperWeb pins `onnxruntime-web` to **1.30.0** in `package.json` (`overrides` and `resolutions`).

> [!IMPORTANT]
> **The `AveragePool` Kernel Bug**:
> The 52 Context-Aware Masking (CAM) layers in the CAM++ ONNX graph each contain an `AveragePool` node configured with `kernel_shape=[100]`, `strides=[100]`, `ceil_mode=1`. When sliding-window sub-segments contain fewer than 100 frames (a 1.0 s window produces ~98 frames), `onnxruntime-web` version 1.22 divided by the fixed kernel size (`100`) instead of the actual number of frames ($T$), artificially scaling each CAM mask by $100 / T$.
>
> Because $T$ varies with window length and boundary cropping, turns from the same speaker of differing lengths were pushed further apart in cosine distance than turns from different speakers of similar lengths.
>
> Upgrading to `onnxruntime-web` >= 1.30 resolved the pooling divisor bug, restoring robust clustering separation.

---

## 4. Clustering & Assignment Modes

- **Module**: [`src/utils/diarization.js`](../src/utils/diarization.js)
- **Algorithm**: Agglomerative Hierarchical Clustering (AHC) using **average linkage** over pairwise **cosine distances** ($1.0 - \mathbf{u} \cdot \mathbf{v}$).
- **Target Clusters ($K$)**: Explicitly set by the user ($K \in [2..5]$). When speaker count is set to `1`, diarization is disabled and all speech is assigned to the primary speaker.

### Dual Operating Modes

1. **Mode A: Fresh Diarization & Boundary Reconstruction**
   - Silero VAD detects broad speech regions.
   - Speech regions are sliced into overlapping sliding windows (`windowSec = 1.0s`, `periodSec = 0.5s`).
   - Slices are clustered globally into $K$ speaker groups.
   - Adjacent windows with the same speaker label are merged into coherent dialogue turns (`reconstructSegmentsFromWindows`).
   - A temporal smoothing heuristic (`smoothSpeakerLabels`) reassigns isolated single-window flutters flanked by identical speaker turns.
   - Post-cleanup (`segmentsCleanup`) removes short residual silence gaps and resolves boundary collisions.

2. **Mode B: Diarize Existing Segments (Majority Voting)**
   - Used when segments have already been transcribed, imported from ELAN (`.eaf`), or adjusted manually.
   - Each segment is sliced into internal sub-windows, and embeddings are computed for each slice.
   - Global AHC clusters all sub-windows across all segments.
   - Each segment is assigned a speaker via multi-window majority voting (`majorityVoteSpeaker`), preserving existing boundaries and transcripts.

---

## 5. Parameter Reference & Defaults

Settings can be adjusted interactively in the Transcriber **Settings** panel (`SegmentationSettingsPanel.svelte`) or reset to defaults via `transcriptState.resetVadDiarizationDefaults()`.

| Parameter | Default | UI Range | Code Variable (`VAD_DEFAULTS`) | Description |
| :--- | :--- | :--- | :--- | :--- |
| **VAD Speech Threshold** | `0.50` | `0.20 – 0.80` | `vadThreshold` | Silero VAD speech probability threshold. Higher values reduce false positives in noisy audio. |
| **VAD Speech Padding** | `60 ms` | `20 – 200 ms` | `vadSpeechPadMs` | Buffer added to the beginning and end of each detected speech chunk to avoid clipping consonants. |
| **VAD Min Silence Pause** | `300 ms` | `100 – 1000 ms` | `vadMinSilenceMs` | Minimum duration of silence required to split continuous speech into separate intervals. |
| **Min Segment Duration** | `0.4 s` | `0.2 – 2.0 s` | `vadMinSegmentS` | Segments shorter than this threshold are filtered out as acoustic flutter or noise. |
| **Min Silence Gap (Merge)**| `0.5 s` | `0.1 – 2.0 s` | `vadMinSilenceS` | Silence intervals shorter than this threshold between same-speaker turns are merged. |
| **Max Segment Duration** | `25 s` | `10 – 45 s` | `vadMaxSegmentS` | Upper limit for segment length before splitting, ensuring optimal context size for Whisper. |
| **Speaker Count ($K$)** | `1` | `1 – 5` | `diarizationSpeakerCount` | Number of distinct speakers. `1` disables diarization; `2–5` activates the clustering pipeline. |
| **Diarization Window** | `1.0 s` | `0.5 – 3.0 s` | `diarizationWindowS` | Duration of each sliding window for speaker embedding extraction. |
| **Diarization Step / Period**| `0.5 s` | `0.1 – 1.5 s` | `diarizationPeriodS` | Hop size between successive sliding windows (default: 50% overlap). |

---

## 6. Parameter Tuning Guide for Field Recordings

Depending on recording conditions, adjust parameters in the Settings panel:

### Rapid Conversational Turns & Overlapping Speech
- **Window**: Decrease to `0.8 s`
- **Step / Period**: Decrease to `0.25 s` or `0.35 s`
- *Effect*: Denser sampling points place speaker split points closer to exact conversational handoffs.

### High Background Noise / Wind / Echo
- **Window**: Increase to `1.5 s`
- **VAD Speech Threshold**: Increase to `0.60 – 0.70`
- *Effect*: Longer windows supply a higher signal-to-noise ratio per embedding vector, and a stricter VAD threshold rejects environmental background noise.

### Brief Utterances & Interjections
- **Min Segment Duration**: Decrease to `0.3 s`
- **VAD Min Silence Pause**: Decrease to `200 ms`
- *Effect*: Captures short linguistic responses (e.g., affirmations, brief backchannels).

### Restoring Factory Settings
- Click **Reset to Defaults** in the Settings panel at any time to restore `VAD_DEFAULTS`.
