import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const validatorPath = fileURLToPath(new URL("../../scripts/check-i18n.mjs", import.meta.url));

const englishLocale = {
  landing: {
    title: "Create room",
    summary: "Using {{label}}",
  },
  room: {
    status: "Ready",
  },
};

const spanishLocale = {
  landing: {
    title: "Crear sala",
    summary: "Usando {{label}}",
  },
  room: {
    status: "Lista",
  },
};

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createFixtureRepo({
  supportedLocales = ["en", "es"],
  english = englishLocale,
  locales = { es: spanishLocale },
  extraLocaleDirs = {},
}) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "yasp-i18n-check-"));
  const configDir = path.join(fixtureRoot, "client", "src", "i18n");
  const localesDir = path.join(configDir, "locales");

  mkdirSync(localesDir, { recursive: true });
  writeFileSync(
    path.join(configDir, "config.ts"),
    `export const SUPPORTED_LOCALES = [${supportedLocales.map((locale) => `"${locale}"`).join(", ")}] as const;\n`,
    "utf8"
  );

  mkdirSync(path.join(localesDir, "en"), { recursive: true });
  writeJson(path.join(localesDir, "en", "common.json"), english);

  for (const [locale, value] of Object.entries(locales)) {
    mkdirSync(path.join(localesDir, locale), { recursive: true });
    writeJson(path.join(localesDir, locale, "common.json"), value);
  }

  for (const [locale, value] of Object.entries(extraLocaleDirs)) {
    mkdirSync(path.join(localesDir, locale), { recursive: true });
    writeJson(path.join(localesDir, locale, "common.json"), value);
  }

  return fixtureRoot;
}

function runValidator(fixtureRoot) {
  const result = spawnSync(process.execPath, [validatorPath], {
    cwd: fixtureRoot,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function withFixture(options, callback) {
  const fixtureRoot = createFixtureRepo(options);

  try {
    callback(fixtureRoot);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

describe("scripts/check-i18n.mjs", () => {
  it("passes for a valid locale file", () => {
    withFixture({}, (fixtureRoot) => {
      const result = runValidator(fixtureRoot);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /i18n validation passed/);
    });
  });

  it("supports hyphenated locale directory names", () => {
    withFixture(
      {
        supportedLocales: ["en", "zh-Hans", "zh-Hant"],
        locales: {
          "zh-Hans": {
            landing: {
              title: "创建房间",
              summary: "使用 {{label}}",
            },
            room: {
              status: "就绪",
            },
          },
          "zh-Hant": {
            landing: {
              title: "建立房間",
              summary: "使用 {{label}}",
            },
            room: {
              status: "就緒",
            },
          },
        },
      },
      (fixtureRoot) => {
        const result = runValidator(fixtureRoot);
        assert.equal(result.status, 0);
        assert.match(result.stdout, /en, zh-Hans, zh-Hant/);
      }
    );
  });

  it("fails when a locale is missing a key", () => {
    withFixture(
      {
        locales: {
          es: {
            landing: {
              title: "Crear sala",
            },
            room: {
              status: "Lista",
            },
          },
        },
      },
      (fixtureRoot) => {
        const result = runValidator(fixtureRoot);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /es:landing.summary is missing/);
      }
    );
  });

  it("fails when placeholders do not match English", () => {
    withFixture(
      {
        locales: {
          es: {
            landing: {
              title: "Crear sala",
              summary: "Usando {{nombre}}",
            },
            room: {
              status: "Lista",
            },
          },
        },
      },
      (fixtureRoot) => {
        const result = runValidator(fixtureRoot);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /es:landing.summary has placeholder mismatches/);
      }
    );
  });

  it("fails when a translation is an empty string", () => {
    withFixture(
      {
        locales: {
          es: {
            landing: {
              title: "",
              summary: "Usando {{label}}",
            },
            room: {
              status: "Lista",
            },
          },
        },
      },
      (fixtureRoot) => {
        const result = runValidator(fixtureRoot);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /es:landing.title must not be empty/);
      }
    );
  });

  it("warns on extra keys without failing", () => {
    withFixture(
      {
        locales: {
          es: {
            ...spanishLocale,
            extra: {
              note: "Solo en español",
            },
          },
        },
      },
      (fixtureRoot) => {
        const result = runValidator(fixtureRoot);
        assert.equal(result.status, 0);
        assert.match(result.stderr, /i18n warnings:/);
        assert.match(result.stderr, /es:extra is extra/);
        assert.match(result.stdout, /i18n validation passed/);
      }
    );
  });
});
