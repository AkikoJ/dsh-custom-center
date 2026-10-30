import { access } from "node:fs/promises";
import type { BrowserContext, Page } from "playwright";
import { IDENTITY_URL, LOGIN_URL, allowedCookieDomain } from "./platform.ts";
import { privateDirectory } from "./storage.ts";
import { configureBrowserResources } from "./browser-resources.ts";
import {
  LoginFailure,
  type BrowserSession,
  type LoginBrowser,
} from "./types.ts";

class PlaywrightSession implements BrowserSession {
  constructor(
    private readonly context: BrowserContext,
    private readonly page: Page,
  ) {}

  async identity(signal: AbortSignal) {
    signal.throwIfAborted();
    if (new URL(this.page.url()).origin !== new URL(LOGIN_URL).origin)
      throw new LoginFailure("identity-unconfirmed");
    // Runs in the real browser, independently of the Node verification below.
    const response = await this.page.evaluate(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(url, {
          credentials: "include",
          redirect: "error",
          signal: controller.signal,
        });
        const body: unknown = await res.json().catch(() => null);
        return { status: res.status, body };
      } catch {
        return { status: 0, body: null };
      } finally {
        clearTimeout(timer);
      }
    }, IDENTITY_URL);
    signal.throwIfAborted();
    return response;
  }

  async credentials() {
    return {
      cookies: (await this.context.cookies()).filter((cookie) =>
        allowedCookieDomain(cookie.domain),
      ),
      userAgent: await this.page.evaluate(() => navigator.userAgent),
    };
  }
  async focus() {
    await this.page.bringToFront();
  }
  async close() {
    await this.context.close();
  }
  onClose(callback: () => void) {
    let notified = false;
    const notify = () => {
      if (notified) return;
      notified = true;
      this.context.off("close", notify);
      this.page.off("close", notify);
      callback();
    };
    this.context.once("close", notify);
    this.page.once("close", notify);
    if (this.page.isClosed()) queueMicrotask(notify);
  }
}

/** Loading Playwright and checking its resources never happens on settings reads. */
export const playwrightBrowser: LoginBrowser = {
  async open(profile, signal, restore) {
    if (process.platform !== "darwin")
      throw new LoginFailure("unsupported-platform");
    configureBrowserResources();
    const { chromium } = await import("playwright").catch(() => {
      throw new LoginFailure("browser-missing");
    });
    await access(chromium.executablePath()).catch(() => {
      throw new LoginFailure("browser-missing");
    });
    await privateDirectory(profile);
    signal.throwIfAborted();
    let context: BrowserContext;
    try {
      context = await chromium.launchPersistentContext(profile, {
        headless: false,
        timeout: 20_000,
        acceptDownloads: false,
      });
    } catch (error) {
      // Inspect only for classification; never publish the original exception.
      const text = error instanceof Error ? error.message : "";
      throw new LoginFailure(
        /ProcessSingleton|SingletonLock|profile.*in use/i.test(text)
          ? "profile-busy"
          : "browser-start-failed",
      );
    }
    const abort = () => {
      void context.close().catch(() => undefined);
    };
    signal.addEventListener("abort", abort, { once: true });
    context.once("close", () => signal.removeEventListener("abort", abort));
    try {
      signal.throwIfAborted();
      if (restore) {
        // Persistent Chromium may contain newer cookies from after the last
        // snapshot. Restore only missing entries (notably session cookies).
        const existing = await context.cookies();
        const key = (cookie: { name: string; domain: string; path: string; partitionKey?: string }) =>
          JSON.stringify([cookie.domain, cookie.path, cookie.name, cookie.partitionKey]);
        const present = new Set(existing.map(key));
        await context.addCookies(restore.filter((cookie) =>
          (cookie.expires === -1 || cookie.expires > Date.now() / 1000) && !present.has(key(cookie)),
        ));
      }
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(LOGIN_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      signal.throwIfAborted();
      return new PlaywrightSession(context, page);
    } catch {
      await context.close().catch(() => undefined);
      throw new LoginFailure("navigation-failed");
    }
  },
};
