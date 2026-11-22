import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/');
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const ReactDOM = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { ConferenceCall } = await import('/src/hub/ConferenceRoom.tsx');
    document.getElementById('root').remove();
    const container = document.createElement('div');
    document.body.append(container);
    ReactDOM.createRoot(container).render(React.createElement(ConferenceCall, {
      join: { serverUrl: 'wss://localhost:1', token: 'layout-test', customerName: 'Layout test', invitePath: '/room/test', proposalUrl: null },
      isHost: true, startWithCamera: false, onLeave: () => {},
    }));
  });
  await page.getByText('Emilia Cruz', { exact: true }).waitFor();
  await page.waitForTimeout(500);
  await page.locator('.lk-control-bar').evaluate(bar => {
    for (const label of ['Microphone', 'Camera', 'Share screen', 'Chat']) {
      const button = document.createElement('button');
      button.className = 'lk-button';
      button.textContent = label;
      bar.prepend(button);
    }
  });
  for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [320, 568], [844, 390], [667, 375]]) {
    await page.setViewportSize({ width, height });
    const buttons = await page.locator('.lk-control-bar button').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { label: element.textContent, top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    }));
    for (const button of buttons) {
      if (button.top < 0 || button.bottom > height || button.left < 0 || button.right > width) throw new Error(`Clipped control at ${width}x${height}: ${JSON.stringify(button)}`);
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Horizontal overflow at ${width}`);
    console.log(`PASS layout controls visible at ${width}x${height}`);
    if (width === 1440 || width === 390) await page.screenshot({ path: `artifacts/conference-fixed-${width}.png` });
  }
} finally {
  await browser.close();
}
