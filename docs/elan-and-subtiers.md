# ELAN Integration, Sub-Tiers & Export Workflows

Interoperability with existing linguistic archives is a core design pillar of **EasperWeb**. Field linguists frequently manage extensive collections of annotations created in [ELAN](https://archive.mpi.nl/tla/elan) (Max Planck Institute for Psycholinguistics).

EasperWeb provides bidirectional integration with ELAN XML documents (`.eaf`), supporting multi-speaker tier structures, dependent analytical sub-tiers, and multiple export formats.

---

## 1. Importing Existing ELAN Files into Transcriber Projects

Linguists can import existing `.eaf` files alongside paired audio directly into an active project in the Transcriber Studio:

1. Click **Import ELAN (.eaf)** in the project header or the Project Manager modal.
2. Select or drag-and-drop the `.eaf` file and the corresponding audio recording (`.wav`, `.mp3`, `.m4a`, `.ogg`, `.flac`).
3. Easper parses the XML structure (`src/utils/elanParser.js`) and extracts:
   - Media file descriptors and linked audio references.
   - Time slots and time orders.
   - Speaker/participant tier definitions and alignments.
   - Linguistic types and stereotype constraints.
4. **Interactive Tier Mapping**:
   - The user selects which tiers represent primary speech transcriptions for each speaker.
   - Easper automatically suggests dependent tiers (e.g., translation, gloss, notes) based on naming conventions.
5. On import, all segment boundaries, speaker tags, and transcripts are populated into the Vertical Waveform Timeline and stored in IndexedDB.

---

## 2. Multi-Speaker Tiers & Dependent Sub-Tiers

Field recordings rarely consist of a single layer of transcription. Linguists typically annotate utterances across multiple parallel layers—such as free translation, morphological breakdown, and linguistic glossing.

### The Sub-Tier System (`src/utils/subTiers.js`)
In EasperWeb, each project can define up to **3 dependent sub-tiers** that align one-to-one with parent utterance segments:

- **Configurable Names & Presets**:
  - `Translation`
  - `Morphology`
  - `Gloss`
  - `Notes`
  - `Phonetic`
- **UI Editing**:
  In each Segment card, input fields are provided for the primary orthographic transcription as well as each active sub-tier.
- **Data Model**:
  Each segment object maintains a `subTexts` dictionary keyed by the stable numeric sub-tier ID (`1`, `2`, `3`), preserving independent revisions.

---

## 3. Supported Export Formats

EasperWeb provides a comprehensive suite of export formats tailored for linguistic archiving, subtitling, and downstream natural language processing:

```
                            ┌────────────────────────┐
                            │    Export Actions      │
                            └───────────┬────────────┘
                                        │
     ┌──────────────┬───────────────────┼───────────────────┬──────────────┐
     ▼              ▼                   ▼                   ▼              ▼
┌─────────┐   ┌───────────┐       ┌───────────┐       ┌───────────┐  ┌───────────┐
│  .eaf   │   │   .srt    │       │   .txt    │       │   .json   │  │   .wav    │
│  ELAN   │   │ Subtitles │       │ Plaintext │       │ Structured│  │ Resampled │
└─────────┘   └───────────┘       └───────────┘       └───────────┘  └───────────┘
```

### 1. ELAN Annotation Document (`.eaf`)
- **Specification**: Fully compliant with ELAN 2.8 / 3.0 XML schema and compatible with python libraries like `pympi-ling`.
- **Hierarchical Tier Preservation**:
  - Primary speech annotations are written as `ALIGNABLE_ANNOTATION` entries linked to time slots on `default-lt` linguistic type tiers.
  - Dependent sub-tiers (Translation, Gloss, etc.) are written as `REF_ANNOTATION` entries linked to their parent annotation ID on `dependent-lt` tiers.
- **Media Linking**: Automatically incorporates the relative path and MIME type of the associated audio recording.

### 2. SubRip Subtitles (`.srt`)
- Formats segment boundaries into standard subtitle timing:
  ```
  1
  00:00:01,200 --> 00:00:04,500
  [Speaker 1] This is an transcribed sentence.
  ```
- Suitable for video subtitling, documentary film production, and media players.

### 3. Plain Text (`.txt`)
- Generates a clean text document with timestamps and speaker attribution tags:
  ```
  [00:01.20 - 00:04.50] Speaker 1: This is an transcribed sentence.
  ```
- Includes instant Left-to-Right (LTR) and Right-to-Left (RTL) formatting support for scripts such as Arabic, Hebrew, or Sorani Kurdish.

### 4. Structured JSON Payload (`.json`)
- Exports complete raw project data including:
  - Audio file metadata and sampling parameters.
  - Segment boundary timestamps (seconds and milliseconds).
  - Speaker identifiers and color assignments.
  - Sub-tier values.
  - Whisper confidence metrics and word/token-level alignments (when word timestamps are enabled).

### 5. Resampled 16 kHz Audio (`.wav`)
- Exports the project's audio resampled to clean 16 kHz mono WAV.
- Highly useful when the user recorded directly from a browser microphone or uploaded audio in non-standard compression formats (`.mp3`, `.m4a`, `.ogg`, `.flac`).
