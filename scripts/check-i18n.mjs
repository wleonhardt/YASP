import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const localesRoot = path.join(repoRoot, "client", "src", "i18n", "locales");
const configPath = path.join(repoRoot, "client", "src", "i18n", "config.ts");
const defaultLocale = "en";
const namespaceFile = "common.json";

function parseSupportedLocales(configSource) {
  const match = configSource.match(/SUPPORTED_LOCALES\s*=\s*\[([^\]]+)\]\s*as const/);
  if (!match) {
    throw new Error(`Could not parse SUPPORTED_LOCALES from ${configPath}`);
  }

  const locales = Array.from(match[1].matchAll(/"([^"]+)"/g), (token) => token[1]);
  if (!locales.includes(defaultLocale)) {
    throw new Error(`Default locale "${defaultLocale}" is missing from SUPPORTED_LOCALES`);
  }

  return locales;
}

function extractPlaceholders(value) {
  return new Set(Array.from(value.matchAll(/{{\s*([^{}\s]+)\s*}}/g), (match) => match[1]));
}

function comparePlaceholderSets(source, target) {
  const sourceTokens = extractPlaceholders(source);
  const targetTokens = extractPlaceholders(target);

  if (sourceTokens.size !== targetTokens.size) {
    return false;
  }

  for (const token of sourceTokens) {
    if (!targetTokens.has(token)) {
      return false;
    }
  }

  return true;
}

function compareLocaleValues({ source, target, locale, currentPath, errors, warnings }) {
  const sourceIsArray = Array.isArray(source);
  const targetIsArray = Array.isArray(target);

  if (sourceIsArray || targetIsArray) {
    if (!sourceIsArray || !targetIsArray) {
      errors.push(`${locale}:${currentPath} should match the English value type`);
      return;
    }

    for (let index = 0; index < source.length; index += 1) {
      const nextPath = `${currentPath}[${index}]`;
      if (!(index in target)) {
        errors.push(`${locale}:${nextPath} is missing`);
        continue;
      }

      compareLocaleValues({
        source: source[index],
        target: target[index],
        locale,
        currentPath: nextPath,
        errors,
        warnings,
      });
    }

    if (target.length > source.length) {
      for (let index = source.length; index < target.length; index += 1) {
        warnings.push(`${locale}:${currentPath}[${index}] is extra`);
      }
    }

    return;
  }

  const sourceType = typeof source;
  const targetType = typeof target;

  if (source && sourceType === "object") {
    if (!target || targetType !== "object") {
      errors.push(`${locale}:${currentPath} should be an object`);
      return;
    }

    for (const [key, value] of Object.entries(source)) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;

      if (!(key in target)) {
        errors.push(`${locale}:${nextPath} is missing`);
        continue;
      }

      compareLocaleValues({
        source: value,
        target: target[key],
        locale,
        currentPath: nextPath,
        errors,
        warnings,
      });
    }

    for (const key of Object.keys(target)) {
      if (!(key in source)) {
        const nextPath = currentPath ? `${currentPath}.${key}` : key;
        warnings.push(`${locale}:${nextPath} is extra`);
      }
    }

    return;
  }

  if (sourceType !== targetType) {
    errors.push(`${locale}:${currentPath} should be a ${sourceType}`);
    return;
  }

  if (sourceType === "string") {
    if (target.trim() === "") {
      errors.push(`${locale}:${currentPath} must not be empty`);
      return;
    }

    if (!comparePlaceholderSets(source, target)) {
      errors.push(`${locale}:${currentPath} has placeholder mismatches`);
    }
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const configSource = await readFile(configPath, "utf8");
  const supportedLocales = parseSupportedLocales(configSource);
  const sourcePath = path.join(localesRoot, defaultLocale, namespaceFile);
  const source = await readJson(sourcePath);
  const errors = [];
  const warnings = [];

  compareLocaleValues({
    source,
    target: source,
    locale: defaultLocale,
    currentPath: "",
    errors,
    warnings: [],
  });

  for (const locale of supportedLocales) {
    const localeFile = path.join(localesRoot, locale, namespaceFile);
    let localeStats;

    try {
      localeStats = await stat(localeFile);
    } catch {
      errors.push(`${locale}:${namespaceFile} is missing`);
      continue;
    }

    if (!localeStats.isFile()) {
      errors.push(`${locale}:${namespaceFile} is not a file`);
      continue;
    }

    if (locale === defaultLocale) {
      continue;
    }

    const target = await readJson(localeFile);
    compareLocaleValues({
      source,
      target,
      locale,
      currentPath: "",
      errors,
      warnings,
    });
  }

  const localeDirs = await readdir(localesRoot, { withFileTypes: true });
  const sortedLocaleDirs = localeDirs.toSorted((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedLocaleDirs) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (!supportedLocales.includes(entry.name)) {
      warnings.push(`${entry.name}:${namespaceFile} exists on disk but is not listed in SUPPORTED_LOCALES`);
    }
  }

  if (warnings.length > 0) {
    console.warn("i18n warnings:");
    for (const warning of warnings) {
      console.warn(`  - ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error("i18n validation failed:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`i18n validation passed for locales: ${supportedLocales.join(", ")}`);
}

await main();
