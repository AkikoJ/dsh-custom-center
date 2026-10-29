import { Input as HostInput, Button as PrimitiveButton, Modal as PrimitiveModal } from "@deepseek-ai/dsh-client-ui-primitives";
import * as React from "react";
import type { ModalProps } from "../client-types.js";
import { createDestinationKit } from "../destination-picker.js";
import { createSourceSelect } from "../source-select.js";
import { translateError } from "./messages.js";

type Create = typeof React.createElement;

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { autoSize?: { minRows?: number; maxRows?: number; }; }) {
  const { autoSize, className, rows, ...rest } = props;
  return (<textarea
    {...rest}
    className={["dssm-textarea", className].filter(Boolean).join(" ")}
    rows={autoSize?.minRows || rows || 4}
  />);
}

export const Input = Object.assign(HostInput, { TextArea });

export function foldChevron(open: boolean) {
  return (<svg
    className={"dssm-fold-chevron" + (open ? " is-open" : "")}
    viewBox={"0 0 16 16"}
    width={12}
    height={12}
    fill={"none"}
    stroke={"currentColor"}
    strokeWidth={1.5}
    aria-hidden={true}
  >
    <path
      d={"M4 6l4 4 4-4"}
      strokeLinecap={"round"}
      strokeLinejoin={"round"}
    />
  </svg>);
}

function modalFocusable(modal: HTMLElement): HTMLElement[] {
  return Array.prototype.slice.call(
    modal.querySelectorAll(
      'button:not(:disabled), [href], input:not([type=hidden]):not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) || [],
  );
}

function trapModalFocus(
  modal: HTMLElement,
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "preventDefault">,
) {
  if (event.key !== "Tab") return;
  var focusable = modalFocusable(modal);
  if (!focusable.length) return;
  var active = document.activeElement;
  if (
    active === modal ||
    !modal.contains(active) ||
    (event.shiftKey
      ? active === focusable[0]
      : active === focusable[focusable.length - 1])
  ) {
    event.preventDefault();
    (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
  }
}

function SkillSwitch(props: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return enableSwitch(props.on, props.label, props.disabled, props.onClick);
}

function hostButton(
  label: React.ReactNode,
  onClick: () => void,
  kind: "primary" | "outline" | "danger" = "primary",
  disabled?: boolean,
) {
  const variant = kind === "primary" ? "primary" : "outline";
  const className = kind === "danger" ? "dssm-btn-danger" : undefined;
  return (<PrimitiveButton
    variant={variant}
    className={className}
    disabled={disabled}
    onClick={onClick}
  >
    {label}
  </PrimitiveButton>);
}

function iconButton(
  label: string,
  icon: React.ReactNode,
  onClick: () => void,
  danger?: boolean,
  disabled?: boolean,
) {
  return (<PrimitiveButton
    {...{
      variant: "outline",
      size: "sm",
      className: "dssm-icon-action" + (danger ? " dssm-icon-danger" : ""),
      disabled: disabled,
      "aria-label": label,
      title: label,
      icon: icon,
      style: {
        width: 22,
        minWidth: 22,
        height: 22,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--dsw-radius-sm, 8px)",
      },
      onClick: onClick,
    } as any}
  />);
}

function filterActionButton(
  label: string,
  icon: React.ReactNode,
  onClick: () => void,
  disabled?: boolean,
  tooltip?: string,
) {
  return (<PrimitiveButton
    className={"dssm-icon-action"}
    variant={"outline"}
    size={"sm"}
    disabled={disabled}
    aria-label={label}
    title={tooltip || label}
    icon={icon}
    style={{
      width: 22,
      minWidth: 22,
      height: 22,
      padding: 0,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--dsw-radius-sm, 8px)",
    }}
    onClick={onClick}
  />);
}

function enableSwitch(
  on: boolean,
  label: string,
  disabled: boolean | undefined,
  onToggle: () => void,
) {
  return (<button
    type={"button"}
    role={"switch"}
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    className={"dssm-enable-switch"}
    onClick={function (event?: React.MouseEvent) {
      if (event && typeof event.stopPropagation === "function")
        event.stopPropagation();
      onToggle();
    }}
  >
    <span className={"dssm-enable-switch-thumb"} aria-hidden={"true"} />
  </button>);
}

function recoverModalFocus(
  modal: HTMLElement | null,
  active: Element | null,
  body: HTMLElement,
) {
  if (modal && active === body) modal.focus();
}

function Modal(props: ModalProps) {
  var bodyRef = React.useRef<HTMLDivElement>(null);
  var closeRef = React.useRef(props.onClose);
  closeRef.current = props.onClose;
  function focusPanel() {
    var panel = bodyRef.current;
    if (!panel) return;
    var field = panel.querySelector("input, textarea");
    if (field instanceof HTMLElement) {
      field.focus();
      return;
    }
    panel.tabIndex = -1;
    panel.focus();
  }
  React.useLayoutEffect(function () {
    if (typeof document === "undefined") return;
    var panel = bodyRef.current;
    if (panel) recoverModalFocus(panel, document.activeElement, document.body);
  });
  React.useEffect(function () {
    if (typeof document === "undefined") return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeRef.current();
    }
    document.addEventListener("keydown", onKey, true);
    return function () {
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return (<PrimitiveModal
    open={true}
    title={props.title}
    description={props.description}
    footer={props.footer}
    onClose={props.onClose}
    closeLabel={props.closeLabel || "Close"}
    className={["dssm-modal", props.className].filter(Boolean).join(" ")}
    contentClassName={["dssm-modal-content", props.contentClassName]
      .filter(Boolean)
      .join(" ")}
  >
    {props.children ? (<div ref={bodyRef}>
      {props.children}
    </div>) : undefined}
  </PrimitiveModal>);
}
export { enableSwitch, filterActionButton, hostButton, iconButton, Modal, modalFocusable, recoverModalFocus, SkillSwitch, trapModalFocus };

var SourceSelect = createSourceSelect(React);

var destinationKit = createDestinationKit({
  react: React,
  SourceSelect,
  translateError,
});

var DestinationPicker = destinationKit.DestinationPicker;
export { DestinationPicker, SourceSelect };
