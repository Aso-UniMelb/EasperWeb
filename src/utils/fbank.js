/**
 * Audio Feature Extraction: 80-channel Log Mel-Filterbank (FBANK)
 *
 * Port of `torchaudio.compliance.kaldi.fbank` defaults, which is the front-end the
 * shipped 3D-Speaker CAM++ speaker model (public/spkrec_ecapa.onnx) was trained with:
 *
 *   Kaldi.fbank(wav * (1 << 15), num_mel_bins=80, sample_frequency=16000, dither=0.0)
 *   feat = feat - feat.mean(dim=0, keepdim=True)
 *
 * Every detail below is load-bearing: the filterbank spans up to Nyquist (not 7600 Hz),
 * triangles are linear in the *Mel* domain, the analysis window is Povey (not Hamming),
 * and DC removal + pre-emphasis are applied per frame (not once over the whole signal).
 * Deviating from any of these shifts the embedding off the model's training distribution.
 *
 * Optimized for high performance in Web Workers using TypedArrays.
 */

// Kaldi / HTK Mel conversion constants
const MEL_SCALE_FACTOR = 1127.0;
const MEL_BREAK_FREQ = 700.0;

// Kaldi floors log-Mel energies at FLT_EPSILON, not an arbitrary 1e-6
const KALDI_LOG_FLOOR = 1.1920928955078125e-07;

function hzToMel(hz) {
  return MEL_SCALE_FACTOR * Math.log(1.0 + hz / MEL_BREAK_FREQ);
}

/**
 * Precomputes triangular Mel filterbank weights, matching Kaldi's `MelBanks`.
 *
 * Triangles are linear in the Mel domain and cover `nFft / 2` FFT bins: Kaldi
 * discards the Nyquist bin, so a 512-point FFT yields 256 usable bins, not 257.
 *
 * @param {number} numFilters Number of Mel filters (default 80)
 * @param {number} nFft FFT size (default 512)
 * @param {number} sampleRate Audio sample rate (default 16000)
 * @param {number} lowFreq Lower frequency bound (default 20 Hz)
 * @param {number} highFreq Upper bound; <= 0 is an offset from Nyquist (Kaldi default 0)
 * @returns {Array<Float32Array>} Array of triangular filter weight vectors of length (nFft / 2)
 */
export function createMelFilterbank(
  numFilters = 80,
  nFft = 512,
  sampleRate = 16000,
  lowFreq = 20.0,
  highFreq = 0.0,
) {
  const numBins = nFft >> 1;
  const nyquist = sampleRate / 2.0;
  const upperFreq = highFreq > 0 ? highFreq : nyquist + highFreq;

  const lowMel = hzToMel(lowFreq);
  const highMel = hzToMel(upperFreq);
  const melStep = (highMel - lowMel) / (numFilters + 1);
  const fftBinWidth = sampleRate / nFft;

  const filterbank = [];
  for (let f = 0; f < numFilters; f++) {
    const leftMel = lowMel + f * melStep;
    const centerMel = lowMel + (f + 1) * melStep;
    const rightMel = lowMel + (f + 2) * melStep;
    const weights = new Float32Array(numBins);

    for (let k = 0; k < numBins; k++) {
      const mel = hzToMel(fftBinWidth * k);
      if (mel > leftMel && mel <= centerMel) {
        weights[k] = (mel - leftMel) / (centerMel - leftMel);
      } else if (mel > centerMel && mel < rightMel) {
        weights[k] = (rightMel - mel) / (rightMel - centerMel);
      }
    }
    filterbank.push(weights);
  }

  return filterbank;
}

/**
 * Kaldi's default analysis window: `(0.5 - 0.5 * cos(2*pi*i/(N-1))) ^ 0.85`.
 * @param {number} size
 * @returns {Float32Array}
 */
export function createPoveyWindow(size) {
  const win = new Float32Array(size);
  const factor = (2.0 * Math.PI) / (size - 1);
  for (let i = 0; i < size; i++) {
    win[i] = Math.pow(0.5 - 0.5 * Math.cos(factor * i), 0.85);
  }
  return win;
}

