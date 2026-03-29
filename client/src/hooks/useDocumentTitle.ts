import { useEffect } from "react";

const BASE_TITLE = "YASP";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${BASE_TITLE}` : BASE_TITLE;
  }, [title]);

  useEffect(
    () => () => {
      document.title = BASE_TITLE;
    },
    []
  );
}
