import { chromium } from "@playwright/test";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1280, height: 860 });
const check = (label, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  —  " + detail : ""}`);
const go = (path) => page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
const dialog = () => page.getByRole("dialog");
await go("/library");

// 1. create a folder
await page.getByRole("button", { name: "New folder" }).click();
await dialog().getByRole("textbox").fill("Sci-fi");
await dialog().getByRole("button", { name: "Create" }).click();
await page.getByRole("link", { name: "Open folder Sci-fi" }).waitFor();
check("create a folder", true);

// 2. duplicate sibling name is refused calmly
await page.getByRole("button", { name: "New folder" }).click();
await dialog().getByRole("textbox").fill("sci-fi");
await dialog().getByRole("button", { name: "Create" }).click();
await dialog().getByRole("alert").waitFor();
check("same name twice is refused", /already exists/i.test(await dialog().getByRole("alert").innerText()), await dialog().getByRole("alert").innerText());
await dialog().getByRole("button", { name: "Cancel" }).click();

// 3. nested folder + breadcrumb
await page.getByRole("link", { name: "Open folder Sci-fi" }).click();
await page.waitForURL(/folder=/);
await page.getByRole("button", { name: "New folder" }).click();
await dialog().getByRole("textbox").fill("Cyberpunk");
await dialog().getByRole("button", { name: "Create" }).click();
await page.getByRole("link", { name: "Open folder Cyberpunk" }).waitFor();
await page.getByRole("link", { name: "Open folder Cyberpunk" }).click();
await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Cyberpunk");
const crumbs = (await page.locator("nav[aria-label='Folder path']").innerText()).replace(/\s+/g, " ");
check("nested folder shows a breadcrumb", crumbs === "Library / Sci-fi", crumbs);
await page.screenshot({ path: "validation-artifacts/folder-nested.png" });

// 4. move a book into Sci-fi
await go("/library");
await page.getByRole("button", { name: "Options for Accelerando" }).click();
await page.getByRole("menuitem", { name: "Move to…" }).click();
await dialog().getByLabel("Sci-fi").check();
await page.screenshot({ path: "validation-artifacts/move-dialog.png" });
await dialog().getByRole("button", { name: "Move" }).click();
await page.getByRole("button", { name: "Options for Accelerando" }).waitFor({ state: "detached" });
check("a moved book leaves the top level", true);
await page.getByRole("link", { name: "Open folder Sci-fi" }).click();
await page.getByRole("button", { name: "Options for Accelerando" }).waitFor();
check("and appears in its folder", true);
await page.screenshot({ path: "validation-artifacts/folder-view.png" });

// 5. search spans folders
await go("/library");
await page.getByPlaceholder("Search your shelf").fill("accel");
await page.getByRole("link", { name: "Read Accelerando" }).waitFor();
check("search finds a book inside a folder", true);
await page.getByPlaceholder("Search your shelf").fill("");

// 6. a folder cannot be moved into its own descendant (the picker does not offer it)
await page.getByRole("button", { name: "Options for folder Sci-fi" }).click();
await page.getByRole("menuitem", { name: "Move to…" }).click();
const offered = await dialog().locator("label").allInnerTexts();
check("move picker hides the folder and its descendants", !offered.some((t) => /Sci-fi|Cyberpunk/.test(t)), offered.join(" | "));
await dialog().getByRole("button", { name: "Cancel" }).click();

// 7. a non-empty folder cannot be deleted
await page.getByRole("button", { name: "Options for folder Sci-fi" }).click();
await page.getByRole("menuitem", { name: "Delete folder…" }).click();
await dialog().getByRole("button", { name: "Delete" }).click();
await dialog().getByRole("alert").waitFor();
check("non-empty folder is protected", /Move or remove/.test(await dialog().getByRole("alert").innerText()), await dialog().getByRole("alert").innerText());
await dialog().getByRole("button", { name: "Cancel" }).click();

// 8. upload into a chosen folder
await go("/upload");
await page.getByLabel("Add to").selectOption({ label: "Sci-fi" });
await page.locator("input[type=file]").setInputFiles("tests/fixtures/retry-me.txt");
await page.waitForFunction(() => document.querySelector("li[data-state=done],li[data-state=duplicate]"), null, { timeout: 30000 });
await go("/library");
const topLevel = await page.getByRole("button", { name: "Options for retry me" }).count();
await page.getByRole("link", { name: "Open folder Sci-fi" }).click();
await page.getByRole("button", { name: "Options for retry me" }).waitFor();
check("upload lands in the chosen folder", topLevel === 0, "not at the top level, present in Sci-fi");
await page.close(); await b.close();
