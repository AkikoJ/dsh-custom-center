import type * as React from "react";

export interface ModalProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  description?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export interface SourceSelectProps {
  value?: string;
  label: string;
  disabled?: boolean;
  action?: boolean;
  icon?: React.ReactNode;
  options: {
    value: string;
    label: React.ReactNode;
    disabled?: boolean;
    danger?: boolean;
  }[];
  onChange: (value: string) => void;
}
