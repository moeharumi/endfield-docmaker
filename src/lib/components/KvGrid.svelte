<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import Button from '$lib/components/ui/button/button.svelte';
  import DraggableList from '$lib/components/DraggableList.svelte';
  import PlusIcon from '@lucide/svelte/icons/plus';

  export type KvEntry = { key: string; value: string };

  let {
    value = $bindable<KvEntry[]>([]),
    disabled = false,
    label = '',
    onchange
  }: {
    value: KvEntry[];
    disabled?: boolean;
    label?: string;
    onchange?: (value: KvEntry[]) => void;
  } = $props();

  function addEntry() {
    value = [...value, { key: '', value: '' }];
    onchange?.(value);
  }

  function updateKey(i: number, entry: KvEntry, newKey: string) {
    value[i] = { ...entry, key: newKey };
    onchange?.(value);
  }

  function updateValue(i: number, entry: KvEntry, newValue: string) {
    value[i] = { ...entry, value: newValue };
    onchange?.(value);
  }

  function handleListChange(newItems: KvEntry[]) {
    value = newItems;
    onchange?.(value);
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
      onclick={addEntry}
      {disabled}
    >
      <PlusIcon class="size-3" />
      {m.kv_add()}
    </Button>
  </div>
  <DraggableList items={value} onchange={handleListChange} minItems={0} {disabled}>
    {#snippet renderItem(entry, i)}
      <div class="flex items-center gap-2">
        <Input
          value={entry.key}
          oninput={(e) => updateKey(i, entry, e.currentTarget.value)}
          placeholder={m.kv_key_placeholder()}
          class="w-1/3 shrink-0"
          {disabled}
        />
        <Input
          value={entry.value}
          oninput={(e) => updateValue(i, entry, e.currentTarget.value)}
          placeholder={m.kv_value_placeholder()}
          class="flex-1"
          {disabled}
        />
      </div>
    {/snippet}
  </DraggableList>
</div>
