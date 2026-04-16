<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
  import { Switch } from '$lib/components/ui/switch';
  import DateInput from '$lib/components/DateInput.svelte';
  import AuthoritiesList from '$lib/components/AuthoritiesList.svelte';
  import KvGrid from '$lib/components/KvGrid.svelte';
  import type { FormField, TemplateDefinition } from '$lib/templates/types';

  let {
    template,
    values = {},
    disabled = false,
    onchange
  }: {
    template: TemplateDefinition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    values: Record<string, any>;
    disabled?: boolean;
    onchange?: (values: Record<string, unknown>) => void;
  } = $props();

  const cols = $derived(template.gridCols ?? 3);

  function colspanClass(field: FormField): string {
    const span = field.colspan ?? cols;
    switch (span) {
      case 1:
        return 'sm:col-span-1';
      case 2:
        return 'sm:col-span-2';
      case 3:
        return 'sm:col-span-3';
      case 4:
        return 'sm:col-span-4';
      default:
        return `sm:col-span-${span}`;
    }
  }

  function update(key: string, val: unknown) {
    onchange?.({ ...values, [key]: val });
  }

  const gridColsClass = $derived(
    cols === 1 ? 'grid-cols-1' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
  );
</script>

<div class="grid grid-cols-1 gap-4 {gridColsClass}">
  {#each template.fields as field (field.key)}
    {@const span = colspanClass(field)}
    {#if field.type === 'text'}
      <div class="space-y-2 {span}">
        <Label>{field.label()}</Label>
        <Input
          value={typeof values[field.key] === 'string' ? (values[field.key] as string) : ''}
          oninput={(e) => update(field.key, e.currentTarget.value)}
          placeholder={field.placeholder?.() ?? ''}
          {disabled}
        />
      </div>
    {:else if field.type === 'textarea'}
      <div class="space-y-2 {span} {field.grow ? 'flex flex-1 flex-col' : ''}">
        <Label>{field.label()}</Label>
        <Textarea
          value={typeof values[field.key] === 'string' ? (values[field.key] as string) : ''}
          oninput={(e) => update(field.key, e.currentTarget.value)}
          placeholder={field.placeholder?.() ?? ''}
          class="field-sizing-fixed min-h-40 resize-none {field.grow ? 'flex-1' : ''}"
          {disabled}
        />
      </div>
    {:else if field.type === 'select'}
      <div class="space-y-2 {span}">
        <Label>{field.label()}</Label>
        <Select
          type="single"
          value={typeof values[field.key] === 'string' ? (values[field.key] as string) : undefined}
          onValueChange={(v) => update(field.key, v)}
          {disabled}
        >
          <SelectTrigger class="w-full">
            {#if values[field.key]}
              {field.options.find((o) => o.value === values[field.key])?.label() ??
                field.placeholder?.() ??
                ''}
            {:else}
              {field.placeholder?.() ?? ''}
            {/if}
          </SelectTrigger>
          <SelectContent>
            {#each field.options as opt (opt.value)}
              <SelectItem value={opt.value} label={opt.label()} />
            {/each}
          </SelectContent>
        </Select>
      </div>
    {:else if field.type === 'number'}
      <div class="space-y-2 {span}">
        <Label>{field.label()}</Label>
        <Input
          type="number"
          value={values[field.key] != null ? String(values[field.key]) : ''}
          oninput={(e) => {
            const v = e.currentTarget.value;
            update(field.key, v === '' ? '' : v);
          }}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder ?? ''}
          {disabled}
        />
      </div>
    {:else if field.type === 'toggle'}
      <div class="flex items-center gap-3 {span}">
        <Switch checked={!!values[field.key]} onchange={(v) => update(field.key, v)} {disabled} />
        <div class="flex flex-col">
          <Label class="cursor-pointer">{field.label()}</Label>
          {#if field.description}
            <span class="text-muted-foreground text-xs">{field.description()}</span>
          {/if}
        </div>
      </div>
    {:else if field.type === 'date'}
      <div class="space-y-2 {span}">
        <Label>{field.label()}</Label>
        <DateInput
          value={values[field.key] ?? { year: '', month: '', day: '' }}
          onchange={(v) => update(field.key, v)}
          class="w-full"
          {disabled}
        />
      </div>
    {:else if field.type === 'authorities'}
      <div class={span}>
        <AuthoritiesList
          value={values[field.key] ?? []}
          onchange={(v) => update(field.key, v)}
          maxItems={field.maxItems ?? 9}
          {disabled}
        />
      </div>
    {:else if field.type === 'kv-grid'}
      <div class={span}>
        <KvGrid
          value={values[field.key] ?? []}
          onchange={(v) => update(field.key, v)}
          label={field.label()}
          {disabled}
        />
      </div>
    {:else if field.type === 'prefixed-input'}
      <div class="space-y-2 {span}">
        <Label>{field.label()}</Label>
        <div class="flex">
          <Select
            type="single"
            value={typeof values[field.prefixKey] === 'string'
              ? (values[field.prefixKey] as string)
              : undefined}
            onValueChange={(v) => update(field.prefixKey, v)}
            {disabled}
          >
            <SelectTrigger class="w-auto shrink-0 rounded-r-none border-r-0">
              {field.prefixes.find((p) => p.value === values[field.prefixKey])?.label() ?? ''}
            </SelectTrigger>
            <SelectContent>
              {#each field.prefixes as p (p.value)}
                <SelectItem value={p.value} label={p.label()} />
              {/each}
            </SelectContent>
          </Select>
          <Input
            value={typeof values[field.key] === 'string' ? (values[field.key] as string) : ''}
            oninput={(e) => update(field.key, e.currentTarget.value)}
            placeholder={field.placeholder?.() ?? ''}
            class="rounded-l-none"
            {disabled}
          />
        </div>
      </div>
    {:else if field.type === 'custom'}
      <div class={span}>
        <field.component bind:value={values[field.key]} {disabled} />
      </div>
    {/if}
  {/each}
</div>