/**
 * Hamming window, retained for models whose front-end asks for it (e.g. SpeechBrain).
 * @param {number} size
 * @returns {Float32Array}
 */
export function createHammingWindow(size) {
  const win = new Float32Array(size);
  const factor = (2.0 * Math.PI) / (size - 1);
  for (let i = 0; i < size; i++) {
    win[i] = 0.54 - 0.46 * Math.cos(factor * i);
  }
  return win;
}

/**
 * In-place Cooley-Tukey Radix-2 Fast Fourier Transform
 * @param {Float32Array} real Real component buffer (length must be power of 2)
 * @param {Float32Array} imag Imaginary component buffer (same length)
 */
export function fft(real, imag) {
  const n = real.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempR = real[i];
      real[i] = real[j];
      real[j] = tempR;

      const tempI = imag[i];
      imag[i] = imag[j];
      imag[j] = tempI;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Butterfly updates
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (-2.0 * Math.PI) / len;
    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wR = 1.0;
      let wI = 0.0;
      for (let k = 0; k < half; k++) {
        const rIdx = i + k + half;
        const lIdx = i + k;

        const tr = wR * real[rIdx] - wI * imag[rIdx];
        const ti = wR * imag[rIdx] + wI * real[rIdx];

        real[rIdx] = real[lIdx] - tr;
        imag[rIdx] = imag[lIdx] - ti;
        real[lIdx] += tr;
        imag[lIdx] += ti;

        const nextWR = wR * wStepR - wI * wStepI;
        wI = wR * wStepI + wI * wStepR;
        wR = nextWR;
      }
    }
  }
}

// Cached Mel filterbank & analysis window, keyed by the settings that produced them
let cachedFilterbank = null;
let cachedFilterbankKey = '';
let cachedWindow = null;
let cachedWindowKey = '';

/**
 * Extracts 80-dimensional Log Mel-Filterbank (FBANK) features from 16 kHz audio,
 * matching `torchaudio.compliance.kaldi.fbank` with 3D-Speaker's CAM++ settings.
 *
 * @param {Float32Array} audioFloat32 16kHz mono audio signal [-1.0, 1.0]
 * @param {Object} [options]
 * @param {number} [options.sampleRate=16000] Audio sample rate
 * @param {number} [options.frameLengthMs=25] Frame duration in ms (400 samples at 16kHz)
 * @param {number} [options.frameShiftMs=10] Hop size in ms (160 samples at 16kHz)
 * @param {number} [options.numFilters=80] Number of Mel filters
 * @param {number} [options.nFft=512] FFT window size (power of 2 >= frameLength)
 * @param {number} [options.lowFreq=20] Lowest Mel filter edge in Hz
 * @param {number} [options.highFreq=0] Highest Mel filter edge; <= 0 is an offset from Nyquist
 * @param {number} [options.preemphasis=0.97] Pre-emphasis coefficient, applied per frame
 * @param {boolean} [options.removeDcOffset=true] Subtract the per-frame mean before windowing
 * @param {'povey'|'hamming'} [options.windowType='povey'] Analysis window
 * @param {boolean} [options.cmn=true] Subtract the per-utterance mean of each Mel channel
 * @returns {{ features: Float32Array, numFrames: number, numFilters: number }} Flattened [numFrames * 80] Float32Array
 */
