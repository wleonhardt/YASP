import type { ReactNode } from "react";

type BannerTone = "info" | "warning" | "error";

type Props = {
  tone?: BannerTone;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function Banner({
  tone = "info",
  title,
  children,
  actions,
}: Props) {
  return (
    <div className={`ui-banner ui-banner--${tone}`} role="status">
      <div className="ui-banner__body">
        {title && <h3 className="ui-banner__title">{title}</h3>}
        <div className="ui-banner__message">{children}</div>
      </div>
      {actions && <div className="ui-banner__actions">{actions}</div>}
    </div>
  );
}
