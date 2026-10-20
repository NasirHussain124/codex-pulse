import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption { value: string; label: string }

/** A single-focus, keyboard-accessible select without the Windows native popup. */
export function Dropdown({ label, value, options, onChange, placeholder = 'Select', disabled = false }: {
  label: string; value: string | number; options: DropdownOption[];
  onChange: (value: string) => void; placeholder?: string; disabled?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const selected = options.findIndex(option => option.value === String(value));
  const unavailable = disabled || !options.length;
  const show = () => { if (!unavailable) { setActive(Math.max(0, selected)); setOpen(true); } };
  const choose = (index: number) => {
    if (!options[index]) return;
    onChange(options[index].value); setOpen(false); trigger.current?.focus();
  };
  useEffect(() => {
    if (unavailable) setOpen(false);
    setActive(index => Math.min(index, Math.max(0, options.length - 1)));
  }, [unavailable, options.length]);
  useLayoutEffect(() => {
    if (!open || unavailable) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 156), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 18;
      const above = rect.top - 18;
      const upward = below < Math.min(150, options.length * 36 + 12) && above > below;
      const maxHeight = Math.min(272, Math.max(60, upward ? above : below));
      const height = Math.min(options.length * 36 + 12, maxHeight);
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: upward ? Math.max(12, rect.top - height - 6) : rect.bottom + 6, width, maxHeight });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, unavailable, options.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (open) menu.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (unavailable) return;
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show();
      else setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); setOpen(true); setActive(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); if (open) choose(active); else show();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const text = (now - typeahead.current.at < 700 ? typeahead.current.text : '') + event.key.toLowerCase();
      typeahead.current = { text, at: now };
      const match = options.findIndex(option => option.label.toLowerCase().startsWith(text));
      if (match >= 0) { event.preventDefault(); setActive(match); setOpen(true); }
    }
  };
  const portal = trigger.current?.closest('[role="dialog"]') || document.body;
  return <span className="pulse-select"><button type="button" className="pulse-select-trigger" ref={trigger}
    role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
    aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined}
    data-value={String(value)} disabled={unavailable} onKeyDown={keyboard}
    onBlur={() => setOpen(false)} onClick={() => open ? setOpen(false) : show()}>
    <span>{options[selected]?.label || placeholder}</span><ChevronDown size={13} className={open ? 'is-open' : ''} />
  </button>{open && !unavailable && createPortal(<div ref={menu} id={`${id}-list`} role="listbox" aria-label={label}
    className="pulse-select-menu" style={position || { visibility: 'hidden', left: 0, top: 0 }}>
    {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option"
      aria-selected={selected === index} data-value={option.value} data-active={active === index}
      className="pulse-select-option" onPointerMove={() => setActive(index)}
      onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
      <span>{option.label}</span>{selected === index && <Check size={14} />}
    </div>)}
  </div>, portal)}</span>;
}
