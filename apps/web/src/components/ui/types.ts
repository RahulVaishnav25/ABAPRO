export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'start' | 'end';
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface TabItem {
  id: string;
  label: string;
}

export interface RadioOption {
  value: string;
  label: string;
}
