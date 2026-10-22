/**
 * In-App-Browser erkennen und den Tracker samt Eingaben im echten Browser öffnen.
 *
 * In-App-Browser (Instagram, Facebook, TikTok …) blockieren Downloads komplett, das lässt sich
 * von einer Website aus nicht umgehen. Deshalb öffnen wir die Seite im System-Browser und geben
 * die Eingaben im Fragment des Links mit (#d=…). Das Fragment wird nie an einen Server geschickt.
 *
 * Ausbruchswege laut https://github.com/shalanah/inapp-debugger (Stand März 2026):
 * - Android: intent://…#Intent;scheme=https;end (Instagram, Facebook, Threads, Messenger, Telegram, Line)
 * - iOS Instagram: instagram://extbrowser/?url=…
 * - iOS Facebook, Threads: x-safari-https://… über window.open
 * - iOS Messenger, LinkedIn, Line, Telegram, Google-App: x-safari-https://…
 * - TikTok, X, WeChat: kein verlässlicher Weg → Hinweis auf das App-Menü und „Copy link“
 */

// Reihenfolge zählt: WeChat ("MicroMessenger") vor Messenger, Messenger und Threads vor Facebook (enthalten auch FBAN)
const APPS = [
  ['Instagram', /Instagram/i],
  ['WeChat', /MicroMessenger/i],
  ['Messenger', /Messenger/i],
  ['Threads', /Barcelona|Threads/i],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS/i],
  ['TikTok', /TikTok|BytedanceWebview|musical_ly|trill_/i],
  ['Snapchat', /Snapchat/i],
  ['LinkedIn', /LinkedInApp/i],
  ['X', /Twitter/i],
  ['Telegram', /Telegram/i],
  ['Line', /\bLine\//],
  ['Google', /\bGSA\//],
];

/** Plattform und In-App-Browser aus dem User-Agent bestimmen */
export function detectEnv(ua, platform = '', maxTouchPoints = 0) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const app = APPS.find(([, re]) => re.test(ua))?.[0] ?? null;
  // Android-WebView: "; wv)" im User-Agent; iOS-WebView: "Safari/" fehlt (Safari, Chrome, Firefox auf iOS haben es)
  const inApp = Boolean(app) || (android && /; wv\)/.test(ua)) || (ios && !/Safari\//.test(ua));
  return { ios, android, inApp, app: inApp ? app : null };
}

/** Link, der die Seite aus dem In-App-Browser im System-Browser öffnet */
export function escapeLink(env, target) {
  if (env.android) {
    // Intent.parseUri trennt am letzten "#", das Fragment #d=… davor bleibt erhalten
    return { href: `intent://${target.replace(/^https?:\/\//, '')}#Intent;scheme=https;end`, popup: false };
  }
  if (env.ios) {
    if (env.app === 'Instagram') return { href: `instagram://extbrowser/?url=${encodeURIComponent(target)}`, popup: false };
    return { href: `x-safari-${target}`, popup: env.app === 'Facebook' || env.app === 'Threads' };
  }
  return { href: target, popup: true };
}

/** Objekt → base64url (UTF-8), passt ohne Sonderzeichen in ein URL-Fragment */
export function encodeState(state) {
  let bin = '';
  for (const byte of new TextEncoder().encode(JSON.stringify(state))) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}
