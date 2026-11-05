import { controlCss } from '../../shared/styles.js'

export const CSS = controlCss + `
.dy-field-label{display:flex;align-items:center;gap:2px;min-width:0}
.dy-dm-settings{display:grid;grid-template-columns:1fr;gap:10px}
.dy-page .dy-dm-settings>.dy-card{margin:0;padding:14px 16px}
.dy-dm-settings .dy-card-heading{margin-bottom:8px}
.dy-dm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:28px}
.dy-dm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;padding:9px 0}
.dy-dm-row .dy-field-label{flex:1}
.dy-dm-control{min-width:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.dy-dm-control>.dsh-cc-select{width:100%;max-width:250px}
.dy-dm-grid:has(.dsh-cc-select) .dy-dm-row{flex-direction:column;align-items:stretch;gap:6px}
.dy-dm-grid:has(.dsh-cc-select) .dy-dm-control{align-items:stretch}
.dy-dm-grid:has(.dsh-cc-select) .dy-dm-control>.dsh-cc-select{max-width:none}
.dy-dm-wide{flex-direction:column;align-items:stretch;gap:6px}
.dy-dm-wide .dy-dm-control{align-items:stretch}
.dy-quota{display:flex;align-items:center;gap:7px}
.dy-page .dy-quota>input{width:74px;padding:5px 7px;font-variant-numeric:tabular-nums}
.dy-page input:disabled{color:var(--dsw-alias-label-tertiary)}
.dy-quota>label{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dy-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:5px 7px;background:var(--dsw-alias-bg-layer-2)}
.dy-tags:focus-within{border-color:var(--dsw-alias-brand-primary)}
.dy-tag-list{display:contents}
.dy-tag{display:inline-flex;align-items:center;gap:4px;max-width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-layer-1);padding-left:8px}
.dy-tag>span{overflow-wrap:anywhere;min-width:0}
.dy-page .dy-tag>button{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;min-height:26px;width:26px;padding:0;color:var(--dsw-alias-label-secondary);font-size:17px}
.dy-page .dy-tags>input,.dy-page .dy-tags>input:focus,.dy-page .dy-tags>input:focus-visible{flex:1 1 160px;width:auto;min-width:120px;border:0;border-radius:0;background:transparent;box-shadow:none;min-height:28px;padding:2px 4px;outline:none}
.dy-page .dsh-cc-select-btn{background:var(--dsw-alias-bg-layer-2);padding:0 10px;border-radius:8px;text-align:left}
.dy-page .dsh-cc-select-btn:focus-visible,.dy-page .dsh-cc-select-btn[aria-expanded=true]{outline-offset:1px}
.dy-page .dsh-cc-select-list{max-width:100%;width:100%}
.dy-model-toggle{display:flex;align-items:center;gap:8px}
.dy-model-toggle .cc-detail-content{left:auto;right:0}
.dy-dm-status{border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px;margin-top:12px}
.dy-dm-status-row,.dy-dm-status-label,.dy-dm-status-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dy-dm-status-row{justify-content:space-between;gap:8px 16px}
.dy-dm-status-label{min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dy-dm-status-actions{gap:4px}
.dy-page .dy-dm-status-actions button{min-height:30px;padding:4px 8px;font-size:12px;border-color:transparent;background:transparent}
.dy-page .dy-dm-status-actions button:hover{background:var(--dsw-alias-interactive-bg-hover)}
@container(max-width:700px){.dy-dm-grid{grid-template-columns:1fr;column-gap:0}}

.dy-page{color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1.5;max-width:960px;width:100%;min-width:0;margin:0 auto;padding:20px;box-sizing:border-box;overflow-wrap:anywhere;container-type:inline-size}
.dy-page *{box-sizing:border-box}
.dy-page h1{font-size:22px;font-weight:650;line-height:1.35;letter-spacing:-.01em;margin:0}
.dy-page h2{font-size:15px;font-weight:600;line-height:1.5;margin:0 0 12px}
.dy-page h3{font-size:13px;font-weight:600;margin:16px 0 8px}
.dy-page p{margin:4px 0;color:var(--dsw-alias-label-secondary)}
.dy-page small{font-size:12px;line-height:1.5}
.dy-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
.dy-heading>div:first-child{min-width:0}
.dy-heading p{font-size:12px;margin-top:4px}
.dy-save{display:flex;flex-shrink:0;align-items:flex-end;flex-direction:column;gap:4px;min-width:104px}
.dy-page .dy-save .dy-primary{width:100%;min-height:34px}
.dy-save-status{font-size:12px;color:var(--dsw-alias-label-secondary);text-align:right}
.dy-save-status:empty{display:none}
.dy-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}
.dy-toolbar:first-child{margin-top:0}
.dy-toolbar:last-child{margin-bottom:0}
.dy-toolbar h2{margin:0 auto 0 0}
.dy-toolbar>input{flex:1;min-width:100px;width:140px}
.dy-toolbar>label{flex-shrink:0;color:var(--dsw-alias-label-secondary)}
.dy-page button,.dy-page input,.dy-page select,.dy-page textarea{font:inherit;line-height:1.5;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;min-height:34px;padding:6px 11px;max-width:100%;min-width:0}
.dy-page input,.dy-page select,.dy-page textarea{background:var(--dsw-alias-bg-layer-2);transition:background .15s,border-color .15s}
.dy-page input:focus,.dy-page select:focus,.dy-page textarea:focus{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-brand-primary)}
.dy-page button{cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s}
.dy-page button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dy-page button:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.dy-page .dy-primary{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-brand-primary-invert);font-weight:600}
.dy-page .dy-primary:hover:not(:disabled),.dy-page .dy-primary:active:not(:disabled){background:var(--dsw-alias-button-primary-hover);border-color:var(--dsw-alias-button-primary-hover)}
.dy-page button[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-active)}
.dy-page button:disabled{opacity:1;cursor:not-allowed;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
.dy-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dy-page textarea{display:block;width:100%;min-height:88px;resize:vertical}
.dy-page textarea[rows]{max-height:280px}
.dy-page input[type=checkbox]{width:17px;height:17px;min-height:17px;margin:0;padding:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dy-tabs{display:flex;align-items:stretch;gap:20px;overflow-x:auto;scrollbar-width:thin;border-bottom:1px solid var(--dsw-alias-border-l1);margin:16px 0 14px;padding:0 2px}
.dy-page .dy-tabs button{position:relative;flex:0 0 auto;min-height:38px;padding:8px 2px 10px;border:0;border-radius:0;background:transparent;color:var(--dsw-alias-label-secondary)}
.dy-page .dy-tabs button:hover{background:transparent;color:var(--dsw-alias-label-primary)}
.dy-page .dy-tabs button[aria-selected=true]{font-weight:600;color:var(--dsw-alias-brand-primary)}
.dy-tabs button[aria-selected=true]::after{content:'';position:absolute;inset:auto 0 -1px;height:2px;background:var(--dsw-alias-brand-primary);border-radius:2px 2px 0 0}
.dy-page .dy-tabs button:focus-visible{outline-offset:-3px;border-radius:4px}
.dy-overview{padding:12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px}
.dy-status-line{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dy-status-line>span{display:inline-flex;gap:6px;align-items:center;min-width:0;min-height:28px;padding:4px 9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px}
.dy-status-line strong{color:var(--dsw-alias-label-primary);font-weight:600;font-variant-numeric:tabular-nums}
.dy-status-dot{width:6px;height:6px;flex-shrink:0;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.dy-status-dot[data-active=true]{background:var(--dsw-alias-state-success-primary)}
.dy-overview-actions{display:flex;align-items:center;gap:8px;margin:10px 0 0;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}
.dy-overview-actions>span{margin-right:auto;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dy-page .dy-overview-actions button{min-height:28px;padding:3px 7px;font-size:12px;border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}
.dy-page .dy-overview-actions button:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dy-page .dy-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:16px;margin:12px 0}
.dy-page [role=tabpanel]>.dy-card:first-child{margin-top:0}
.dy-card-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.dy-card-heading h2{margin:0}
.dy-page .dy-card .dy-card{background:var(--dsw-alias-bg-layer-2);padding:12px}
.dy-account-state{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;padding:4px 9px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;white-space:nowrap}
.dy-account-state[data-active=true]{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}
.dy-account-header{display:flex;align-items:center;gap:12px;padding:0 0 16px;margin:0 0 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dy-account-avatar{position:relative;display:block;width:54px;height:54px;flex:0 0 54px;border-radius:50%;overflow:visible;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary)}
.dy-account-avatar>img{width:100%;height:100%;display:block;object-fit:cover;border-radius:50%}
.dy-account-avatar>svg{width:100%;height:100%;padding:10px;border-radius:50%}
.dy-account-avatar>.dy-status-dot{position:absolute;right:-1px;bottom:-1px;width:11px;height:11px;border:2px solid var(--dsw-alias-bg-layer-1)}
.dy-account-identity{display:flex;flex-direction:column;gap:3px;min-width:0}
.dy-account-identity>strong{font-size:17px;line-height:1.4;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dy-account-presence{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dy-account-presence[data-active=true]{color:var(--dsw-alias-state-success-primary)}
.dy-account-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-left:auto}
.dy-environment-count{padding:3px 8px;border-radius:999px;background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label);font-size:12px;white-space:nowrap}
.dy-environment-list{display:grid;gap:0}
.dy-page .dy-environment-issue{display:flex;align-items:center;gap:16px;padding:12px 0}
.dy-environment-copy{min-width:0;flex:1}
.dy-environment-copy>strong{font-size:13px;font-weight:600}
.dy-environment-copy>p{margin:3px 0}
.dy-environment-copy>small{display:block;margin-top:4px;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;word-break:break-word}
.dy-environment-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;flex-shrink:0}
.dy-page a.dy-download{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:6px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;line-height:1.5;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background .15s,border-color .15s,color .15s}
.dy-page a.dy-download:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-brand-primary)}
.dy-environment-log{margin-top:8px}
.dy-field{display:grid;grid-template-columns:minmax(140px,.85fr) minmax(180px,1.15fr);gap:16px;align-items:center;padding:11px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dy-field:last-child{border-bottom:0}
.dy-field label{min-width:0}
.dy-field small{display:block;color:var(--dsw-alias-label-secondary);margin-top:3px}
.dy-control{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;min-width:0}
.dy-control>input:not([type=checkbox]),.dy-control>select,.dy-field>input:not([type=checkbox]),.dy-field>select{width:100%}
.dy-control>input[type=number]{max-width:128px}
.dy-field input[type=checkbox]{justify-self:end}
.dy-field-wide{grid-template-columns:1fr;gap:8px;align-items:start}
.dy-config-item+.dy-config-item>.dy-field{border-top:1px solid var(--dsw-alias-border-l1)}
.dy-config-item>.dy-field{border-bottom:0}
.dy-config-item.dy-config-group>.dy-field{border-top:0}
.dy-page .dy-group-title{margin:18px 0 0;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600}
.dy-config-item:first-child>.dy-group-title{margin-top:0;padding-top:0;border-top:0}
.dy-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 14px}
.dy-stats>div{min-width:0;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dy-stats strong{display:block;margin-top:3px;font-size:24px;line-height:1.25;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.dy-daily-actions{margin-bottom:8px}
.dy-page .dy-dirty-hint{color:var(--dsw-alias-state-warn-label);font-size:12px}
.dy-page dl{margin:8px 0}
.dy-page dl>div{display:grid;grid-template-columns:minmax(100px,.7fr) minmax(0,1fr);gap:12px;padding:6px 0;font-size:12px}
.dy-page dt{font-weight:400;color:var(--dsw-alias-label-secondary)}
.dy-page dd{margin:0;min-width:0;color:var(--dsw-alias-label-primary)}
.dy-page details{margin:8px 0}
.dy-page summary{width:100%;max-width:100%;min-height:34px;padding:7px 6px;cursor:pointer;border-radius:6px;color:var(--dsw-alias-label-secondary);font-size:12px;transition:background .15s,color .15s}
.dy-page summary:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dy-page details[open]>summary{color:var(--dsw-alias-label-primary);margin-bottom:6px}
.dy-page .dy-details{border-top:1px solid var(--dsw-alias-border-l1);padding-top:3px;margin:10px 0 0}
.dy-error,.dy-page .dy-error{color:var(--dsw-alias-state-error-primary)}
.dy-feedback{padding:9px 11px;margin:8px 0;border:1px solid var(--dsw-alias-state-error-secondary);border-radius:7px;background:var(--dsw-alias-state-error-tertiary);white-space:pre-wrap}
.dy-page pre{white-space:pre-wrap;word-break:break-word;font:inherit;font-size:12px;max-height:320px;overflow:auto;margin:8px 0;padding:12px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px}
.dy-page article:not(.dy-video){padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dy-videos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.dy-video{color:inherit;text-decoration:none;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;transition:border-color .15s}
.dy-video:hover{border-color:var(--dsw-alias-brand-primary)}
.dy-video .dy-preview{aspect-ratio:16/10;width:100%;object-fit:cover;background:var(--dsw-alias-bg-layer-2);display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)}
.dy-video .dy-caption{padding:10px}
.dy-video strong{display:block;font-size:13px;font-weight:500}
.dy-qr{display:block;max-width:176px;width:100%;margin:10px auto;padding:8px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px}
.dy-publish{border:1px solid var(--dsw-alias-brand-primary);padding:14px;border-radius:10px;margin-top:12px}
.dy-page fieldset{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:12px;margin:12px 0;min-width:0}
.dy-page legend{font-size:12px;padding:0 4px;color:var(--dsw-alias-label-secondary)}
@container(max-width:440px){.dy-page{padding:16px}.dy-heading{flex-wrap:wrap}.dy-save{flex-direction:row;align-items:center;margin-left:auto}.dy-save-status{text-align:left}.dy-tabs{gap:14px}.dy-field{gap:10px}.dy-overview-actions{flex-wrap:wrap}.dy-overview-actions>span{flex-basis:100%}.dy-page .dy-card{padding:14px}.dy-account-header{flex-wrap:wrap}.dy-account-identity{flex:1}.dy-account-actions{flex-basis:100%;justify-content:flex-start;margin-left:66px}.dy-page .dy-environment-issue{align-items:flex-start;flex-direction:column;gap:10px}.dy-environment-actions{justify-content:flex-start}}
@container(max-width:360px){.dy-field{grid-template-columns:1fr;gap:8px}.dy-field input[type=checkbox]{justify-self:start}.dy-control{justify-content:flex-start}.dy-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.dy-videos{grid-template-columns:repeat(2,minmax(0,1fr))}.dy-save{width:100%;margin-left:0}.dy-page .dy-save .dy-primary{width:auto;min-width:104px}.dy-account-actions{margin-left:0}.dy-account-identity>strong{font-size:16px}}
@media(pointer:coarse){.dy-page button,.dy-page a.dy-download,.dy-page .dy-overview-actions button,.dy-page input:not([type=checkbox]),.dy-page select,.dy-page summary{min-height:44px}.dy-page .dy-tabs button{min-height:44px}.dy-page input[type=checkbox]{width:20px;height:20px;min-height:20px}.dy-control:has(>input[type=checkbox]){min-height:44px;align-items:center}}
@media(prefers-reduced-motion:reduce){.dy-page button,.dy-page a.dy-download,.dy-page input,.dy-page select,.dy-page textarea,.dy-page summary,.dy-video{transition:none}}
`
