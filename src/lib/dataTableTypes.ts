export interface Column {
  key: string;
  label: string;
  render?: (row: Record<string, string>) => React.ReactNode;
}

export interface DetailField {
  key: string;
  label: string;
}

export interface RowActionItem {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  destructive?: boolean;
}
