<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
  import Button from '$lib/components/ui/button/button.svelte';
  import DraggableList from '$lib/components/DraggableList.svelte';
  import { ISSUERS } from '$lib/constants';
  import { pick } from '$lib/utils';
  import type { Authority } from '$lib/types';
  import PlusIcon from '@lucide/svelte/icons/plus';

  const authorityNames = [
    '纪律检查委员会',
    '人事管理局',
    '摸鱼事务所',
    '后勤保障部',
    '危机处理小组',
    '特种技术部门',
    '安全监察处',
    '综合协调办公室'
  ];

  let {
    value = $bindable<Authority[]>([]),
    maxItems = 9,
    disabled = false,
    onchange
  }: {
    value: Authority[];
    maxItems?: number;
    disabled?: boolean;
    onchange?: (value: Authority[]) => void;
  } = $props();

  function updateFaction(i: number, auth: Authority, faction: string) {
    value[i] = { ...auth, faction: faction as Authority['faction'] };
    onchange?.(value);
  }

  function updateName(i: number, auth: Authority, name: string) {
    value[i] = { ...auth, name };
    onchange?.(value);
  }

  function handleListChange(newItems: Authority[]) {
    value = newItems;
    onchange?.(value);
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <Label>{m.authorities()}</Label>
    {#if value.length < maxItems}
      <Button
        variant="outline"
        size="xs"
        class="cursor-pointer text-xs"
        onclick={() => {
          value = [
            ...value,
            {
              faction: pick(Array.from(ISSUERS)).key,
              name: pick(authorityNames)
            }
          ];
          onchange?.(value);
        }}
        {disabled}
      >
        <PlusIcon class="size-3" />
        {m.add_authority()}
      </Button>
    {/if}
  </div>
  <DraggableList items={value} onchange={handleListChange} {disabled}>
    {#snippet renderItem(auth, i)}
      <div class="flex">
        <Select
          type="single"
          value={auth.faction}
          onValueChange={(v) => updateFaction(i, auth, v)}
          {disabled}
        >
          <SelectTrigger class="w-auto shrink-0 rounded-r-none border-r-0">
            {m[`prefix_${auth.faction}`]()}
          </SelectTrigger>
          <SelectContent>
            {#each ISSUERS as iss (iss.key)}
              <SelectItem value={iss.key} label={m[`prefix_${iss.key}`]()} />
            {/each}
          </SelectContent>
        </Select>
        <Input
          value={auth.name}
          oninput={(e) => updateName(i, auth, e.currentTarget.value)}
          {disabled}
          class="rounded-l-none"
        />
      </div>
    {/snippet}
  </DraggableList>
</div>
