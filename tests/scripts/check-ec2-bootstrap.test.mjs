// Lightweight assertion that cdk/lib/ec2-origin-bootstrap.ts emits the Docker
// runtime hardening flags required by the security remediation plan (PR D /
// F-14, F-15, F-16). This is a grep-style test — we intentionally don't
// instantiate the CDK construct here because that would pull in aws-cdk-lib
// from a non-workspace package; a text scan is sufficient to catch the
// regression where someone accidentally removes a hardening flag.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const bootstrapPath = fileURLToPath(new URL("../../cdk/lib/ec2-origin-bootstrap.ts", import.meta.url));
const source = readFileSync(bootstrapPath, "utf8");

describe("ec2-origin-bootstrap hardening flags (PR D)", () => {
  const requiredFlags = [
    "--read-only",
    "--tmpfs /tmp",
    "--cap-drop ALL",
    "--security-opt no-new-privileges",
    "--pids-limit 256",
    "--memory 512m",
    "--memory-swap 512m",
    "--cpus 1.0",
  ];

  for (const flag of requiredFlags) {
    it(`passes ${flag} to docker run`, () => {
      assert.ok(
        source.includes(flag),
        `Expected cdk/lib/ec2-origin-bootstrap.ts to include Docker runtime flag "${flag}". ` +
          `This is part of PR D (F-16) runtime hardening and must not be removed without a replacement.`
      );
    });
  }

  it("preserves loopback-only publish so nginx can still reach the container", () => {
    assert.ok(
      /--publish 127\.0\.0\.1:\$\{props\.containerPort\}:\$\{props\.containerPort\}/.test(source),
      "EC2 bootstrap must keep --publish bound to 127.0.0.1 for the nginx loopback proxy"
    );
  });

  it("preserves the awslogs driver (CloudWatch logging)", () => {
    assert.ok(
      source.includes("--log-driver awslogs"),
      "CloudWatch log driver flag missing — --read-only does not affect it, but someone dropped it"
    );
  });

  it("reclaims unused Docker state before pulling a new image", () => {
    const expectedCleanupCommands = [
      "docker container prune -f",
      "docker image prune -af",
      "docker builder prune -af",
      "docker volume prune -f",
      'docker pull "$IMAGE_IDENTIFIER"',
    ];

    for (const command of expectedCleanupCommands) {
      assert.ok(
        source.includes(command),
        `Expected cdk/lib/ec2-origin-bootstrap.ts to include "${command}" for deploy-time disk-pressure recovery`
      );
    }
  });

  it("logs host and Docker disk usage around cleanup", () => {
    assert.ok(source.includes("log_disk_state() {"), "Expected bootstrap script to define log_disk_state()");
    assert.ok(source.includes("--- disk state before Docker reclaim ---"), "Expected cleanup pre-state logging");
    assert.ok(source.includes("--- disk state after Docker reclaim ---"), "Expected cleanup post-state logging");
  });
});

describe("Dockerfile runtime posture (PR D)", () => {
  const dockerfilePath = fileURLToPath(new URL("../../Dockerfile", import.meta.url));
  const dockerfile = readFileSync(dockerfilePath, "utf8");
  const expectedNodeBaseImage =
    "node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293";

  it("runs the production stage as the non-root `node` user (F-14)", () => {
    assert.ok(/\nUSER node\b/.test(dockerfile), "Expected `USER node` in the Dockerfile production stage");
  });

  it("declares a HEALTHCHECK hitting /api/health (F-15)", () => {
    assert.ok(/HEALTHCHECK[\s\S]*?\/api\/health/.test(dockerfile), "Expected a HEALTHCHECK for /api/health");
  });

  it("pins both Docker stages to the approved Node base-image digest", () => {
    const fromLines = dockerfile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("FROM "));

    assert.deepEqual(
      fromLines,
      [`FROM ${expectedNodeBaseImage} AS base`, `FROM ${expectedNodeBaseImage}`],
      "Expected both Docker stages to stay pinned to the approved Node base-image digest"
    );
  });

  it("removes npm, npx, and corepack from the runtime image", () => {
    assert.ok(
      /RUN rm -rf \/usr\/local\/lib\/node_modules\/npm[\s\S]*?rm -f \/usr\/local\/bin\/npm \/usr\/local\/bin\/npx \/usr\/local\/bin\/corepack/.test(
        dockerfile
      ),
      "Expected the Dockerfile runtime stage to remove the unused npm toolchain"
    );
  });
});
