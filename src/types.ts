export type WindowId = 'weekly' | 'five_hour' | 'seven_day';
export interface QuotaWindow { id: WindowId; label: string; durationMinutes: number; usedPercent: number; remainingPercent: number; resetsAt: string | null }
export interface Account {
  id: string; identity: string; email: string; plan: string; provider: 'codex'; selected: boolean; disabled: boolean; pendingLogin?: boolean;
  status: 'ready' | 'stale' | 'reconnect' | 'unavailable' | 'api_key'; hint: string | null;
  windows: QuotaWindow[]; fetchedAt: string | null; credits: number | null; bankedResets: number | null;
}
export interface Snapshot { schemaVersion: number; generatedAt: string | null; accounts: Account[]; engine: { name: string; version: string; secureStorage: string } }
export interface Settings {
  theme: 'light' | 'dark' | 'system'; interval: number; privacy: boolean; notifications: boolean; threshold: number;
  startAtLogin: boolean; closeToTray: boolean; widgetWindow: 'weekly' | 'five_hour'; widgetTop: boolean; compact: boolean;
  accounts: Record<string, { label: string; pinned: boolean }>;
}
export interface HistorySample { at: string; accounts: { identity: string; fetchedAt: string; windows: QuotaWindow[] }[] }
export interface PulseEvent { id: string; kind: string; title: string; at: string }
export interface LoginStatus { phase: 'idle' | 'starting' | 'waiting' | 'saving' | 'success' | 'error'; mode?: 'browser' | 'device'; message?: string; code?: string }
export interface AppState { snapshot: Snapshot; settings: Settings; history: HistorySample[]; events: PulseEvent[]; refreshing: boolean; engineError: string | null; login?: LoginStatus; desktop: boolean; demo: boolean; version: string; initialized?: boolean; revision?: number }
export interface CurrentLogin { available: boolean; email?: string; mode?: string; plan?: string; message?: string }
export interface MobileStatus { enabled: boolean; address: string | null; port: number; addresses: string[]; error: string | null; devices: { id: string; name: string; createdAt: string; lastSeenAt: string | null }[] }
export interface PulseAPI {
  getState(): Promise<AppState>; refresh(): Promise<AppState>; refreshAccount(id: string): Promise<AppState>; current(): Promise<CurrentLogin>;
  addCurrent(): Promise<AppState>; importExisting(): Promise<{ imported: number; state: AppState }>;
  startLogin(mode: 'browser' | 'device', identity?: string): Promise<LoginStatus>; cancelLogin(): Promise<LoginStatus>; openLoginPage(): Promise<unknown>; installCodex(): Promise<unknown>;
  switchAccount(id: string): Promise<AppState>; removeAccount(id: string): Promise<AppState>;
  setDisabled(id: string, disabled: boolean): Promise<AppState>; saveSettings(settings: Partial<Settings>): Promise<Settings>;
  openWidget(): Promise<unknown>; openDashboard(): Promise<unknown>; openUsage(): Promise<unknown>; exportHistory(): Promise<boolean>;
  openQuickView(): Promise<unknown>; closeQuickView(): Promise<unknown>;
  onState(handler: (state: AppState) => void): () => void;
  reportView?(count: number, revision: number): Promise<void>;
  quit?(): Promise<void>;
  mobileStatus?(): Promise<MobileStatus>; mobileStart?(address: string): Promise<MobileStatus>; mobileStop?(): Promise<MobileStatus>;
  copyLoginCode?(): Promise<boolean>;
  mobileCopyPair?(text: string): Promise<boolean>; mobileDownload?(): Promise<unknown>;
  mobilePair?(): Promise<{ text: string; qr: string; expiresAt: number }>; mobileCancelPair?(): Promise<void>; mobileRevoke?(id: string): Promise<MobileStatus>;
}
declare global { interface Window { pulse?: PulseAPI } }
