// Existing feature workflows start after onboarding; smoke-orientation owns that flow.
export async function prepareTestWindow(window) {
  await window.waitForFunction(() => Boolean(window.tutor));
  const settings = (await window.evaluate(() => window.tutor.snapshot())).settings;
  if (!settings.localModelId) await window.evaluate(() => window.tutor.configureAI({provider:'local',modelId:'qwen-1.5b',cloudConsent:false}));
  if (!settings.onboardingCompleted) {
    await window.evaluate(() => window.tutor.updateSettings({ onboardingCompleted: true }));
    await window.reload();
    await window.waitForFunction(() => Boolean(window.tutor));
  }
}
