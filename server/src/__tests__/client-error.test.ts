import { afterEach, describe, expect, it } from "vitest";
import {
  __resetClientErrorGlobalRateForTests,
  normalizeClientErrorReport,
  recordAndCheckGlobalClientErrorRate,
  recordAndCheckPerIpClientErrorRate,
  redactReferer,
  sanitizeInlineString,
  sanitizeMultilineString,
  sanitizeUrl,
  sanitizeUserAgent,
} from "../transport/client-error.js";
import {
  CLIENT_ERROR_GLOBAL_RATE_MAX,
  CLIENT_ERROR_GLOBAL_RATE_WINDOW_MS,
  CLIENT_ERROR_USER_AGENT_MAX_LENGTH,
} from "../config.js";

afterEach(() => {
  __resetClientErrorGlobalRateForTests();
});

describe("sanitizeInlineString", () => {
  it("strips ASCII control chars and normalizes whitespace to single spaces", () => {
    const input = "a\u0000b\u001bc\r\nd\te  \u007Ff";
    expect(sanitizeInlineString(input, 100)).toBe("abc d e f");
  });

  it("returns null for non-string / empty input", () => {
    expect(sanitizeInlineString(undefined, 100)).toBeNull();
    expect(sanitizeInlineString(42, 100)).toBeNull();
    expect(sanitizeInlineString("   \t\n ", 100)).toBeNull();
  });

  it("truncates to maxLength", () => {
    expect(sanitizeInlineString("x".repeat(200), 50)).toHaveLength(50);
  });
});

describe("sanitizeMultilineString", () => {
  it("keeps LF, drops CR, strips other control chars", () => {
    const input = "line1\r\nline2\u0000\nline3\u001b";
    expect(sanitizeMultilineString(input, 100)).toBe("line1\nline2\nline3");
  });

  it("returns null for empty input", () => {
    expect(sanitizeMultilineString("\u0000\u0000", 100)).toBeNull();
  });
});

describe("sanitizeUrl", () => {
  it("returns origin + pathname, dropping query and fragment", () => {
    expect(sanitizeUrl("https://app.yasp.team/r/ROOM01?token=x#section")).toBe(
      "https://app.yasp.team/r/ROOM01"
    );
  });

  it("rejects non-http(s) schemes", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("data:text/html,<script>")).toBeNull();
    expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects unparseable values", () => {
    expect(sanitizeUrl("not a url")).toBeNull();
    expect(sanitizeUrl(undefined)).toBeNull();
  });
});

describe("sanitizeUserAgent", () => {
  it("truncates to CLIENT_ERROR_USER_AGENT_MAX_LENGTH", () => {
    const long = "Mozilla/5.0 ".repeat(60);
    const result = sanitizeUserAgent(long);
    expect(result?.length).toBe(CLIENT_ERROR_USER_AGENT_MAX_LENGTH);
  });

  it("strips control chars", () => {
    expect(sanitizeUserAgent("Mozilla\u0000/5.0")).toBe("Mozilla/5.0");
  });
});

describe("redactReferer", () => {
  it("redacts query and fragment", () => {
    expect(redactReferer("https://app.yasp.team/r/ROOM01?invite=abc#s")).toBe(
      "https://app.yasp.team/r/ROOM01"
    );
  });

  it("uses first value when header is an array", () => {
    expect(redactReferer(["https://a.example.com/x?q=1", "https://b.example.com/"])).toBe(
      "https://a.example.com/x"
    );
  });

  it("returns null for missing or non-http values", () => {
    expect(redactReferer(undefined)).toBeNull();
    expect(redactReferer("ftp://old.example.com/")).toBeNull();
  });
});

describe("normalizeClientErrorReport — strict whitelist", () => {
  it("drops unknown fields entirely", () => {
    const normalized = normalizeClientErrorReport({
      type: "error",
      message: "Boom",
      reason: "attacker",
      name: "attacker",
      bonusField: { nested: "ignored" },
      __proto__: { polluted: true },
    });
    const asJson = JSON.stringify(normalized);
    expect(asJson).not.toContain("attacker");
    expect(asJson).not.toContain("bonusField");
    expect(asJson).not.toContain("polluted");
  });

  it("coerces unrecognized reportType to 'unknown'", () => {
    expect(normalizeClientErrorReport({ type: "evil", message: "x" }).reportType).toBe("unknown");
  });

  it("accepts error, unhandledrejection, unknown", () => {
    expect(normalizeClientErrorReport({ type: "error", message: "x" }).reportType).toBe("error");
    expect(normalizeClientErrorReport({ type: "unhandledrejection", message: "x" }).reportType).toBe(
      "unhandledrejection"
    );
  });

  it("falls back to a placeholder message when missing", () => {
    const n = normalizeClientErrorReport({ type: "error" });
    expect(typeof n.message).toBe("string");
    expect((n.message as string).length).toBeGreaterThan(0);
  });

  it("rejects non-ISO timestamps and non-finite numbers", () => {
    const n = normalizeClientErrorReport({
      type: "error",
      message: "x",
      timestamp: "yesterday",
      line: Number.NaN,
      column: Number.POSITIVE_INFINITY,
    });
    expect(n.context.reportedAt).toBeNull();
    expect(n.context.line).toBeNull();
    expect(n.context.column).toBeNull();
  });

  it("ignores non-object bodies without crashing", () => {
    expect(normalizeClientErrorReport("raw string").reportType).toBe("unknown");
    expect(normalizeClientErrorReport(null).reportType).toBe("unknown");
    expect(normalizeClientErrorReport(["a", 1]).reportType).toBe("unknown");
  });
});

describe("recordAndCheckGlobalClientErrorRate", () => {
  it("allows exactly CLIENT_ERROR_GLOBAL_RATE_MAX requests per window, then limits", () => {
    const start = 1_000_000;
    for (let i = 0; i < CLIENT_ERROR_GLOBAL_RATE_MAX; i++) {
      expect(recordAndCheckGlobalClientErrorRate(start)).toBe(false);
    }
    expect(recordAndCheckGlobalClientErrorRate(start)).toBe(true);
  });

  it("resets on window rollover", () => {
    const start = 1_000_000;
    for (let i = 0; i < CLIENT_ERROR_GLOBAL_RATE_MAX + 1; i++) {
      recordAndCheckGlobalClientErrorRate(start);
    }
    const after = start + CLIENT_ERROR_GLOBAL_RATE_WINDOW_MS + 1;
    expect(recordAndCheckGlobalClientErrorRate(after)).toBe(false);
  });
});

describe("recordAndCheckPerIpClientErrorRate", () => {
  it("limits per key, independently of other keys", () => {
    const t = 1_000_000;
    for (let i = 0; i < 10; i++) {
      expect(recordAndCheckPerIpClientErrorRate("1.1.1.1", t)).toBe(false);
    }
    expect(recordAndCheckPerIpClientErrorRate("1.1.1.1", t)).toBe(true);
    // Independent key still fresh.
    expect(recordAndCheckPerIpClientErrorRate("2.2.2.2", t)).toBe(false);
  });
});
