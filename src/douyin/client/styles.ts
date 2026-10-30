/** Scoped to the account page; the style element follows its React lifecycle. */
export const douyinAccountCss = `
.dsh-cc-douyin {
  --dy-success: var(--dsw-alias-brand-success, var(--dsw-alias-label-primary));
  --dy-warning: var(--dsw-alias-brand-warning, var(--dsw-alias-label-primary));
  gap: 20px;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
}
.dsh-cc-douyin * { box-sizing: border-box; }
.dsh-cc-douyin .dsh-dy-account {
  padding: 18px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh-cc-douyin .dsh-dy-account-top { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.dsh-cc-douyin .dsh-dy-avatar {
  display: grid; place-items: center; flex: 0 0 44px; height: 44px;
  border-radius: 12px; background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover));
  color: var(--dsw-alias-label-secondary);
}
.dsh-cc-douyin .dsh-dy-account-name { flex: 1; min-width: min(180px, 100%); overflow-wrap: anywhere; }
.dsh-cc-douyin .dsh-dy-account-name h3 { margin: 0; font-size: 15px; line-height: 22px; font-weight: 600; }
.dsh-cc-douyin .dsh-dy-account-name p { margin: 3px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dsh-cc-douyin .dsh-dy-badge {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover));
  color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px;
}
.dsh-cc-douyin .dsh-dy-status-dot { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: currentColor; }
.dsh-cc-douyin [data-tone="success"] { color: var(--dy-success); }
.dsh-cc-douyin [data-tone="warning"] { color: var(--dy-warning); }
.dsh-cc-douyin .dsh-dy-account-hint { margin: 14px 0 16px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-cc-douyin .dsh-dy-actions { gap: 8px; }
.dsh-cc-douyin .dsh-cc-btn { min-height: 36px; border-radius: 8px; }
.dsh-cc-douyin .dsh-cc-btn-primary {
  background: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-layer-1);
}
.dsh-cc-douyin .dsh-cc-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-label-primary); filter: brightness(.9); }
.dsh-cc-douyin .dsh-cc-btn:focus-visible,
.dsh-cc-douyin summary:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, currentColor); outline-offset: 3px; }
.dsh-cc-douyin .dsh-dy-feedback:empty { display: none; }
.dsh-cc-douyin .dsh-dy-feedback {
  padding: 12px 14px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover));
  color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; overflow-wrap: anywhere;
}
.dsh-cc-douyin .dsh-dy-feedback p { margin: 0; }
.dsh-cc-douyin .dsh-dy-feedback p + p { margin-top: 6px; }
.dsh-cc-douyin .dsh-dy-feedback .dsh-dy-error { color: var(--dsw-alias-brand-danger, #b43932); }
.dsh-cc-douyin .dsh-dy-progress { display: flex; align-items: center; gap: 8px; }
.dsh-cc-douyin .dsh-dy-spinner {
  width: 13px; height: 13px; flex: 0 0 13px; border: 1.5px solid currentColor;
  border-right-color: transparent; border-radius: 50%; animation: dsh-dy-spin .8s linear infinite;
}
@keyframes dsh-dy-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .dsh-cc-douyin .dsh-dy-spinner { animation: none; } }
.dsh-cc-douyin .dsh-dy-verification { gap: 0; }
.dsh-cc-douyin .dsh-dy-section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 12px; margin-bottom: 4px; }
.dsh-cc-douyin .dsh-dy-status-list { margin: 0; }
.dsh-cc-douyin .dsh-dy-status-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, auto); align-items: center; gap: 12px;
  padding: 13px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); font-size: 13px; line-height: 20px;
}
.dsh-cc-douyin .dsh-dy-status-row dt { min-width: 0; font-weight: 500; }
.dsh-cc-douyin .dsh-dy-status-row dt span { display: block; margin-top: 3px; font-size: 12px; line-height: 18px; font-weight: 400; color: var(--dsw-alias-label-secondary); }
.dsh-cc-douyin .dsh-dy-status-row dd { margin: 0; max-width: 170px; text-align: right; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-cc-douyin .dsh-dy-status-row dd[data-tone="success"] { color: var(--dy-success); }
.dsh-cc-douyin .dsh-dy-status-row dd[data-tone="warning"] { color: var(--dy-warning); }
.dsh-cc-douyin .dsh-dy-http-reason { margin: 10px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cc-douyin .dsh-dy-window-meta { display: flex; flex-wrap: wrap; gap: 4px 16px; padding-top: 10px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dsh-cc-douyin .dsh-dy-footer { padding-top: 2px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 19px; }
.dsh-cc-douyin .dsh-dy-footer p { margin: 0; }
.dsh-cc-douyin .dsh-dy-footer details { margin-top: 8px; }
.dsh-cc-douyin .dsh-dy-footer summary { width: fit-content; cursor: pointer; border-radius: 3px; }
.dsh-cc-douyin .dsh-dy-help { display: grid; gap: 6px; padding: 10px 0 0; }
`