export function extractFbank(audioFloat32, options = {}) {
  const {
    sampleRate = 16000,
    frameLengthMs = 25,
    frameShiftMs = 10,
    numFilters = 80,
    nFft = 512,
    lowFreq = 20.0,
    highFreq = 0.0,
    preemphasis = 0.97,
    removeDcOffset = true,
    windowType = 'povey',
    cmn = true,
  } = options;

  if (!audioFloat32 || audioFloat32.length === 0) {
    return { features: new Float32Array(0), numFrames: 0, numFilters };
  }

  const frameSize = Math.round((sampleRate * frameLengthMs) / 1000); // 400
  const frameShift = Math.round((sampleRate * frameShiftMs) / 1000); // 160

  let signal = audioFloat32;
  if (signal.length < frameSize) {
    // Pad short audio with zeros to at least one full frame (Kaldi snip_edges=true)
    const padded = new Float32Array(frameSize);
    padded.set(signal);
    signal = padded;
  }

  const fbKey = `${numFilters}|${nFft}|${sampleRate}|${lowFreq}|${highFreq}`;
  if (!cachedFilterbank || cachedFilterbankKey !== fbKey) {
    cachedFilterbank = createMelFilterbank(numFilters, nFft, sampleRate, lowFreq, highFreq);
    cachedFilterbankKey = fbKey;
  }
  const winKey = `${windowType}|${frameSize}`;
  if (!cachedWindow || cachedWindowKey !== winKey) {
    cachedWindow = windowType === 'hamming'
      ? createHammingWindow(frameSize)
      : createPoveyWindow(frameSize);
    cachedWindowKey = winKey;
  }

  const filterbank = cachedFilterbank;
  const window = cachedWindow;
  const numBins = nFft >> 1;

  // Kaldi operates on 16-bit integer scale; 3D-Speaker feeds it `wav * (1 << 15)`.
  // Only rescale when the caller handed us normalized [-1, 1] audio.
  let maxAbs = 0.0;
  for (let i = 0; i < signal.length; i++) {
    const v = Math.abs(signal[i]);
    if (v > maxAbs) maxAbs = v;
  }
  const scale = maxAbs <= 1.05 && maxAbs > 0.0 ? 32768.0 : 1.0;

  const numFrames = Math.floor((signal.length - frameSize) / frameShift) + 1;
  const features = new Float32Array(numFrames * numFilters);

  // Pre-allocated per-frame buffers
  const frameBuf = new Float64Array(frameSize);
  const fftReal = new Float32Array(nFft);
  const fftImag = new Float32Array(nFft);
  const powerSpectrum = new Float64Array(numBins);

  for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
    const offset = frameIdx * frameShift;

    for (let i = 0; i < frameSize; i++) {
      frameBuf[i] = signal[offset + i] * scale;
    }

    // 1. Per-frame DC offset removal
    if (removeDcOffset) {
      let mean = 0.0;
      for (let i = 0; i < frameSize; i++) mean += frameBuf[i];
      mean /= frameSize;
      for (let i = 0; i < frameSize; i++) frameBuf[i] -= mean;
    }

    // 2. Per-frame pre-emphasis; Kaldi treats x[-1] as x[0], so the first tap is x[0]*(1-coeff)
    if (preemphasis !== 0.0) {
      for (let i = frameSize - 1; i > 0; i--) {
        frameBuf[i] -= preemphasis * frameBuf[i - 1];
      }
      frameBuf[0] -= preemphasis * frameBuf[0];
    }

    // 3. Window and zero-pad to nFft
    fftReal.fill(0);
    fftImag.fill(0);
    for (let i = 0; i < frameSize; i++) {
      fftReal[i] = frameBuf[i] * window[i];
    }

    fft(fftReal, fftImag);

    // 4. Power spectrum |X[k]|^2 over the first nFft/2 bins (Nyquist bin dropped)
    for (let k = 0; k < numBins; k++) {
      powerSpectrum[k] = fftReal[k] * fftReal[k] + fftImag[k] * fftImag[k];
    }

    // 5. Mel filterbank dot-product + log compression
    const outOffset = frameIdx * numFilters;
    for (let f = 0; f < numFilters; f++) {
      const weights = filterbank[f];
      let energy = 0.0;
      for (let k = 0; k < numBins; k++) {
        energy += powerSpectrum[k] * weights[k];
      }
      features[outOffset + f] = Math.log(Math.max(energy, KALDI_LOG_FLOOR));
    }
  }

  // 6. Per-utterance mean normalization of each Mel channel (3D-Speaker's `global-mean`)
  if (cmn && numFrames > 0) {
    for (let f = 0; f < numFilters; f++) {
      let sum = 0.0;
      for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
        sum += features[frameIdx * numFilters + f];
      }
      const mean = sum / numFrames;
      for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
        features[frameIdx * numFilters + f] -= mean;
      }
    }
  }

  return { features, numFrames, numFilters };
}
