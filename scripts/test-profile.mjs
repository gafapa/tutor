// Existing feature workflows start after onboarding; smoke-orientation owns that flow.
export async function prepareTestWindow(window) {
  await window.waitForFunction(() => Boolean(window.tutor));
  await window.evaluate(()=>{sessionStorage.setItem('tutor-tools','open');sessionStorage.setItem('tutor-details','open');});
  const settings = (await window.evaluate(() => window.tutor.snapshot())).settings;
  if (!settings.localModelId) await window.evaluate(() => window.tutor.configureAI({provider:'local',modelId:'qwen-1.5b',cloudConsent:false,acceleration:'cpu'}));
  if (settings.onboardingCompleted) await window.reload();
  if (!settings.onboardingCompleted) {
    await window.evaluate(() => window.tutor.updateSettings({ onboardingCompleted: true }));
    await window.reload();
    await window.waitForFunction(() => Boolean(window.tutor));
  }
}
