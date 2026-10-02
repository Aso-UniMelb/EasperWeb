<script>
  import { projectState } from '../../state/projectState.svelte.js';

  /**
   * Key to the text columns in each segment row, and the control for arranging them.
   *
   * Drag a chip to move that column; click one to collapse or restore it. Both are
   * stored on the project, so the arrangement is the same after a reload and matches
   * what the segment rows show. Collapsing is a viewing convenience only — every
   * column is still written to .eaf, .txt and .srt, because an export that silently
   * dropped a translation the user had collapsed would lose their work.
   */
  let { columns = [] } = $props();

  let dragKey = $state(null);
  let overKey = $state(null);
  // A drag ends with a click event on the chip; without this the drop would also
  // toggle the column's visibility.
  let suppressClick = $state(false);

  const keys = $derived(columns.map((c) => c.key));
  const hiddenKeys = $derived(
    columns.filter((c) => c.hidden).map((c) => c.key),
  );

  function onDragStart(e, key) {
    dragKey = key;
    suppressClick = true;
    e.dataTransfer.effectAllowed = 'move';
    // Firefox will not start a drag without payload
    try {
      e.dataTransfer.setData('text/plain', key);
    } catch {}
  }

  function onDragOver(e, key) {
    if (dragKey === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    overKey = key;
  }

  async function onDrop(e, key) {
    e.preventDefault();
    const from = dragKey;
    dragKey = null;
    overKey = null;
    if (from === null || from === key) return;
    await projectState.moveColumn(keys, from, keys.indexOf(key));
  }

  function onDragEnd() {
    dragKey = null;
    overKey = null;
    // Released after the click that follows the drop
    setTimeout(() => (suppressClick = false), 0);
  }

  async function onToggle(key) {
    if (suppressClick) return;
    await projectState.toggleColumnVisibility(keys, key, hiddenKeys);
  }

  async function nudge(e, key, delta) {
    // Alt+arrows give the same reordering without a pointer
    if (!e.altKey) return;
    e.preventDefault();
    await projectState.moveColumn(keys, key, keys.indexOf(key) + delta);
  }
</script>

<div class="tier-legend" role="group" aria-label="Segment text columns">
  <span class="tier-legend-label">Columns</span>

  {#each columns as col, i (col.key)}
    <button
      type="button"
      class="tier-chip"
      class:chip-main={col.isMain}
      class:is-hidden={col.hidden}
      class:is-dragging={dragKey === col.key}
      class:is-over={overKey === col.key && dragKey !== col.key}
      draggable="true"
      ondragstart={(e) => onDragStart(e, col.key)}
      ondragover={(e) => onDragOver(e, col.key)}
      ondrop={(e) => onDrop(e, col.key)}
      ondragend={onDragEnd}
      onclick={() => onToggle(col.key)}
      onkeydown={(e) => {
        if (e.key === 'ArrowLeft') nudge(e, col.key, -1);
        else if (e.key === 'ArrowRight') nudge(e, col.key, 1);
      }}
      aria-pressed={!col.hidden}
      title={(col.hidden
        ? `${col.name} is hidden — click to show it again`
        : `Click to hide the ${col.name} column`) +
        `\nDrag, or Alt+← / Alt+→, to move it (position ${i + 1} of ${columns.length})`}
    >
      <i class="fa-solid fa-grip-vertical grip"></i>
      {#if col.type === 'word'}
        <i
          class="fa-solid fa-tags"
          style="font-size: 0.6rem; opacity: 0.7;"
          title="Word/Morpheme tier"
        ></i>
      {/if}
      <span class="chip-name">{col.name}</span>
      {#if col.hidden}
        <i class="fa-solid fa-eye-slash chip-eye"></i>
      {/if}
    </button>
  {/each}

  <span class="tier-legend-hint">drag to reorder &middot; click to hide</span>
</div>

<style>
  .tier-legend {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }

  .tier-legend-label {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted, #64748b);
  }

  .tier-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border: 1px solid transparent;
    border-radius: 9px;
    font-size: 0.68rem;
    font-weight: 600;
    font-style: italic;
    color: var(--text-muted, #64748b);
    background: rgba(148, 163, 184, 0.16);
    cursor: grab;
    transition:
      opacity 0.12s ease,
      background 0.12s ease,
      border-color 0.12s ease;
  }

  .tier-chip:hover {
    background: rgba(148, 163, 184, 0.26);
  }

  .tier-chip:focus-visible {
    outline: 2px solid var(--primary-color, #0284c7);
    outline-offset: 1px;
  }

  .chip-main {
    font-style: normal;
    color: var(--primary-color, #0284c7);
    background: rgba(2, 132, 199, 0.12);
  }

  .chip-main:hover {
    background: rgba(2, 132, 199, 0.2);
  }

  :global([data-theme='dark']) .chip-main {
    color: #7dd3fc;
    background: rgba(56, 189, 248, 0.16);
  }

  .is-hidden {
    opacity: 0.5;
    text-decoration: line-through;
  }

  .is-dragging {
    opacity: 0.4;
    cursor: grabbing;
  }

  /* Marks the slot the dragged chip would land in */
  .is-over {
    border-color: var(--primary-color, #0284c7);
    background: rgba(2, 132, 199, 0.22);
  }

  .grip {
    font-size: 0.6rem;
    opacity: 0.55;
  }

  .chip-eye {
    font-size: 0.6rem;
  }

  .chip-name {
    white-space: nowrap;
  }

  .tier-legend-hint {
    font-size: 0.62rem;
    color: var(--text-muted, #94a3b8);
    opacity: 0.8;
  }

  /* The header bar wraps; on tight widths the hint is the first thing to go */
  @media (max-width: 900px) {
    .tier-legend-hint {
      display: none;
    }
  }
</style>
