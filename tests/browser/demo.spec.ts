import { test, expect } from "@playwright/test";
test("full synthetic evidence → recall → seal → retrieve → timeline loop", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /历史是参照/ })).toBeVisible();
  await page.getByRole("button", { name: "建立我的 T0 起点" }).click();
  for (let i = 0; i < 10; i++)
    await page.locator(`input[name="q${i}"]`).first().check();
  await page.getByRole("button", { name: "确认并封存 T0" }).click();
  await expect(
    page.getByRole("heading", { name: "看见差异，不评判高低。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "02 物件与访谈" }).click();
  await page
    .getByRole("textbox", { name: "物件标题" })
    .fill("演示 · 浏览器验证合作记录");
  await page
    .getByRole("textbox", { name: "原始文字" })
    .fill("【虚构测试物件】合作项目下周开始，先用小范围试点确认责任。");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "保存原件并立即封存" }).click();
  await expect(page.getByText("原件已封存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "识别准确，开始叙述" }).click();
  await page
    .getByRole("textbox", { name: "自由叙述" })
    .fill("这是虚构演示。我当时负责项目，先做试点。结果按期完成。");
  await page.getByRole("button", { name: "叙述结束，检查缺口" }).click();
  const fields = [
    "发生了什么",
    "当时的位置 / 角色",
    "当时知道什么",
    "当时有哪些选择",
    "为什么这样选择",
    "后来实际发生什么",
    "今天怎么看",
    "最终评价",
  ];
  for (const [i, label] of fields.entries()) {
    if (i === 2)
      await page
        .getByRole("combobox", { name: `${label}状态` })
        .selectOption("forgotten");
    else
      await page
        .getByRole("textbox", { name: label, exact: true })
        .fill(
          [
            "一个新的合作项目出现。",
            "我负责项目交付。",
            "",
            "先做小范围试点；直接加入；暂缓合作。",
            "时间有限。",
            "按期完成。",
            "今天仍认可试点。",
            "符合当时的条件。",
          ][i],
        );
    await page.getByRole("button", { name: "记录这个字段" }).click();
  }
  await page
    .getByRole("textbox", { name: "当时实际选择", exact: true })
    .fill("先做小范围试点。");
  await page
    .getByRole("textbox", {
      name: "当时最佳决策（你在当时认为最合适的选择）",
      exact: true,
    })
    .fill("当时我认为试点最可行。");
  await page.getByRole("button", { name: "查看并确认封存内容" }).click();
  await page.getByRole("button", { name: "我确认以上记录，封存入库" }).click();
  await expect(
    page.getByRole("heading", { name: "过去，有据可循。" }),
  ).toBeVisible();
  await expect(
    page.getByText("当时我认为试点最可行。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "04 赋能" }).click();
  await page.getByRole("button", { name: "填入演示问题" }).click();
  await page.getByRole("button", { name: "调用相似历史" }).click();
  await expect(
    page.getByText("历史是参照，最终选择由你完成。", { exact: true }),
  ).toBeVisible();
  expect(await page.locator(".match").count()).toBeGreaterThanOrEqual(3);
  await page.locator(".match summary").first().click();
  await expect(page.locator("table").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/empower-desktop.png",
    fullPage: true,
  });
  expect(
    (
      await request.patch("/api/archive", { data: { title: "rewrite" } })
    ).status(),
  ).toBe(405);
  expect((await request.delete("/api/archive")).status()).toBe(405);
});
test("mobile home is usable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "体验历史赋能" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
});
