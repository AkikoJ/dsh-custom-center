/**
 * The plugin's stylesheet, injected once at activation. Scoped to this
 * plugin's own `dsh-cc-*` classes and the `data-dsh-cc-bg` wallpaper gate so
 * it never shadows shipped UI. The fixed wallpaper layers live on `<html>`.
 */

/** Install the plugin stylesheet once. */
export function ensureStyle(): void {
  if (typeof document === 'undefined') return
  if (document.head.querySelector('style[data-plugin="dsh-custom-center"]')) return
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-custom-center'
  style.textContent = CSS_TEXT
  document.head.appendChild(style)
}

const CSS_TEXT = [
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
    // wallpaper stage: the whole picture is the picker
  '.dsh-cc-stage{position:relative;display:block;box-sizing:border-box;width:100%;max-width:560px;aspect-ratio:16/9;margin:0 auto;padding:0;overflow:hidden;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1) center/cover no-repeat;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px}',
  '.dsh-cc-stage:hover{border-color:var(--dsw-alias-brand-primary)}',
  '.dsh-cc-stage:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
  '.dsh-cc-stage-empty{border-style:dashed}',
  '.dsh-cc-stage-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
  '.dsh-cc-stage-label{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}',
  '.dsh-cc-stage-plus{font-size:32px;line-height:32px;font-weight:300}',
  '.dsh-cc-stage-filled .dsh-cc-stage-label{background:rgba(0,0,0,.45);color:#fff;opacity:0;transition:opacity .15s}',
  '.dsh-cc-stage-filled:hover .dsh-cc-stage-label,.dsh-cc-stage-filled:focus-visible .dsh-cc-stage-label{opacity:1}',
  // library picker
  '.dsh-cc-picker{display:flex;flex-direction:column;gap:10px;margin-top:4px}',
  '.dsh-cc-tabs{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2)}',
  '.dsh-cc-tab{display:inline-flex;align-items:center;gap:6px;margin-bottom:-1px;padding:8px 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}',
  '.dsh-cc-tab:hover{color:var(--dsw-alias-label-primary)}',
  '.dsh-cc-tab-active{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}',
  '.dsh-cc-tab-count{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400}',
  '.dsh-cc-file-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}',
  '.dsh-cc-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;max-height:300px;overflow:auto;padding:2px}',
  '.dsh-cc-upload{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;aspect-ratio:16/9;padding:0;cursor:pointer;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px}',
  '.dsh-cc-upload:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}',
  '.dsh-cc-upload:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '.dsh-cc-upload:disabled{cursor:default;opacity:.7}',
  '.dsh-cc-upload-plus{font-size:24px;line-height:24px;font-weight:300}',
  '.dsh-cc-item{position:relative;box-sizing:border-box;aspect-ratio:16/9;padding:0;overflow:hidden;cursor:pointer;border:2px solid transparent;border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:#fff;font:inherit}',
  '.dsh-cc-item:hover:not(:disabled){border-color:var(--dsw-alias-border-l3)}',
  '.dsh-cc-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '.dsh-cc-item:disabled{cursor:default;opacity:.7}',
  '.dsh-cc-item-selected,.dsh-cc-item-selected:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
  '.dsh-cc-item-media{display:block;width:100%;height:100%;object-fit:cover}',
  '.dsh-cc-item-name{position:absolute;left:0;right:0;bottom:0;padding:14px 8px 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:left;font-size:11px;line-height:16px;background:linear-gradient(transparent,rgba(0,0,0,.65))}',
  '.dsh-cc-empty{grid-column:1/-1;margin:0;padding:20px 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
  '.dsh-cc-error{margin:0;white-space:pre-line;color:var(--dsw-alias-brand-danger,#d93025);font-size:12px;line-height:18px}',
  // sliders + toggle
  '.dsh-cc-controls{display:flex;flex-direction:column;gap:14px}',
  '.dsh-cc-slider-row{display:grid;grid-template-columns:112px minmax(0,1fr) 44px;align-items:center;gap:12px;font-size:13px;color:var(--dsw-alias-label-secondary)}',
  '.dsh-cc-slider-label{color:var(--dsw-alias-label-secondary)}',
  '.dsh-cc-slider-row input[type=range]{width:100%;margin:0;accent-color:var(--dsw-alias-brand-primary)}',
  '.dsh-cc-slider-val{text-align:right;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
  '.dsh-cc-toggle-line{display:flex;flex-wrap:wrap;align-items:center;gap:8px 28px}',
  '.dsh-cc-toggle-row{position:relative;display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
  '.dsh-cc-toggle-row input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary);width:15px;height:15px;margin:0}',
  '.dsh-cc-tip{position:absolute;left:0;top:calc(100% + 6px);z-index:5;width:max-content;max-width:260px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;box-shadow:0 4px 14px rgba(0,0,0,.18);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .12s}',
  '.dsh-cc-toggle-row:hover .dsh-cc-tip,.dsh-cc-toggle-row:focus-within .dsh-cc-tip{opacity:1;visibility:visible}',
  '.dsh-cc-slider-row input:disabled,.dsh-cc-toggle-row input:disabled{cursor:default}',
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
  // tuning tab
  '.dsh-cc-tuning{display:flex;flex-direction:column;gap:28px}',
  '.dsh-cc-head{display:flex;flex-direction:column;gap:4px}',
  '.dsh-cc-rows{display:flex;flex-direction:column}',
  '.dsh-cc-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(200px,280px);align-items:center;gap:8px 24px;padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}',
  '.dsh-cc-row-text{display:flex;flex-direction:column;gap:2px;min-width:0}',
  '.dsh-cc-row-label{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;font-weight:500}',
  '.dsh-cc-row-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
  '.dsh-cc-row-control{display:flex;justify-content:flex-end;min-width:0}',
  '.dsh-cc-row-control>*{flex:1 1 auto;min-width:0}',
  '.dsh-cc-row-control>.dsh-cc-switch{flex:0 0 auto}',
  '.dsh-cc-rows>.dsh-cc-warn{padding:8px 0}',
  '@media (max-width:560px){.dsh-cc-row{grid-template-columns:minmax(0,1fr)}.dsh-cc-row-control{justify-content:flex-start}}',
  '.dsh-cc-input{position:relative;display:block}',
  '.dsh-cc-input input{box-sizing:border-box;width:100%;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;font-variant-numeric:tabular-nums;text-align:right;-moz-appearance:textfield;appearance:textfield}',
  '.dsh-cc-input input::-webkit-outer-spin-button,.dsh-cc-input input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}',
  '.dsh-cc-input input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '.dsh-cc-input input:disabled{opacity:.55;cursor:default}',
  '.dsh-cc-input-unit input{padding-right:56px}',
  '.dsh-cc-input-suffix{position:absolute;top:50%;right:10px;transform:translateY(-50%);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;pointer-events:none}',
  '.dsh-cc-switch{display:inline-flex;align-items:center}',
  '.dsh-cc-summary{display:flex;flex-direction:column;gap:10px;margin-top:4px}',
  '.dsh-cc-meter{position:relative;height:6px;border-radius:999px;background:var(--dsw-alias-border-l2);overflow:hidden}',
  '.dsh-cc-meter-fill{position:absolute;inset:0 auto 0 0;background:var(--dsw-alias-brand-primary);border-radius:999px;transition:width .2s}',
  '.dsh-cc-meter-reserve{position:absolute;inset:0 0 0 auto;background:var(--dsw-alias-label-tertiary);opacity:.45;transition:width .2s}',
  '.dsh-cc-summary-items{display:flex;flex-wrap:wrap;gap:6px 20px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
  '.dsh-cc-summary-item{display:inline-flex;align-items:center;gap:6px}',
  '.dsh-cc-summary-item strong{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}',
  '.dsh-cc-summary-dim{color:var(--dsw-alias-label-tertiary)}',
  '.dsh-cc-swatch{width:8px;height:8px;border-radius:2px}',
  '.dsh-cc-swatch-fill{background:var(--dsw-alias-brand-primary)}',
  '.dsh-cc-swatch-reserve{background:var(--dsw-alias-label-tertiary);opacity:.6}',
  '.dsh-cc-switch input[type=checkbox]{appearance:none;-webkit-appearance:none;position:relative;flex:0 0 auto;width:36px;height:20px;margin:0;border-radius:999px;background:var(--dsw-alias-border-l2);cursor:pointer;transition:background .15s}',
  '.dsh-cc-switch input[type=checkbox]::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}',
  '.dsh-cc-switch input[type=checkbox]:checked{background:var(--dsw-alias-brand-primary)}',
  '.dsh-cc-switch input[type=checkbox]:checked::after{transform:translateX(16px)}',
  '.dsh-cc-switch input[type=checkbox]:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
  '.dsh-cc-switch input[type=checkbox]:disabled{opacity:.55;cursor:default}',
  '.dsh-cc-mono{font-family:var(--dsw-alias-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;color:var(--dsw-alias-label-tertiary)}',
  '.dsh-cc-warn{margin:0;color:var(--dsw-alias-brand-warning,var(--dsw-alias-brand-danger,#c26a00));font-size:12px;line-height:18px}',
  // DSH on macOS mixes the sidebar column fill down to 40-50% and adds a blue
  // gradient, so the left veil never matched its slider. Paint the column with
  // the sidebar wash instead. The main area stacks two layers of its wash
  // (column + conversation root) while the macOS sidebar root is transparent,
  // so the column stacks the wash twice: equal slider values then look equal.
  'html[data-dsh-cc-bg] [class*="_sidebarCol"]{background:var(--dsw-specific-sidebar-fill)!important}',
  'html[data-dsh-cc-bg][data-platform=darwin] [class*="_sidebarCol"]{background:linear-gradient(var(--dsw-specific-sidebar-fill),var(--dsw-specific-sidebar-fill)),linear-gradient(var(--dsw-specific-sidebar-fill),var(--dsw-specific-sidebar-fill))!important}',
  // readable selection over a photo: a soft accent tint with the normal label.
  // A solid accent fill turned a grey or black wallpaper accent into a heavy slab.
  'html[data-dsh-cc-bg] [role="treeitem"][aria-selected="true"]{color:var(--dsw-alias-label-primary,#1a1d24)!important;background:var(--dsw-alias-interactive-bg-active)!important}',
  'html[data-dsh-cc-bg] .dsh-cc-upload,html[data-dsh-cc-bg] .dsh-cc-btn:not(.dsh-cc-btn-primary){color:var(--dsw-alias-label-primary,#eef1f6)!important}',
  'html[data-dsh-cc-bg] [role="tab"][aria-selected="true"]{color:var(--dsw-alias-label-primary,#eef1f6)!important}',
  'html[data-dsh-cc-bg] body:not([data-ds-dark-theme]) [class*="themeCube"][class*="selected"]{color:#1a1d24!important}',
  'html[data-dsh-cc-bg] body[data-ds-dark-theme] [class*="themeCube"][class*="selected"]{color:#f5f5f5!important}',
  "html[data-dsh-cc-bg] [class*='_file']{color:var(--dsh-cc-on-accent,#fff)!important}",
  "html[data-dsh-cc-bg] [class*='_warning']{color:var(--dsh-cc-on-accent,#fff)!important}",
  // fixed image wallpaper (the veil is painted per side by the theme tokens)
  "html[data-dsh-cc-bg=image]::before{content:'';position:fixed;inset:0;z-index:-1;background-image:var(--dsh-cc-bg-image);background-size:cover;background-position:center;background-repeat:no-repeat}",
  // frosted scrim under assistant markdown only
  'html[data-dsh-cc-frosted][data-dsh-cc-bg] [data-chat-flow-kind=assistant-step] [class*="_markdown_"]{backdrop-filter:blur(8px) saturate(1.1);-webkit-backdrop-filter:blur(8px) saturate(1.1);background:rgba(255,255,255,0.45);border-radius:8px;padding:2px 6px;margin:-2px -6px}',
  'html[data-dsh-cc-frosted][data-dsh-cc-bg] body[data-ds-dark-theme] [data-chat-flow-kind=assistant-step] [class*="_markdown_"]{background:rgba(14,16,22,0.42)}',
].join('')
