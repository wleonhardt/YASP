import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

function formatViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .map((violation) => {
      const targets = violation.nodes.flatMap((node) => node.target).join(", ");
      return `${violation.id}: ${violation.help} [${targets}]`;
    })
    .join("\n");
}

async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, formatViolations(results.violations)).toEqual([]);
}

async function prepareLanding(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByLabel("Display name").fill("A11y Tester");
  await expect(page.getByRole("button", { name: "Create room" })).toBeEnabled();
}

async function openDeckCustomizationModal(page: Page) {
  await prepareLanding(page);
  await page.getByRole("button", { name: "Customize" }).click();
  const dialog = page.getByRole("dialog", { name: "Customize deck" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function createRoom(page: Page) {
  await prepareLanding(page);
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]+$/);
  const roomId = page.url().split("/r/")[1];
  expect(roomId).toMatch(/^[A-Z0-9]+$/);
  return roomId;
}

async function joinRoomAsParticipant(context: BrowserContext, roomId: string, displayName: string) {
  const page = await context.newPage();
  await page.goto(`/r/${roomId}`);
  await expect(page.getByRole("heading", { name: `Join room ${roomId}` })).toBeVisible();
  await page.getByLabel("Display name").fill(displayName);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByRole("main")).toBeVisible();
  return page;
}

test("landing page is free of detectable accessibility violations", async ({ page }) => {
  await prepareLanding(page);
  await expectNoAccessibilityViolations(page);
});

test("deck customization modal is free of detectable accessibility violations", async ({ page }) => {
  await openDeckCustomizationModal(page);
  await expectNoAccessibilityViolations(page);
});

test("room page basic state is free of detectable accessibility violations", async ({ page }) => {
  await createRoom(page);
  await expect(page.getByRole("main")).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

test("transfer-host disclosure open state is free of detectable accessibility violations", async ({
  page,
  browser,
}) => {
  const roomId = await createRoom(page);
  const participantContext = await browser.newContext();

  try {
    await joinRoomAsParticipant(participantContext, roomId, "Second voter");
    await expect(page.getByText("Second voter")).toBeVisible();
    await page.getByRole("button", { name: "Transfer host" }).click();
    await expect(page.getByRole("group", { name: "Transfer host" })).toBeVisible();
    await expect(page.getByLabel("New moderator")).toHaveValue(/.+/);
    await expectNoAccessibilityViolations(page);
  } finally {
    await participantContext.close();
  }
});

test("session-replaced state is free of detectable accessibility violations", async ({ page }) => {
  await createRoom(page);
  const replacementPage = await page.context().newPage();

  try {
    await replacementPage.goto(page.url());
    await expect(replacementPage.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: "This tab is now read-only" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Take control in this tab" })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  } finally {
    await replacementPage.close();
  }
});

test("custom deck modal validation state is free of detectable accessibility violations", async ({
  page,
}) => {
  const dialog = await openDeckCustomizationModal(page);
  await page.getByRole("tab", { name: "Custom" }).click();
  await expect(dialog.getByText("Add at least one card.")).toBeVisible();
  await expect(dialog.getByLabel("Cards")).toBeVisible();
  await expectNoAccessibilityViolations(page);
});
