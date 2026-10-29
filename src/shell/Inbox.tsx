import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronRight } from 'lucide-react';
import type { InboxItem } from '@/domain/inbox';
import { tid } from '@/testids';
import { cn } from '@/lib/utils';
import { Button, Modal, NavLink } from '@/ui';

/* What the bell shows: one list from two sources (spec D13), payroll's from
   Business Central and Workforce's, newest first (src/domain/inbox.ts).
   `status` is Workforce's: its loading and its failure. Payroll's failure
   is no payroll items, as QniConnect had it (BELL error state). */
export interface InboxState {
  status: 'loading' | 'error' | 'ready'; items: InboxItem[]; unread: number;
  /* marking read is off while looking at the app as someone else */
  readOnly: boolean; markAllPending: boolean;
  onOpen(item: InboxItem): void; onMarkAll(): void;
}
export const emptyInbox = (unread = 0): InboxState =>
  ({ status: 'ready', items: [], unread, readOnly: false, markAllPending: false, onOpen: () => {}, onMarkAll: () => {} });

/* The bell (v15:1614-1622, .iconbtn .b v15:291-293) and its panel, .npanel
   (v15:646-698): 376px of card surface under the bell, a sticky head with
   the "n new" pill (BELL.R7) and "Mark all read", one row per item with its
   unread dot, title, detail, the source in capitals and, when the page it
   opens is reachable, " · <page>" and a chevron. A Workforce item is a link
   only when reachable (IMP-017); a payroll item opens its detail
   (BELL.R10). Outside the panel or Escape closes it (v15:10806-10808, 13223).

   The bell sits on the top bar: its keyboard ring is the inverse one, and a
   press lifts it and scales it to 0.94. Its count is capped at 99+ in
   tabular digits, so it never outgrows the 16px badge. The panel grows out
   of the bell (top right) from 0.97 as it fades in, through @starting-style,
   so it needs no script (with reduced motion it only fades); it goes at
   once, as Escape or a click away should. Opened from the keyboard it
   appears at once too (index.css). A row is full width inside the panel's
   scroll box, so its keyboard ring is drawn inside it, never clipped. */
