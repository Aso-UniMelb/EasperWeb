/**
 * Svelte action to automatically resize a textarea to fit its content
 */
export function autoResize(node) {
  if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content')) {
    // Native field-sizing: content is supported; do not specify height so it grows natively with content
    return;
  }
  const resize = () => {
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  };
  node.addEventListener('input', resize);
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(resize);
  } else {
    setTimeout(resize, 0);
  }
  return {
    update() {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(resize);
      } else {
        setTimeout(resize, 0);
      }
    },
    destroy() {
      node.removeEventListener('input', resize);
    },
  };
}

