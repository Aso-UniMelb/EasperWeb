# Dataset Builder & Whisper Fine-Tuning Pipeline

The **Dataset Builder** in EasperWeb is a specialized 7-step wizard designed to convert ELAN annotation files (`.eaf`) and paired field audio recordings into ready-to-train datasets for OpenAI Whisper.

The entire preparation pipeline runs completely inside the browser, slicing audio into individual 16 kHz mono WAV clips and generating dataset manifests without uploading sensitive language materials to any third-party server.

---

## 1. The 7-Step Preparation Workflow

```
Step 1: Select Files ────────► Ingest and pair .eaf and audio recordings (.wav, .mp3, etc.)
        │
Step 2: Select Tiers ────────► Select transcription and translation tiers per speaker
        │
Step 3: Target Characters ───► Extract character inventory, view token counts & whitelist
        │
Step 4: Issues & Validation ─► Scan & report missing timestamps, long clips, and overlaps
        │
Step 5: Clean & Replace ─────► Filter hesitation markers, bracket tokens, and custom regex
        │
Step 6: Dataset Review ──────► Assess spoken duration, token counts, TTR, and train/val/test splits
        │
Step 7: Export ──────────────► Sliced 16 kHz mono WAV clips + metadata.csv / dataset.jsonl (.zip)
```

### Step 1: Select Files (Ingestion & Pairing)
- **Supported Formats**:
  - Annotations: ELAN XML (`.eaf`)
  - Audio: `.wav`, `.mp3`, `.m4a`, `.ogg`, `.flac`
- **Automatic Matching**: Files with matching base names (e.g., `recording_01.eaf` and `recording_01.wav`) are automatically paired. Users can also manually pair mismatched files using drag-and-drop or file pickers.
- **Safety Limitation (50 Pairs Maximum)**: To prevent browser tab crashes caused by memory exhaustion (due to WebAssembly/V8 heap limits when decoding, buffering, and slicing dozens of large audio files in memory), the Dataset Builder enforces a strict ceiling of **50 paired files** (`.eaf` + audio). Excess files beyond 50 are automatically omitted.

### Step 2: Select Tiers
- Easper scans all ingested `.eaf` documents and extracts every defined tier, grouping them by participant/speaker.
- Users specify:
  - **Speech Transcription Tiers**: The target language orthographic tiers to be used for speech recognition training.
  - **Translation Tiers** (optional): Secondary tiers for multilingual or speech translation objectives.

### Step 3: Target Characters (Inventory & Whitelist)
- Gathers all unique characters across the selected tiers and displays frequency tables (token counts and percentages).
- Allows linguists to review the orthographic inventory, identify errant typography (e.g., unexpected symbols or accidental diacritics), and configure an allowed character whitelist.

### Step 4: Issues & Validation
Automated health checks scan all annotations to identify patterns that degrade Whisper fine-tuning:
- **Empty / Non-Aligned Records**: Annotations lacking start or end timestamps or missing text content.
- **Excessively Long Records**: Utterances exceeding 20 seconds. Segments over 30 seconds exceed Whisper's receptive field and can cause sequence-to-sequence hallucination during training.
- **Overlapping Speech Segments**: Annotations that overlap in time on the same or multiple tiers, alerting the user to potential cross-talk.

### Step 5: Clean & Replace (Strings & Special Tokens)
A powerful normalization and string cleanup interface:
- **Common Preset Markers**: One-click rules to remove or normalize common linguistic field markers:
  - `<hes>` (Hesitation)
  - `<laughter>` / `[laughter]`
  - `<cough>`, `<sigh>`, `<gasp>`
  - `[inaudible]`, `[music]`, `*pause*`
- **Custom Replacements**: Add custom literal string or **Regular Expression (regex)** replacement rules.
- **Rule Management**: Drag-and-drop rule ordering (execution order matters for regex chaining), enable/disable toggles, and TSV rule import.
- **Live Preview**: Inspect real-time diff previews showing matches across all loaded annotations before committing changes.

### Step 6: Dataset Review
Provides a comprehensive overview of corpus statistics:
- Total audio duration and active speech duration.
- Total token count, vocabulary size, and **Type-Token Ratio (TTR)**.
- **Train / Validation / Test Splits**: Configurable split ratios (e.g., 80% train, 10% validation, 10% test) with random seeding to ensure speaker and utterance balance.

### Step 7: Export
Generates a standard training package compressed into a `.zip` archive:
- **Audio Clips**: Individual audio files sliced according to annotation boundaries and converted directly in-browser to **16 kHz mono WAV** format.
- **`metadata.csv`**: Hugging Face `AudioFolder` compatible CSV manifest linking audio file paths to transcriptions.
- **`dataset.jsonl`**: Rich JSON-lines manifest containing clip paths, orthographic transcripts, translations, speaker tags, start/end timestamps, and duration metrics.
- **`character_inventory.json`**: Complete character inventory and frequency map for tokenizer configuration.

The resulting archive is immediately ready for fine-tuning scripts using Hugging Face Transformers, PyTorch, or Google Colab notebooks.

---

## 2. Recommended ELAN Annotation Practices for Whisper

When recording and annotating field materials intended for Whisper fine-tuning, following these guidelines produces substantially higher ASR accuracy:

1. **Keep Segments Short (< 20 Seconds)**:
   - Whisper processes audio in 30-second context windows. Segments between 3 to 15 seconds provide optimal audio-text alignment without exceeding model memory.
2. **Consistent Lower-Case Orthography**:
   - Spoken audio carries no concept of capitalization. Standardize on lowercase text, reserving capital letters strictly for required phonemic distinctions or named entities.
3. **Verbatim Transcription**:
   - Transcribe exactly what was spoken rather than what was intended. Include false starts, partial words, and hesitations. Omitting spoken sounds causes the model to hallucinate or skip words during inference.
4. **Spell Out Numbers and Symbols**:
   - Write `"twenty three"` instead of `"23"`, and `"percent"` instead of `"%"` so acoustic formants map directly to written graphemes.
5. **Separate Overlapping Speech**:
   - When speakers overlap, annotate their utterances on separate tiers assigned to their respective speaker tags rather than combining them into a single tier.