export function NotificationBell({ inbox }: { inbox: InboxState }) {
  const [open, setOpen] = useState(false);
  /* BELL.R10: the item as it was when opened */
  const [detail, setDetail] = useState<InboxItem | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (e.target instanceof Node && !box.current?.contains(e.target)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const { unread } = inbox;
  return (
    <div ref={box} className="relative">
      <button type="button" data-testid={tid.shell.bell} aria-label={`Notifications, ${unread} unread`} aria-expanded={open} aria-controls={open ? tid.inbox.panel : undefined}
        onClick={() => setOpen(o => !o)} data-surface="inverse"
        className="relative grid size-[34px] shrink-0 place-items-center rounded-pill text-shell-ink transition-[scale] duration-(--dur-press) ease-(--ease-out) hover:bg-shell-hover active:scale-[0.94] active:bg-shell-hover max-md:size-11 [&>svg]:size-[18px]">
        <Bell aria-hidden="true" />
        {unread > 0 && <span data-testid={tid.shell.bellCount} className="absolute top-px right-0 grid h-4 min-w-4 place-items-center rounded-pill bg-brand-accent px-xs text-xs leading-none font-bold text-text-on-accent tabular-nums max-md:top-[6px] max-md:right-[4px]">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && <InboxPanel inbox={inbox} onClose={() => setOpen(false)} onDetail={setDetail} />}
      <NotificationDetail item={detail} onClose={() => setDetail(null)} />
    </div>);
}

function InboxPanel({ inbox, onClose, onDetail }: { inbox: InboxState; onClose(): void; onDetail(item: InboxItem): void }) {
  const open = (n: InboxItem) => { onClose(); inbox.onOpen(n); if (n.source === 'payroll') onDetail(n); };
  return (
    <div id={tid.inbox.panel} data-testid={tid.inbox.panel} data-slot="inbox-panel" role="dialog" aria-label="Notifications"
      className="absolute top-11 right-0 z-(--qp-z-popover) max-h-[70dvh] w-[376px] origin-top-right overflow-auto overscroll-contain rounded-card border bg-surface-card text-text-primary shadow-lg transition-[opacity,scale] duration-(--dur-dropdown) ease-(--ease-out) starting:scale-[0.97] starting:opacity-0 motion-reduce:starting:scale-100 max-md:fixed max-md:top-[calc(var(--qp-topbar-h)+4px+env(safe-area-inset-top,0px))] max-md:right-[12px] max-md:w-[min(340px,calc(100vw-24px))]">
      <div className="sticky top-0 flex items-center gap-sm border-b bg-surface-card px-lg py-md">
        <h4 className="text-sm font-semibold">Notifications</h4>
        {inbox.unread > 0 && <span data-testid={tid.inbox.newCount} className="rounded-pill bg-brand-subtle px-sm py-px text-xs leading-(--qp-lh-12) font-semibold text-brand tabular-nums dark:text-brand-accent">{inbox.unread} new</span>}
        <button type="button" data-testid={tid.inbox.markAll} onClick={inbox.onMarkAll}
          disabled={inbox.readOnly || inbox.markAllPending || inbox.unread === 0}
          title={inbox.readOnly ? 'You are looking at the app as someone else, so nothing is marked read.' : undefined}
          className="ml-auto min-h-touch text-xs font-semibold text-brand transition-[scale] duration-(--dur-press) ease-(--ease-out) select-none enabled:hover:underline enabled:active:scale-[0.97] disabled:opacity-55 dark:text-brand-accent">Mark all read</button>
      </div>
      {inbox.status === 'loading' && <p data-testid={tid.inbox.loading} role="status" className="px-lg py-md text-sm text-text-muted">Loading your notifications&hellip;</p>}
      {inbox.status === 'error' && <p data-testid={tid.inbox.error} className="px-lg py-md text-sm text-err">Your workforce notifications could not be loaded. Close this and open it again.</p>}
      {inbox.status !== 'loading' && (inbox.items.length
        ? inbox.items.map(n => <InboxRow key={`${n.source}:${n.id}`} n={n} onOpen={() => open(n)} />)
        : inbox.status === 'ready' && <p data-testid={tid.inbox.empty} className="px-lg py-xl text-center text-sm text-text-muted">Nothing new</p>)}
    </div>);
}

const ROW = 'flex w-full items-start gap-[10px] border-b px-lg py-md text-left text-sm';
const PRESSABLE = 'cursor-pointer hover:bg-surface-tint active:bg-surface-tint focus-visible:shadow-focus-inset focus-visible:outline-none';
function InboxRow({ n, onOpen }: { n: InboxItem; onOpen(): void }) {
  const body = (
    <>
      <span data-testid={tid.inbox.dot(n.id)} data-unread={!n.read || undefined} aria-hidden="true"
        className={cn('mt-[6px] size-[7px] flex-none rounded-full', n.read ? 'bg-transparent' : 'bg-brand dark:bg-brand-accent')} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{!n.read && <span className="sr-only">Unread. </span>}{n.title}</div>
        {n.body && <div className="mt-px text-xs text-text-muted">{n.body}</div>}
        <span data-testid={tid.inbox.source(n.id)} className="mt-[3px] inline-block text-xs font-bold tracking-(--qp-tracking-caps) text-text-muted uppercase">
          {n.area}{n.link && <span data-testid={tid.inbox.dest(n.id)}> · {n.link.label}</span>}</span>
      </div>
      {n.when && <span data-testid={tid.inbox.when(n.id)} className="flex-none text-xs text-text-muted tabular-nums">{n.when}</span>}
      {(n.link || n.source === 'payroll') && <ChevronRight aria-hidden="true" className="mt-[2px] size-4 flex-none text-text-muted" />}
    </>);
  if (n.link) return (
    <NavLink to={n.link.path} testId={tid.inbox.item(n.id)} onClick={onOpen} aria-label={`${n.read ? '' : 'Unread. '}${n.title}. Open ${n.link.label}.`}
      className={cn(ROW, PRESSABLE)}>
      {body}
    </NavLink>);
  if (n.source === 'payroll') return (
    <button type="button" data-testid={tid.inbox.item(n.id)} onClick={onOpen} aria-haspopup="dialog" className={cn(ROW, PRESSABLE)}>{body}</button>);
  return <div data-testid={tid.inbox.item(n.id)} className={ROW}>{body}</div>;
}

/* BELL.R10, QniConnect's detail overlay: "Notification", the date line, the
   message in a box, and Done. Built on the design system's Modal, so
   Escape, a click outside and the close button also close it. */
function NotificationDetail({ item, onClose }: { item: InboxItem | null; onClose(): void }) {
  return (
    <Modal open={!!item} onOpenChange={o => { if (!o) onClose(); }} title="Notification" testId={tid.inbox.detail}
      footer={<Button testId={tid.inbox.detailDone} kind="primary" onClick={onClose}>Done</Button>}>
      {item?.when && <p data-testid={tid.inbox.detailWhen} className="mb-sm text-xs text-text-muted tabular-nums">{item.when}</p>}
      <p data-testid={tid.inbox.detailMessage} className="rounded-sm bg-surface-tint p-md text-sm whitespace-pre-line">{item?.title}</p>
    </Modal>);
}
