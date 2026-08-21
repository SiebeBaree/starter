import { expect, test } from "@playwright/test";

test("the home page renders and links to the todos page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
    await expect(page.getByRole("link", { name: /open todos/i })).toBeVisible();
});
