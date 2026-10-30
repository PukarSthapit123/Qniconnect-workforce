import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { Popover } from 'radix-ui';
import { cn } from '@/lib/utils';
import { pickerOption, pickerTrigger } from '@/ui/shadcn/select';
import type { SelectBoxProps } from './Select';

/* The most matches drawn at once; a long company list stays quick to render. */
export const COMBOBOX_LIMIT = 50;

export interface ComboboxProps extends SelectBoxProps {
  /* The search box has no visible label, so it names itself. */
  searchLabel?: string;
  /* plain: no field box, so the closed picker reads as its own text (the week grid's allocation cell, where three
     boxed pickers crowded two time fields); display: what it shows closed, in place of the chosen label */
  plain?: boolean;
  display?: ReactNode;
}
const PLAIN = 'flex w-full items-start gap-xs rounded-control px-xs py-[3px] text-left outline-none hover:enabled:bg-surface-tint focus-visible:shadow-focus disabled:cursor-not-allowed data-[state=open]:bg-surface-tint';

/* A SelectBox you can type into: the closed control is the same trigger, the
   panel adds a search box over the list. Props match SelectBox, so swapping
   one for the other is a rename. As with SelectBox, Field clones its child with
   an `id`, `aria-describedby`, `aria-invalid` and `aria-required`; all four, and
   the aria-label, go to the trigger button.

   Motion (tokens.css): the panel fades in and grows from 0.97 out of its
   trigger over --dur-dropdown, and has no exit: a pick, by Enter or by
   click, closes it at once, so the choice lands with nothing left on
   screen. Opened from the keyboard it appears at once (index.css). */
export function Combobox({ testId, options, value, onValueChange, placeholder, disabled, name, id,
  'aria-describedby': ariaDescribedBy, 'aria-required': ariaRequired, 'aria-invalid': ariaInvalid, 'aria-label': ariaLabel,
  look = 'field', searchLabel = 'Search', plain, display }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /* state, not a ref: the portal mounts a commit after open, and the scroll waits for it */
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-option-${i}`;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const shown = matches.slice(0, COMBOBOX_LIMIT);
  /* options can change under an open panel; the active row must still exist */
  const current = Math.min(active, Math.max(0, shown.length - 1));
  const selected = options.find(o => o.value === value);
  const hasValue = value !== undefined && value !== '';

  function changeOpen(next: boolean) {
    setOpen(next);
    setQuery('');
    if (next) setActive(Math.max(0, options.slice(0, COMBOBOX_LIMIT).findIndex(o => o.value === value)));
  }
  /* the active row stays on screen: on open, on a new query and on every key */
  useEffect(() => {
    list?.querySelector(`[id="${CSS.escape(`${listId}-option-${current}`)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [list, current, query, listId]);
  function pick(v: string) {
    onValueChange?.(v);
    changeOpen(false);
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    const n = shown.length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); setActive((current + 1) % n); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setActive((current - 1 + n) % n); }
    else if (e.key === 'Home' && n) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && n) { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = shown[current]; if (o && !o.disabled) pick(o.value); }
  }
  /* On the closed trigger, as a native select and Radix Select do: an arrow
     opens the list, and typing a letter opens it with that letter already in
     the search box. Space and Enter still press the trigger. */
  function openFromKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); changeOpen(true); return; }
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      changeOpen(true);
      setQuery(e.key);
      setActive(0);
    }
  }

  return (
    <Popover.Root modal open={open} onOpenChange={changeOpen}>
      <Popover.Trigger ref={triggerRef} type="button" id={id} data-testid={testId} disabled={disabled}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-label={ariaLabel} aria-describedby={ariaDescribedBy} aria-required={ariaRequired} aria-invalid={ariaInvalid}
        data-slot="select-trigger" data-size={look === 'filter' ? 'filter' : 'default'}
        data-placeholder={selected || hasValue ? undefined : ''}
        onKeyDown={openFromKey}
        className={plain ? PLAIN : pickerTrigger(look === 'filter' ? 'filter' : 'default')}>
        {plain
          ? <><span className="min-w-0 flex-1">{display ?? (selected ? selected.label : hasValue ? value : placeholder)}</span>
            <ChevronDownIcon aria-hidden="true" className="mt-[3px] size-3.5 shrink-0 text-text-muted" /></>
          : <><span className="line-clamp-1 flex items-center gap-2">{display ?? (selected ? selected.label : hasValue ? value : placeholder)}</span>
            <ChevronDownIcon className="size-4" /></>}
      </Popover.Trigger>
      {name && <input type="hidden" name={name} value={value ?? ''} />}
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} collisionPadding={8} aria-label={ariaLabel ?? searchLabel}
          onOpenAutoFocus={e => { e.preventDefault(); inputRef.current?.focus(); }}
          data-slot="popover-content"
          className="z-(--qp-z-popover) min-w-(--radix-popover-trigger-width) max-w-(--radix-popover-content-available-width) origin-(--radix-popover-content-transform-origin) overflow-hidden rounded-control border bg-popover text-popover-foreground shadow-md outline-none duration-(--dur-dropdown) ease-(--ease-out) data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-97">
          <div className="p-1 pb-0">
            <input ref={inputRef} type="text" data-testid={`${testId}-search`} aria-label={searchLabel}
              role="searchbox" aria-autocomplete="list" aria-controls={listId}
              aria-activedescendant={shown.length ? optionId(current) : undefined}
              autoComplete="off" value={query} onKeyDown={onKeyDown}
              onChange={e => { setQuery(e.target.value); setActive(0); }}
              className="h-[34px] w-full rounded-sm border border-border-strong bg-surface-sunken px-[11px] text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand focus:shadow-focus max-md:text-base" />
          </div>
          <div ref={setList} id={listId} role="listbox" aria-label={ariaLabel ?? searchLabel} className="max-h-[min(300px,calc(var(--radix-popover-content-available-height)-56px))] overflow-y-auto p-1">
            {shown.map((o, i) => (
              <div key={o.value} id={optionId(i)} role="option" aria-selected={o.value === value} aria-disabled={o.disabled ? true : undefined}
                data-testid={`${testId}-option-${o.value}`} data-active={i === current ? '' : undefined}
                onMouseDown={e => e.preventDefault()} onMouseMove={() => { if (i !== current) setActive(i); }}
                onClick={() => { if (!o.disabled) pick(o.value); }}
                className={cn(pickerOption, 'data-[active]:bg-surface-tint aria-selected:font-semibold aria-disabled:text-text-muted')}>
                {o.label}
                {o.value === value && <span className="absolute right-2 flex size-3.5 items-center justify-center"><CheckIcon className="size-4 text-muted-foreground" /></span>}
              </div>
            ))}
            {shown.length === 0 && <p className="px-[11px] py-[9px] text-sm text-text-muted">
              {options.length === 0 ? 'Nothing to choose from yet' : `No matches for “${query.trim()}”`}</p>}
            {matches.length > COMBOBOX_LIMIT && (
              <p className="px-[11px] py-[9px] text-xs text-text-muted">Showing {COMBOBOX_LIMIT} of {matches.length}. Type to narrow down.</p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
