/**
 * Core application lifecycle, PWA, Web Worker, and global status state.
 * Svelte 5 universal reactive module (.svelte.js)
 */

class AppState {
  // System & Environment
  isIsolated = $state(false);
  hardwareConcurrency = $state(4);

  // PWA and Offline
  deferredInstallPrompt = $state(null);
  isInstallable = $state(false);
  isAppInstalled = $state(false);

  // Execution & Status
  isProcessing = $state(false);
  activeAction = $state('transcribe'); // 'transcribe' | 'segment'
  statusMessage = $state('Welcome to Easper!');
  errorMessage = $state('');
  fallbackNotice = $state('');
  downloadProgress = $state(null);

  // Appearance & Theme ('light' | 'dark')
  theme = $state('light');

  // Studio sidebar layout preferences, remembered across sessions
  sidebarCollapsed = $state(false);
  showHelpText = $state(false);

  // Web Worker instance
  worker = null;

  initEnvironment() {
    this.isIsolated =
      typeof window !== 'undefined' && Boolean(window.crossOriginIsolated);
    this.hardwareConcurrency =
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    this.initTheme();
    this.initSidebarPrefs();
  }

  initSidebarPrefs() {
    if (typeof window === 'undefined') return;
    this.sidebarCollapsed =
      localStorage.getItem('easper_sidebar_collapsed') === '1';
    // Help text is off by default unless the user has explicitly turned it on
    this.showHelpText = localStorage.getItem('easper_show_help') === '1';
  }

  /**
   * Forces the setup panel open and remembers it, used when the user lands somewhere
   * that needs the controls — a brand new project has nothing set up yet, so opening
   * to a collapsed rail would hide the whole first step.
   */
  openSidebar() {
    if (!this.sidebarCollapsed) return;
    this.sidebarCollapsed = false;
    if (typeof window !== 'undefined') {
      localStorage.setItem('easper_sidebar_collapsed', '0');
    }
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'easper_sidebar_collapsed',
        this.sidebarCollapsed ? '1' : '0',
      );
    }
  }

  toggleHelpText() {
    this.showHelpText = !this.showHelpText;
    if (typeof window !== 'undefined') {
      localStorage.setItem('easper_show_help', this.showHelpText ? '1' : '0');
    }
  }

  initTheme() {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('easper_theme');
    if (saved === 'dark' || saved === 'light') {
      this.theme = saved;
    } else if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      this.theme = 'dark';
    } else {
      this.theme = 'light';
    }
    document.documentElement.setAttribute('data-theme', this.theme);
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    if (typeof window !== 'undefined') {
      localStorage.setItem('easper_theme', this.theme);
      document.documentElement.setAttribute('data-theme', this.theme);
    }
  }

  async handleInstallApp() {
    if (!this.deferredInstallPrompt) return;
    this.deferredInstallPrompt.prompt();
    try {
      const choice = await this.deferredInstallPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        this.isInstallable = false;
      }
    } catch (err) {
      console.warn('[Main UI] Install prompt error:', err);
    }
    this.deferredInstallPrompt = null;
  }

  /**
   * Resets the global status message and clears errors / progress,
   * invoked when switching between transcription projects or returning to a clean state.
   */
  resetStatus() {
    this.statusMessage = 'Ready';
    this.errorMessage = '';
    this.fallbackNotice = '';
    this.downloadProgress = null;
  }

  handleWorkerProgress(info) {
    if (!info) return;

    // Do not show individual component progress bars in status areas to prevent user anxiety
    this.downloadProgress = null;

    if (info.status === 'download') {
      this.statusMessage = 'Loading model...';
    } else if (info.status === 'initiate' || info.status === 'progress') {
      if (!this.statusMessage || !this.statusMessage.startsWith('Loading')) {
        this.statusMessage = 'Loading model...';
      }
    } else if (info.status === 'ready') {
      this.statusMessage = 'Model ready.';
    }
  }

  handleWorkerError(msg) {
    console.error('[Main UI] Error:', msg);
    this.errorMessage = msg;
    this.statusMessage = `Operation failed: ${msg}`;
    this.isProcessing = false;
  }
}

export const appState = new AppState();
