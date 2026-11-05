import {
  useId,
  useState,
  type ButtonHTMLAttributes,
} from "react";

export function Switch({
  checked,
  onChange,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <button
      {...props}
      type="button"
      className={"cc-switch " + (props.className || "")}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export { Select, type SelectOption } from './Select.js';

export function DetailIcon({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  const id = useId(),
    [open, setOpen] = useState(false);
  return (
    <span
      className="cc-detail"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="cc-detail-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <svg
          viewBox="0 0 20 20"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="7.25" />
          <path d="M10 9v5M10 5.5v1.5" />
        </svg>
      </button>
      <span id={id} className="cc-detail-content" hidden={!open}>
        {children}
      </span>
    </span>
  );
}

export const CONTROL_CSS = `
.cc-switch{display:inline-flex;align-items:center;justify-content:flex-start;flex-shrink:0;width:36px;height:22px;min-height:22px!important;padding:2px!important;border-radius:999px!important;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3)!important;cursor:pointer}
.cc-switch>span{width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-tertiary);box-shadow:0 1px 2px var(--dsw-alias-bg-mask-1);transition:transform .15s,background .15s}
.cc-switch[aria-checked=false]>span{background:#d1d5db;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.cc-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)!important;border-color:var(--dsw-alias-brand-primary)!important}
.cc-switch[aria-checked=true]>span{transform:translateX(12px);background:var(--dsw-alias-brand-primary-invert)}
.cc-switch:disabled{opacity:.5;cursor:not-allowed}
.cc-detail{position:relative;display:inline-flex;align-items:center;vertical-align:middle;font-weight:400}
.cc-detail .cc-detail-trigger{display:inline-flex;align-items:center;justify-content:center;width:28px;min-height:28px;padding:4px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;cursor:pointer}
.cc-detail-content{position:absolute;inset:calc(100% + 4px) auto auto 0;z-index:20;width:240px;max-width:70vw;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.6;white-space:normal;overflow-wrap:anywhere;box-shadow:0 4px 16px var(--dsw-alias-bg-mask-1)}
@media(pointer:coarse){.cc-detail .cc-detail-trigger{width:44px;min-height:44px}.cc-switch{position:relative;margin:11px 0}.cc-switch::before{content:'';position:absolute;inset:-11px -4px}}
@media(prefers-reduced-motion:reduce){.cc-switch>span{transition:none}}
`;
