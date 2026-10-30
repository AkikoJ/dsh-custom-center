/** Shared settings-page shell, actions, and selection controls. */
export const pageCss = [
  // settings page shell
  '.dsh-cc-page{display:flex;flex-direction:column;gap:24px;max-width:720px;padding-bottom:4px}',
  '.dsh-cc-header{display:flex;flex-direction:column;gap:6px}',
  '.dsh-cc-heading{color:var(--dsw-alias-label-primary);font-size:18px;line-height:26px;font-weight:600;margin:0}',
  '.dsh-cc-intro{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;margin:0}',
  '.dsh-cc-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}',
  // flat sections
  '.dsh-cc-section{display:flex;flex-direction:column;gap:12px}',
  '.dsh-cc-section-title{display:flex;align-items:baseline;gap:10px;margin:0;color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px;font-weight:600}',
  '.dsh-cc-section-note{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400}',
  '.dsh-cc-section-off .dsh-cc-controls{opacity:.55}',
].join('')

export const controlCss = [
  // action bar
  '.dsh-cc-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l2)}',
  '.dsh-cc-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:var(--dsw-alias-label-tertiary)}',
  '.dsh-cc-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
  '.dsh-cc-btn{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer;padding:6px 14px;white-space:nowrap}',
  '.dsh-cc-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-cc-btn:disabled{opacity:.5;cursor:default}',
  '.dsh-cc-btn-active{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary) inset}',
  '.dsh-cc-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsh-cc-on-accent,#fff)}',
  '.dsh-cc-btn-primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);filter:brightness(1.08)}',
  // themed dropdown
  '.dsh-cc-select{position:relative;min-width:0}',
  '.dsh-cc-select-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;box-sizing:border-box;width:100%;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}',
  '.dsh-cc-select-btn:hover:not(:disabled){border-color:var(--dsw-alias-label-tertiary)}',
  '.dsh-cc-select-btn:focus-visible,.dsh-cc-select-btn[aria-expanded=true]{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '.dsh-cc-select-btn:disabled{opacity:.55;cursor:default}',
  '.dsh-cc-select-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsh-cc-select-caret{flex:0 0 auto;color:var(--dsw-alias-label-tertiary);transition:transform .15s}',
  '.dsh-cc-select-btn[aria-expanded=true] .dsh-cc-select-caret{transform:rotate(180deg)}',
  '.dsh-cc-select-list{position:absolute;right:0;min-width:100%;width:max-content;max-width:min(360px,90vw);top:calc(100% + 4px);z-index:20;box-sizing:border-box;max-height:240px;margin:0;padding:4px;overflow-y:auto;list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 24px rgba(0,0,0,.18)}',
  '.dsh-cc-select-list-up{top:auto;bottom:calc(100% + 4px)}',
  '.dsh-cc-select-opt{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;cursor:pointer}',
  '.dsh-cc-select-group{padding:8px 8px 2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-weight:600;letter-spacing:.02em;cursor:default}',
  '.dsh-cc-select-group:not(:first-child){margin-top:4px;border-top:1px solid var(--dsw-alias-border-l2)}',
  '.dsh-cc-select-opt-active{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-cc-select-opt-disabled{opacity:.5;cursor:default}',
  '.dsh-cc-select-check{flex:0 0 14px;width:14px;color:var(--dsw-alias-brand-primary);font-size:12px;text-align:center}',
  '.dsh-cc-select-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
].join('')
