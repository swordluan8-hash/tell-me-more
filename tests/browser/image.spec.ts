import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

test("image metadata path seals the byte hash without claiming an image upload", async ({
  page,
}) => {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "02 物件与访谈" }).click();
  await page
    .getByRole("textbox", { name: "物件标题" })
    .fill("演示 · 图片元数据验证");
  await page
    .getByRole("combobox", { name: "物件类型" })
    .selectOption("image_metadata");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "synthetic-pixel.png",
      mimeType: "image/png",
      buffer: bytes,
    });
  await page.getByRole("checkbox").check();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/archive") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "保存原件并立即封存" }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const { document } = await response.json();
  expect(document.status).toBe("sealed");
  expect(document.fileMetadata.path).toBe("user-held://synthetic-pixel.png");
  expect(document.fileMetadata.contentHash).toBe(
    createHash("sha256").update(bytes).digest("hex"),
  );
  await expect(page.getByText("原件已封存", { exact: true })).toBeVisible();
  await expect(
    page.getByText("没有从图片推断任何事件事实。", { exact: false }),
  ).toBeVisible();
});
