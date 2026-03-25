import { useState } from "react";

type Props = {
  roomId: string;
};

export function SharePanel({ roomId }: Props) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/r/${roomId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: "var(--radius)",
        background: "var(--color-surface)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--color-text-muted)" }}>Room:</span>
      <code style={{ fontWeight: 600 }}>{roomId}</code>
      <button
        onClick={handleCopy}
        style={{
          marginLeft: "auto",
          padding: "4px 12px",
          borderRadius: "var(--radius)",
          background: "var(--color-primary)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </div>
  );
}
