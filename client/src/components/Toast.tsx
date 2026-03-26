export type ToastIntent = "info" | "success" | "error";

export type ToastState = {
  intent: ToastIntent;
  message: string;
};

type Props = {
  toast: ToastState | null;
};

export function Toast({ toast }: Props) {
  if (!toast) {
    return null;
  }

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      <div className={`toast toast--${toast.intent}`}>{toast.message}</div>
    </div>
  );
}
