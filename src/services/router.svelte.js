/**
 * Universal Client-Side Router for Svelte 5.
 * Supports standard HTML5 History URLs as well as Hash fallback.
 * Routes:
 *   '/' -> 'home'
 *   '/transcriber/:id' -> 'transcriber' (with params.id)
 *   '/transcriber' -> 'transcriber'
 *   '/dataset-builder' -> 'dataset-builder'
 *   '/guide' -> 'guide'
 */

class Router {
  currentRoute = $state('home'); // 'home' | 'transcriber' | 'dataset-builder' | 'guide' | '404'
  params = $state({});
  query = $state({});
  currentPath = $state('/');

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  init() {
    this.handleLocationChange();
    window.addEventListener('popstate', () => this.handleLocationChange());
    window.addEventListener('hashchange', () => this.handleLocationChange());
  }

  /**
   * Extracts clean path from either hash or pathname.
   */
  getPath() {
    if (typeof window === 'undefined') return '/';

    const hash = window.location.hash;
    if (hash && hash.startsWith('#/')) {
      return hash.slice(1); // e.g. '#/transcriber/1' -> '/transcriber/1'
    } else if (hash && hash.startsWith('#') && hash.length > 1) {
      return '/' + hash.slice(1);
    }

    return window.location.pathname || '/';
  }

  /**
   * Parses route from current path and updates reactive properties.
   */
  handleLocationChange() {
    const rawPath = this.getPath();
    const [pathname, queryString] = rawPath.split('?');

    // Parse query params
    const query = {};
    if (queryString) {
      const searchParams = new URLSearchParams(queryString);
      for (const [key, value] of searchParams.entries()) {
        query[key] = value;
      }
    }
    this.query = query;

    // Normalize path
    let normalized = pathname.replace(/\/+$/, '');
    if (!normalized) normalized = '/';
    this.currentPath = normalized;

    // Match routes
    // 1. Home
    if (normalized === '/' || normalized === '') {
      this.currentRoute = 'home';
      this.params = {};
      return;
    }

    // 2. Transcriber: /transcriber/:id or /transcriber
    const transcriberMatch = normalized.match(/^\/transcriber(?:\/([^\/]+))?$/);
    if (transcriberMatch) {
      this.currentRoute = 'transcriber';
      this.params = { id: transcriberMatch[1] || null };
      return;
    }

    // 3. Dataset Builder: /dataset-builder
    if (normalized === '/dataset-builder') {
      this.currentRoute = 'dataset-builder';
      this.params = {};
      return;
    }

    // 4. Models: /models or /model-manager
    if (normalized === '/models' || normalized === '/model-manager') {
      this.currentRoute = 'models';
      this.params = {};
      return;
    }

    // 5. Guide: /guide
    if (normalized === '/guide') {
      this.currentRoute = 'guide';
      this.params = {};
      return;
    }

    // 5. Unknown -> fallback to home
    this.currentRoute = 'home';
    this.params = {};
  }

  /**
   * Programmatic navigation.
   * @param {string} to - Destination path (e.g. '/transcriber/1', '/dataset-builder', '/guide', '/')
   * @param {Object} [options]
   * @param {boolean} [options.replace=false] - Replace history entry instead of pushing
   */
  navigate(to, { replace = false } = {}) {
    if (typeof window === 'undefined') return;

    const targetPath = to.startsWith('/') ? to : `/${to}`;

    // If currently in hash mode, stay in hash mode
    if (window.location.hash && window.location.hash.startsWith('#/')) {
      if (replace) {
        const newUrl = `${window.location.pathname}#${targetPath}`;
        window.location.replace(newUrl);
      } else {
        window.location.hash = targetPath;
      }
    } else {
      if (replace) {
        window.history.replaceState(null, '', targetPath);
      } else {
        window.history.pushState(null, '', targetPath);
      }
      this.handleLocationChange();
    }
  }
}

export const router = new Router();

