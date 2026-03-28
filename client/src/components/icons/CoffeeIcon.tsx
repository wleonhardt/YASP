import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

export function CoffeeIcon({ className, ...props }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width="1em"
      height="1em"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M6 10.75H16.25C17.2165 10.75 18 11.5335 18 12.5V13.25C18 15.4591 16.2091 17.25 14 17.25H8.75C7.23122 17.25 6 16.0188 6 14.5V10.75Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 11.75H18.75C19.9926 11.75 21 12.7574 21 14C21 15.2426 19.9926 16.25 18.75 16.25H17.75"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 19H18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M9 8.25C9 7.08337 10.25 6.55556 10.25 5.25C10.25 4.58026 9.9596 4.01832 9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M12.25 8.25C12.25 7.08337 13.5 6.55556 13.5 5.25C13.5 4.58026 13.2096 4.01832 12.75 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
