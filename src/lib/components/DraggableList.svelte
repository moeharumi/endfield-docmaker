<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
  import XIcon from '@lucide/svelte/icons/x';
  import Button from '$lib/components/ui/button/button.svelte';
  import { slide } from 'svelte/transition';

  let {
    items,
    disabled = false,
    minItems = 1,
    renderItem,
    onchange,
    onremove
  }: {
    items: T[];
    disabled?: boolean;
    /** Remove button is shown when items.length > minItems. Defaults to 1. */
    minItems?: number;
    renderItem: Snippet<[T, number]>;
    onchange?: (items: T[]) => void;
    onremove?: (index: number) => void;
  } = $props();

  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let inputFocused = $state(false);

  function handleDrop(i: number) {
    if (dragIndex !== null && dragIndex !== i) {
      const updated = [...items];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(i, 0, moved);
      onchange?.(updated);
    }
    dragIndex = null;
    dragOverIndex = null;
  }

  function handleRemove(i: number) {
    if (onremove) {
      onremove(i);
    } else {
      const updated = items.filter((_, idx) => idx !== i);
      onchange?.(updated);
    }
  }
</script>

<div onfocusin={() => (inputFocused = true)} onfocusout={() => (inputFocused = false)}>
  {#each items as item, i (i)}
    <div
      class="flex items-center gap-2 transition-colors {dragOverIndex === i &&
      dragIndex !== null &&
      dragIndex !== i
        ? 'bg-muted/60'
        : ''}"
      draggable={!inputFocused && !disabled && items.length > 1}
      ondragstart={(e) => {
        dragIndex = i;
        e.dataTransfer!.effectAllowed = 'move';
      }}
      ondragover={(e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        dragOverIndex = i;
      }}
      ondragleave={() => {
        if (dragOverIndex === i) dragOverIndex = null;
      }}
      ondrop={(e) => {
        e.preventDefault();
        handleDrop(i);
      }}
      ondragend={() => {
        dragIndex = null;
        dragOverIndex = null;
      }}
      role="listitem"
      transition:slide={{ duration: 80 }}
    >
      {#if items.length > 1}
        <span
          class="text-muted-foreground/60 hover:text-muted-foreground flex shrink-0 cursor-grab active:cursor-grabbing"
        >
          <GripVerticalIcon class="size-4" />
        </span>
      {/if}
      <div class="min-w-0 flex-1">
        {@render renderItem(item, i)}
      </div>
      {#if items.length > minItems}
        <Button
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0 cursor-pointer p-0"
          onclick={() => handleRemove(i)}
          {disabled}
        >
          <XIcon class="size-4" />
        </Button>
      {/if}
    </div>
  {/each}
</div>
