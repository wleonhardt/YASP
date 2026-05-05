import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & {
  enabled: boolean;
};

export function SoundIcon({ enabled, className, ...props }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      width="1em"
      height="1em"
      aria-hidden="true"
      {...props}
    >
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {enabled ? (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18 6a8.5 8.5 0 0 1 0 12" />
        </>
      ) : (
        <>
          <path d="m16 9 5 5" />
          <path d="m21 9-5 5" />
        </>
      )}
    </svg>
  );
}
