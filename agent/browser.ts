import { chromium, type Browser } from 'playwright-core';

/** Visible, slowed-down browser locally (for the live demo); headless Chromium on Lambda. */
export async function launchBrowser(): Promise<Browser> {
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const { default: lambdaChromium } = await import('@sparticuz/chromium');
    return chromium.launch({ args: lambdaChromium.args, executablePath: await lambdaChromium.executablePath(), headless: true });
  }
  return chromium.launch({ headless: process.env.HEADLESS === '1', slowMo: Number(process.env.SLOW_MO ?? 300) });
}

export const appUrl = (path: string) => new URL(path, process.env.APP_URL ?? 'http://localhost:5173').toString();
