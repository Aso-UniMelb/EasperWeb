# Model Management & Compute Runtimes

EasperWeb combines **Transformers.js v3** (`@huggingface/transformers`) and **ONNX Runtime Web** (`onnxruntime-web`) to execute complex speech recognition and audio models directly inside the user's browser with zero cloud latency and complete data privacy.

---

## 1. Hardware Acceleration & Execution Backends

EasperWeb supports two primary execution backends:

```
                          ┌─────────────────────────────┐
                          │   Execution Device Selector │
                          │     (Auto / WebGPU / WASM)  │
                          └──────────────┬──────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
     ┌────────────────────────┐                     ┌────────────────────────┐
     │  WebGPU Acceleration   │                     │ Multi-Threaded WASM    │
     │  • WGSL MatMulNBits    │                     │ • SIMD Vectorization   │
     │  • Near-native GPU     │                     │ • Multi-core threading │
     │  • Q4 / FP32 / FP16    │                     │ • INT8 (q8) / FP32     │
     └────────────────────────┘                     └────────────────────────┘
```

### WebGPU Acceleration
- **Backend**: Hardware-accelerated WebGPU WGSL shaders.
- **Benefits**: Substantial speedup over CPU inference, enabling fast local transcription of long audio recordings.
- **Availability**: Supported out-of-the-box in modern Chromium browsers (Google Chrome, Microsoft Edge, Brave) and WebGPU-enabled builds of Firefox and Safari.
- **Precision Configuration**: Uses **Q4** (`MatMulNBits`) or **FP32** / **FP16** weights.

### Multi-Threaded WebAssembly (WASM CPU) with SIMD
- **Backend**: ONNX Runtime WebAssembly with 128-bit SIMD vector instructions.
- **Multi-Threading**: Leverages Web Workers and `SharedArrayBuffer` to distribute tensor operations across all available physical CPU cores (`navigator.hardwareConcurrency`).
- **Cross-Origin Isolation**: Requires the following HTTP response headers (configured in `vite.config.js` for development and production preview):
  ```http
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
- **Fallback**: If cross-origin isolation is not supported or active, the runtime automatically falls back to single-threaded WASM execution without throwing runtime errors.

### Device Selection Modes
Users can select the compute backend in the **Speech Recognition Settings** panel:
- **Auto (WebGPU preferred)**: Automatically detects if WebGPU is available on the current device. If so, initializes the pipeline on WebGPU; otherwise, smoothly falls back to multi-threaded CPU WASM.
- **WebGPU**: Explicitly requests the GPU backend. If the GPU adapter fails to compile shaders or runs out of memory, it reports the issue and falls back to WASM CPU.
- **CPU (WASM multi-threaded)**: Forces execution on the CPU, ideal for devices with integrated GPUs or when running in environments where WebGPU is constrained.

---

## 2. Quantization Strategy & Architecture Safeguards

EasperWeb applies specialized precision mapping depending on the chosen execution backend:

### WebGPU: Hybrid FP32 Encoder + Q4 Decoder
Hugging Face Whisper models running on WebGPU use a hybrid precision configuration:
```javascript
{ encoder_model: 'fp32', decoder_model_merged: 'q4' }
```

> [!NOTE]
> **WebGPU INT8 Decoder Issue (#1317)**:
> In current WebGPU WGSL shader implementations, running 8-bit quantized (`q8` / INT8) decoders causes numerical instability in the attention logits calculation. This results in Whisper falling into infinite repetition loops of gibberish tokens.
> By utilizing a 4-bit (`q4`) decoder with WGSL `MatMulNBits` acceleration alongside an FP32 encoder, Easper achieves both peak GPU performance and correct attention decoding.

### WASM CPU: 8-Bit Quantized INT8 (`q8`)
On multi-threaded WASM CPU, 8-bit quantization (`q8`) is used by default. CPU SIMD extensions (AVX2/AVX-512/NEON) execute INT8 matrix multiplications efficiently with minimal memory overhead.

### Local Folder Model Automatic Routing
When a user loads a local model from disk:
1. If the model includes `_q4` or `q4.onnx` weights, it runs accelerated on WebGPU.
2. If the model contains unquantized (`fp32` / `fp16`) weights, it executes on WebGPU without hitting quantization artifacts.
3. If the model contains only INT8 (`_q8` or `quantized.onnx`) weights without a Q4 equivalent, Easper automatically routes inference to multi-threaded WASM CPU to avoid the WebGPU shader bug, notifying the user in the status bar.

---

## 3. Pre-Configured Hub Models & Presets

Easper provides one-click presets for standard multilingual Whisper models hosted on Hugging Face Hub:

| Model Preset | Hub Model ID | Approximate Size | Recommended Backend | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Whisper-base** | `onnx-community/whisper-base` | ~274 MB | WebGPU or WASM CPU | Fast transcription with balanced accuracy, suitable for resource-constrained devices. |
| **Whisper-small** | `onnx-community/whisper-small` | ~799 MB | WebGPU or WASM CPU | Higher accuracy for varied accents, lower-resource languages, and background noise. |

Both presets support **offline caching**: once downloaded, they are permanently stored in the browser's CacheStorage (`transformers-cache`) and require no further internet access.

---

## 4. Custom Local Models via File System Access API

Linguists working with fine-tuned Whisper models can load models directly from a folder on their local file system:

1. In the **Model Manager** (`/models`), select **Load Local Model Folder**.
2. Select the directory containing the exported ONNX model files.
3. Easper mounts the directory into a virtual in-memory cache (`LocalFolderCache` in `src/worker.js`).

### Expected File Structure
A typical fine-tuned ONNX Whisper export contains:
```
my-whisper-model/
├── config.json
├── preprocessor_config.json
├── tokenizer.json
├── vocab.json
├── encoder_model.onnx (or encoder_model_quantized.onnx)
└── decoder_model_merged.onnx (or decoder_model.onnx / decoder_model_merged_quantized.onnx)
```

### Flexible Model Resolution
`LocalFolderCache` provides smart resolution heuristics:
- **Decoder Fallback**: If Transformers.js requests `decoder_model_merged.onnx` but your export contains `decoder_model.onnx`, Easper automatically matches and binds the file.
- **Quantization Matching**: Distinguishes between unquantized and quantized variants (`_q8`, `_q4`).
- **Synthetic Configurations**: If optional metadata files (e.g., `generation_config.json`, `special_tokens_map.json`) are absent in the local folder, Easper returns empty JSON structures to prevent unnecessary fallback fetches to external servers.

---

## 5. Client Storage & Cache Architecture

EasperWeb uses browser storage APIs to maintain complete persistence across sessions:

- **Browser CacheStorage**:
  - `transformers-cache`: Whisper neural network weights and tokenizers.
  - `silero-vad-cache-v1`: Silero VAD v5 ONNX model (~2.2 MB).
  - `speaker-diarizer-cache-v2`: 3D-Speaker CAM++ model (~29.6 MB).
- **IndexedDB (`easper_db`)**:
  - `projects`: Project metadata, dialogue segments, sub-tier annotations, and audio references.
  - `audio`: 16 kHz mono WAV audio Blobs.
  - `asr_models`: Metadata records for custom loaded models.
  - `asr_model_files`: Serialized custom model files stored locally in browser storage.
- **Telemetry & Quota Monitoring**:
  The global footer continuously queries `navigator.storage.estimate()` to display current storage usage and ensure ample disk space remains for audio projects.
