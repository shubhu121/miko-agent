import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './classnames';

export interface CardShellProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

export function CardShell({
  title,
  description,
  actions,
  footer,
  children,
  className,
  ...sectionProps
}: CardShellProps) {
  return (
    <section {...sectionProps} className={cx('miko-plugin-card', className)}>
      {(title || description || actions) && (
        <header className="miko-plugin-card-header">
          <div className="miko-plugin-card-heading">
            {title && <h2 className="miko-plugin-card-title">{title}</h2>}
            {description && <p className="miko-plugin-card-description">{description}</p>}
          </div>
          {actions && <div className="miko-plugin-card-actions">{actions}</div>}
        </header>
      )}
      <div className="miko-plugin-card-body">{children}</div>
      {footer && <footer className="miko-plugin-card-footer">{footer}</footer>}
    </section>
  );
}

export interface SettingRowProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  hint?: ReactNode;
  control: ReactNode;
  layout?: 'inline' | 'stacked';
}

export function SettingRow({
  label,
  hint,
  control,
  layout = 'inline',
  className,
  ...rowProps
}: SettingRowProps) {
  return (
    <div
      {...rowProps}
      className={cx(
        'miko-plugin-setting-row',
        layout === 'stacked' ? 'miko-plugin-setting-row-stacked' : 'miko-plugin-setting-row-inline',
        className,
      )}
    >
      <div className="miko-plugin-setting-text">
        <div className="miko-plugin-setting-label">{label}</div>
        {hint && <div className="miko-plugin-setting-hint">{hint}</div>}
      </div>
      <div className="miko-plugin-setting-control">{control}</div>
    </div>
  );
}

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action, className, ...rootProps }: EmptyStateProps) {
  return (
    <div {...rootProps} className={cx('miko-plugin-empty', className)}>
      {icon && <div className="miko-plugin-empty-icon">{icon}</div>}
      <div className="miko-plugin-empty-title">{title}</div>
      {description && <div className="miko-plugin-empty-description">{description}</div>}
      {action && <div className="miko-plugin-empty-action">{action}</div>}
    </div>
  );
}

export interface ListItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}

export interface ListProps extends HTMLAttributes<HTMLUListElement> {
  items: ListItem[];
}

export function List({ items, className, ...listProps }: ListProps) {
  return (
    <ul {...listProps} className={cx('miko-plugin-list', className)}>
      {items.map((item) => (
        <li key={item.id} className="miko-plugin-list-item">
          {item.icon && <div className="miko-plugin-list-icon">{item.icon}</div>}
          <div className="miko-plugin-list-main">
            <div className="miko-plugin-list-line">
              <span className="miko-plugin-list-title">{item.title}</span>
              {item.meta && <span className="miko-plugin-list-meta">{item.meta}</span>}
            </div>
            {item.description && <div className="miko-plugin-list-description">{item.description}</div>}
          </div>
          {item.action && <div className="miko-plugin-list-action">{item.action}</div>}
        </li>
      ))}
    </ul>
  );
}
