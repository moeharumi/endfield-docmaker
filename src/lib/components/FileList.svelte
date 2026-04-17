<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import Button from '$lib/components/ui/button/button.svelte';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import XIcon from '@lucide/svelte/icons/x';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import CheckIcon from '@lucide/svelte/icons/check';
  import FileIcon from '@lucide/svelte/icons/file';
  import { getFiles, putFile, renameFile, removeFile, type StoredFile } from '$lib/stores/files';
  import typst, { waitForTypst } from '$lib/typst.svelte';
  import { onMount } from 'svelte';

  let {
    templateId,
    disabled = false,
    label = '',
    onchange
  }: {
    templateId: string;
    disabled?: boolean;
    label?: string;
    onchange?: () => void;
  } = $props();

  let files = $state<StoredFile[]>([]);
  let editingIndex = $state<number | null>(null);
  let editingName = $state('');

  /** Reload files from IndexedDB and sync with Typst VFS. */
  async function reload() {
    files = await getFiles(templateId);
    await syncVFS();
    onchange?.();
  }

  /** Sync all files into Typst's virtual filesystem. */
  async function syncVFS() {
    await waitForTypst();
    for (const f of files) {
      await typst.mapShadow(`/${f.name}`, f.data);
    }
  }

  /** Remove a file from Typst VFS. */
  async function unmapVFS(name: string) {
    try {
      await waitForTypst();
      await typst.unmapShadow(`/${name}`);
    } catch {
      // Ignore if not mapped
    }
  }

  onMount(() => {
    reload();
  });

  // Re-load when template changes
  let prevTemplateId: string | undefined;
  $effect(() => {
    if (prevTemplateId !== undefined && templateId !== prevTemplateId) {
      reload();
    }
    prevTemplateId = templateId;
  });

  function handleAdd() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files) return;
      for (const file of input.files) {
        const data = new Uint8Array(await file.arrayBuffer());
        await putFile(templateId, file.name, data, file.type);
      }
      await reload();
    };
    input.click();
  }

  function startRename(i: number) {
    editingIndex = i;
    editingName = files[i].name;
  }

  async function commitRename(i: number) {
    const old = files[i].name;
    const newName = editingName.trim();
    if (newName && newName !== old) {
      await unmapVFS(old);
      await renameFile(templateId, old, newName);
      await reload();
    }
    editingIndex = null;
  }

  async function handleRemove(i: number) {
    const name = files[i].name;
    await unmapVFS(name);
    await removeFile(templateId, name);
    await reload();
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    {#if label}
      <Label>{label}</Label>
    {/if}
    <Button
      variant="outline"
      size="xs"
      class="cursor-pointer text-xs"
      onclick={handleAdd}
      {disabled}
    >
      <PlusIcon class="size-3" />
      {m.file_add()}
    </Button>
  </div>
  {#if files.length > 0}
    <div class="space-y-1">
      {#each files as file, i (file.id)}
        <div
          class="bg-muted/40 hover:bg-muted/60 flex items-center gap-2 px-2 py-1.5 text-sm transition-colors"
        >
          <FileIcon class="text-muted-foreground size-4 shrink-0" />
          {#if editingIndex === i}
            <Input
              class="h-6 flex-1 px-1 py-0 text-xs"
              value={editingName}
              oninput={(e) => (editingName = e.currentTarget.value)}
              onkeydown={(e) => {
                if (e.key === 'Enter') commitRename(i);
                if (e.key === 'Escape') editingIndex = null;
              }}
              {disabled}
            />
            <Button
              variant="ghost"
              size="sm"
              class="h-6 w-6 shrink-0 cursor-pointer p-0"
              onclick={() => commitRename(i)}
              {disabled}
            >
              <CheckIcon class="size-3.5" />
            </Button>
          {:else}
            <span class="min-w-0 flex-1 truncate text-xs">{file.name}</span>
            <span class="text-muted-foreground shrink-0 text-[10px]">
              {formatSize(file.data.byteLength)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              class="text-muted-foreground h-6 w-6 shrink-0 cursor-pointer p-0"
              onclick={() => startRename(i)}
              {disabled}
            >
              <PencilIcon class="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="text-muted-foreground hover:text-destructive h-6 w-6 shrink-0 cursor-pointer p-0"
              onclick={() => handleRemove(i)}
              {disabled}
            >
              <XIcon class="size-3.5" />
            </Button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
