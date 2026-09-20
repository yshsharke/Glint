import { createRoot } from 'react-dom/client';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { FluentProvider, Toaster, Toast, ToastTitle, useToastController, useId, createLightTheme, createDarkTheme, type BrandVariants } from '@fluentui/react-components';
import { FadeSnappy } from './ui/motion';
import { initializeUI, perform, ui, useAppState } from './ui/state';
import { SettingsView } from './ui/Settings';
import { Result } from './ui/Result';
import { Toolbar } from './ui/Toolbar';
import type { GlintAPI, Settings } from './core';

declare global { interface Window { glint: GlintAPI } }
const view = new URLSearchParams(location.search).get('view') || 'settings';
const ramps: Record<Settings['accent'], string[]> = {
  blue: ['#020305','#081828','#0b263e','#0c3354','#0b406b','#084e83','#035c9b','#0067c0','#1677cb','#3088d4','#529adb','#74ace3','#96bfeb','#b8d2f2','#d8e7f8','#eff6fd'],
  violet: ['#040207','#180f26','#281b3d','#382652','#483368','#58407f','#6750a4','#775fba','#8a73c7','#9d87d3','#af9bdd','#c3afff','#d0bfff','#dfd2ff','#ece5ff','#f7f3ff'],
  teal: ['#010504','#071d19','#0a2d27','#0b3d35','#0c4e44','#0b6054','#097264','#087f73','#219184','#3ba294','#56b4a7','#71cdbb','#94dbcd','#b7e8de','#d7f3ec','#eefaf6'],
  amber: ['#050300','#201602','#322305','#453109','#59400b','#6e510b','#82600b','#926400','#a57818','#b88d35','#cba353','#e4bd73','#edce96','#f3dfb9','#faeed9','#fdf8ee'],
};

function Notices() {
  const { notice } = useAppState();
  const toasterId = useId('glint-toaster');
  const { dispatchToast } = useToastController(toasterId);
  useEffect(() => {
    if (notice.id) dispatchToast(<Toast><ToastTitle>{notice.message}</ToastTitle></Toast>, { intent: notice.error ? 'error' : 'success', timeout: 3500 });
  }, [notice.id, dispatchToast]);
  return <Toaster toasterId={toasterId} position="bottom" limit={1} />;
}
function App() {
  const { draft, snapshot } = useAppState();
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  const settings = view === 'settings' ? draft : snapshot.settings;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  const theme = useMemo(() => {
    const ramp = Object.fromEntries(ramps[settings.accent].map((color, index) => [(index + 1) * 10, color])) as BrandVariants;
    return { ...(dark ? createDarkTheme(ramp) : createLightTheme(ramp)), fontFamilyBase: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif', fontSizeBase300: '13px', lineHeightBase300: '18px' };
  }, [dark, settings.accent]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.accent = settings.accent;
    document.documentElement.dataset.density = settings.density;
    document.body.className = view + '-body';
  }, [dark, settings.accent, settings.density]);
  return <FluentProvider theme={theme} applyStylesToPortals={false} className={'glint-provider ' + view + '-provider'}>
    {view === 'settings' ? <SettingsView /> : view === 'result' ? <Result key={snapshot.result?.id} state={snapshot.result} />
      : <FadeSnappy.In key={snapshot.selection?.id}><div className="toolbar-wrap"><Toolbar settings={settings} live /></div></FadeSnappy.In>}
    <Notices />
  </FluentProvider>;
}
document.addEventListener('keydown', event => { if (event.key === 'Escape' && view !== 'settings') void perform(() => window.glint.dismiss()); });
async function boot() {
  initializeUI(await window.glint.snapshot(), view === 'settings');
  const unsubscribe = window.glint.subscribe(ui.receive);
  window.addEventListener('unload', unsubscribe, { once: true });
  createRoot(document.getElementById('app')!).render(<App />);
}
boot().catch(error => { document.getElementById('app')!.textContent = 'Glint 无法加载：' + String(error); });
