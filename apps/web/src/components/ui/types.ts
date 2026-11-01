export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'mastered';
export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'ghost' | 'danger';
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

export interface SelectGroup {
  group: string;
  options: SelectOption[];
}

export interface TabItem {
  id: string;
  label: string;
  /** A route: the tabs become page links. */
  to?: string;
  count?: number;
}

export interface RadioOption {
  value: string;
  label: string;
}
