<script>
  import { appState } from '../../state/appState.svelte.js';
  import { projectState } from '../../state/projectState.svelte.js';
  import { router } from '../../services/router.svelte.js';

  let isMobileMenuOpen = $state(false);

  function toggleMobileMenu() {
    isMobileMenuOpen = !isMobileMenuOpen;
  }
</script>

<header class="landing-header">
  <div class="landing-header-container">
    <!-- Left: Brand Logo & Title -->
    <a
      href="/"
      class="landing-brand"
      onclick={(e) => {
        e.preventDefault();
        router.navigate('/');
      }}
    >
      <div class="brand-icon-wrap">
        <img src="/icon.png" alt="Easper Logo" class="brand-logo-img" />
      </div>
      <div class="brand-text">
        <span class="brand-title">Easper</span>
        <span class="brand-tag">Local-First Speech AI</span>
      </div>
    </a>

    <!-- Center: Desktop Navigation Links -->
    <nav class="landing-nav" aria-label="Main Navigation">
      <button
        type="button"
        class="nav-link"
        onclick={() => projectState.goToWorkspace()}
      >
        <i class="fa-solid fa-microphone nav-link-icon"></i>
        <span>Transcriber</span>
      </button>

      <button
        type="button"
        class="nav-link"
        onclick={() => projectState.goToDataset()}
      >
        <i class="fa-solid fa-database nav-link-icon"></i>
        <span>Dataset Builder</span>
      </button>

      <button
        type="button"
        class="nav-link"
        onclick={() => router.navigate('/models')}
      >
        <i class="fa-solid fa-brain nav-link-icon"></i>
        <span>Models</span>
      </button>

      <button
        type="button"
        class="nav-link"
        onclick={() => router.navigate('/guide')}
      >
        <i class="fa-solid fa-book nav-link-icon"></i>
        <span>Guide</span>
      </button>

      <a
        href="https://arxiv.org/abs/2608.11629"
        target="_blank"
        rel="noopener noreferrer"
        class="nav-link"
        title="Easper: An Accessible ASR Pipeline for Language Documentation (arXiv:2608.11629)"
      >
        <i class="fa-solid fa-graduation-cap nav-link-icon"></i>
        <span>Paper</span>
      </a>

      <a
        href="https://github.com/Aso-UniMelb/Easper"
        target="_blank"
        rel="noopener noreferrer"
        class="nav-link"
        title="View source code on GitHub"
      >
        <i class="fa-brands fa-github nav-link-icon"></i>
        <span>GitHub</span>
      </a>
    </nav>

    <!-- Right: Utility Actions & CTA -->
    <div class="landing-actions">
      {#if appState.isInstallable}
        <button
          type="button"
          class="btn-install-landing"
          onclick={() => appState.handleInstallApp()}
          title="Install Easper as a desktop application"
        >
          <i class="fa-solid fa-download"></i>
          <span>Install</span>
        </button>
      {/if}

      <!-- Theme Switcher -->
      <button
        type="button"
        class="btn-theme-landing"
        onclick={() => appState.toggleTheme()}
        title={appState.theme === 'dark'
          ? 'Switch to light mode'
          : 'Switch to dark mode'}
        aria-label="Toggle light/dark theme"
      >
        {#if appState.theme === 'dark'}
          <i class="fa-solid fa-sun text-amber-400"></i>
        {:else}
          <i class="fa-solid fa-moon text-slate-600"></i>
        {/if}
      </button>

      <!-- Primary App Launch CTA -->
      <button
        type="button"
        class="btn-launch-primary"
        onclick={() => projectState.goToWorkspace()}
      >
        <span>Open Transcriber</span>
        <i class="fa-solid fa-arrow-right"></i>
      </button>

      <!-- Mobile Hamburger Toggle -->
      <button
        type="button"
        class="btn-mobile-menu"
        onclick={toggleMobileMenu}
        aria-label="Toggle navigation menu"
      >
        <i class="fa-solid {isMobileMenuOpen ? 'fa-xmark' : 'fa-bars'}"></i>
      </button>
    </div>
  </div>

  <!-- Mobile Dropdown Navigation -->
  {#if isMobileMenuOpen}
    <div class="mobile-nav-panel">
      <button
        type="button"
        class="mobile-nav-item"
        onclick={() => {
          isMobileMenuOpen = false;
          projectState.goToWorkspace();
        }}
      >
        <i class="fa-solid fa-microphone"></i>
        <span>Transcription Studio</span>
      </button>
      <button
        type="button"
        class="mobile-nav-item"
        onclick={() => {
          isMobileMenuOpen = false;
          projectState.goToDataset();
        }}
      >
        <i class="fa-solid fa-database"></i>
        <span>Dataset Builder</span>
      </button>
      <button
        type="button"
        class="mobile-nav-item"
        onclick={() => {
          isMobileMenuOpen = false;
          router.navigate('/models');
        }}
      >
        <i class="fa-solid fa-brain"></i>
        <span>Models</span>
      </button>
      <button
        type="button"
        class="mobile-nav-item"
        onclick={() => {
          isMobileMenuOpen = false;
          router.navigate('/guide');
        }}
      >
        <i class="fa-solid fa-book"></i>
        <span>User Guide</span>
      </button>
      <a
        href="https://arxiv.org/abs/2608.11629"
        target="_blank"
        rel="noopener noreferrer"
        class="mobile-nav-item"
        onclick={() => {
          isMobileMenuOpen = false;
        }}
      >
        <i class="fa-solid fa-graduation-cap"></i>
        <span>Paper (arXiv:2608.11629)</span>
      </a>
      <a
        href="https://github.com/Aso-UniMelb/Easper"
        target="_blank"
        rel="noopener noreferrer"
        class="mobile-nav-item"
        onclick={() => {
          isMobileMenuOpen = false;
        }}
      >
        <i class="fa-brands fa-github"></i>
        <span>GitHub Repository</span>
      </a>
    </div>
  {/if}
</header>

<style>
  .landing-header {
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border-color);
    backdrop-filter: blur(12px);
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease;
  }

  .landing-header-container {
    max-width: 1240px;
    margin: 0 auto;
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    box-sizing: border-box;
  }

  /* Brand */
  .landing-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    color: var(--text-heading);
    flex-shrink: 0;
  }

  .brand-icon-wrap {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid var(--border-color);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
    box-sizing: border-box;
  }

  :global([data-theme='dark']) .brand-icon-wrap {
    background: #1e293b;
  }

  .brand-logo-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }

  .brand-title {
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.4px;
    color: var(--text-heading);
  }

  .brand-tag {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--primary-color);
    letter-spacing: 0.2px;
  }

  /* Navigation Links */
  .landing-nav {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  @media (max-width: 960px) {
    .landing-nav {
      display: none;
    }
  }

  .nav-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-muted);
    text-decoration: none;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .nav-link:hover {
    color: var(--text-heading);
    background: var(--bg-hover);
  }

  .nav-link-icon {
    font-size: 0.8rem;
    opacity: 0.8;
  }

  /* Right Actions */
  .landing-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .btn-install-landing {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--primary-color);
    background: rgba(2, 132, 199, 0.08);
    border: 1px solid rgba(2, 132, 199, 0.2);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-install-landing:hover {
    background: rgba(2, 132, 199, 0.15);
  }

  .btn-theme-landing {
    width: 34px;
    height: 34px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    background: var(--bg-hover);
    color: var(--text-heading);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.15s ease;
  }

  .btn-theme-landing:hover {
    border-color: var(--primary-color);
  }

  .btn-launch-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 0.86rem;
    font-weight: 600;
    color: #ffffff;
    background: linear-gradient(135deg, #0284c7, #0369a1);
    border: none;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(2, 132, 199, 0.3);
    transition: all 0.15s ease;
  }

  .btn-launch-primary:hover {
    background: linear-gradient(135deg, #0369a1, #075985);
    box-shadow: 0 2px 6px rgba(2, 132, 199, 0.4);
    transform: translateY(-1px);
  }

  /* Mobile menu button */
  .btn-mobile-menu {
    display: none;
    width: 34px;
    height: 34px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    background: var(--bg-hover);
    color: var(--text-heading);
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.95rem;
  }

  @media (max-width: 960px) {
    .btn-mobile-menu {
      display: inline-flex;
    }
    .btn-launch-primary {
      display: none;
    }
  }

  /* Mobile Nav Panel */
  .mobile-nav-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 20px 16px;
    border-top: 1px solid var(--border-color);
    background: var(--bg-card);
  }

  .mobile-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-heading);
    text-decoration: none;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .mobile-nav-item:hover {
    background: var(--bg-hover);
  }
</style>
