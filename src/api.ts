import type { PulseAPI } from './types';
import { demoState } from './demo';

const readonly = async (): Promise<never> => { throw new Error('This is a design preview. Open the Windows app to connect real accounts.'); };
const fallback: PulseAPI = {
  getState: async () => demoState(), refresh: async () => demoState(), refreshAccount: async () => demoState(), current: async () => ({ available: false }),
  addCurrent: readonly, importExisting: readonly, switchAccount: readonly, removeAccount: readonly, setDisabled: readonly,
  startLogin: readonly, cancelLogin: readonly, openLoginPage: readonly, installCodex: readonly,
  saveSettings: async (settings) => ({ ...demoState().settings, ...settings }),
  openWidget: async () => window.open(`${window.location.origin}/?widget=1&demo=1`, 'pulse-widget', 'width=420,height=590'),
  openDashboard: async () => { window.location.href = '/?demo=1'; },
  openUsage: async () => window.open('https://chatgpt.com/codex/settings/usage', '_blank', 'noopener,noreferrer'),
  exportHistory: readonly, onState: () => () => {},
};
export const api = window.pulse || fallback;
