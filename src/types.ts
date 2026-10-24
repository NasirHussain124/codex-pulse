export type WindowId = 'weekly' | 'five_hour' | 'seven_day';
export interface QuotaWindow { id: WindowId; label: string; durationMinutes: number; usedPercent: number; remainingPercent: number; resetsAt: string | null }
export interface Account {
  id: string; identity: string; email: string; plan: string; provider: 'codex'; selected: boolean; disabled: boolean; pendingLogin?: boolean;
  status: 'ready' | 'stale' | 'reconnect' | 'unavailable' | 'api_key'; hint: string | null;
  windows: QuotaWindow[]; fetchedAt: string | null; credits: number | null; bankedResets: number | null;
  resetCredits?: { available: number | null; earliestExpiresAt: string | null; detailsKnown: boolean };
}
export interface Snapshot { schemaVersion: number; generatedAt: string | null; accounts: Account[]; engine: { name: string; version: string; secureStorage: string } }
export interface Settings {
  theme: 'light' | 'dark' | 'system'; interval: number; privacy: boolean; notifications: boolean; threshold: number;
  startAtLogin: boolean; closeToTray: boolean; widgetWindow: 'weekly' | 'five_hour'; widgetTop: boolean; compact: boolean;
  accounts: Record<string, { label: string; pinned: boolean; group?: 'personal' | 'work' | 'reserved' | 'none' }>;
  recommendationMode?: 'consume' | 'runway' | 'reserve'; reservePercent?: number;
  sessionMinutes?: number; recommendationAlerts?: boolean;
  mobileResume?: boolean; mobileDiscovery?: boolean; mobileTransport?: 'lan' | 'tailscale'; mobileAddress?: string;
}
export interface HistorySample { at: string; accounts: { identity: string; fetchedAt: string; windows: QuotaWindow[] }[] }
export interface PulseEvent { id: string; kind: string; title: string; at: string }
export interface LoginStatus { phase: 'idle' | 'starting' | 'waiting' | 'saving' | 'success' | 'error'; mode?: 'browser' | 'device'; message?: string; code?: string }
export interface AppState { snapshot: Snapshot; settings: Settings; history: HistorySample[]; events: PulseEvent[]; refreshing: boolean; engineError: string | null; login?: LoginStatus; desktop: boolean; demo: boolean; version: string; initialized?: boolean; revision?: number; providers?: OtherProviders }
export type OtherProvider = 'copilot' | 'claude' | 'cursor' | 'gemini';
export interface ProviderMetric { id: string; label: string; value: string | number | null; unit: 'USD' | 'tokens' | 'requests' | 'members' | 'count' | 'text' }
export interface ProviderQuota { id: string; label: string; period: string; unit: string; used: number | null; limit: number | null;
  unlimited: boolean; remainingPercent: number | null; resetsAt: string | null; observedAt: string | null; overage?: number | null; overageAllowed?: boolean }
export interface ProviderReport { subject: string; scope: 'account' | 'organization' | 'team' | 'project'; periodStart: string | null; periodEnd: string | null;
  complete: boolean; source: string; quotas: ProviderQuota[]; metrics: ProviderMetric[]; notes: string[];
  members: { id: string; label: string; email?: string; quotas: ProviderQuota[]; metrics: ProviderMetric[] }[] }
export interface ProviderConnection { id: string; provider: OtherProvider; label: string; createdAt: string | null; enabled: boolean;
  status: 'ready' | 'stale' | 'paused' | 'error' | 'unavailable'; refreshing: boolean; fetchedAt: string | null; nextUpdateAt: string | null;
  error: string | null; report: ProviderReport | null; source: string }
export interface OtherProviders { connections: ProviderConnection[]; error: string | null }
export interface ProviderInput { id?: string; provider: OtherProvider; label: string; secret: string; projectId?: string }
export interface CurrentLogin { available: boolean; email?: string; mode?: string; plan?: string; message?: string }
export interface ResetReview { available: number | null; detailsKnown: boolean; readAt: string; pendingCreditId?: string;
  credits: { id: string; title: string; expiresAt: string | null }[];
  windows: { durationMinutes: number; remainingPercent: number; resetsAt: string | null }[] }
export interface MobileStatus { enabled: boolean; address: string | null; port: number; addresses: string[]; error: string | null;
  networks?: { address: string; kind: 'lan' | 'tailscale'; adapter: string }[]; recovery?: string | null; autoResume?: boolean; discovery?: boolean;
  devices: { id: string; name: string; createdAt: string; lastSeenAt: string | null }[] }
export interface Diagnostics { version: string; packaged: boolean; profile: string; initialized: boolean; accounts: number; ready: number;
  engine: { available: boolean; collectorRunning: boolean; lastReading: string | null }; cli: { installed: boolean };
  phone: { enabled: boolean; transport: string; pairedDevices: number; autoResume?: boolean; discovery?: boolean; recovery: string | null };
  network: { kind: string; adapter: string }[]; startup: boolean; encryption: boolean; observedAt: string }
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
  resetReview?(id: string): Promise<ResetReview>;
  resetConsume?(id: string, creditId: string): Promise<{ canceled: boolean; outcome?: 'reset' | 'alreadyRedeemed' | 'nothingToReset' | 'noCredit'; review?: ResetReview }>;
  createBackup?(): Promise<boolean>; restoreBackup?(): Promise<boolean>; diagnostics?(): Promise<Diagnostics>;
  onOpenAccount?(handler: (identity: string) => void): () => void;
  connectProvider?(input: ProviderInput): Promise<{ connectionId: string; providers: OtherProviders }>;
  cancelProviderConnect?(): Promise<void>; refreshProvider?(id: string): Promise<OtherProviders>;
  enableProvider?(id: string, enabled: boolean): Promise<OtherProviders>; renameProvider?(id: string, label: string): Promise<OtherProviders>;
  removeProvider?(id: string): Promise<OtherProviders>; providerDocs?(provider: OtherProvider, setup?: boolean): Promise<unknown>;
  mobileCopyPair?(text: string): Promise<boolean>; mobileDownload?(): Promise<unknown>;
  mobilePair?(): Promise<{ text: string; qr: string; expiresAt: number }>; mobileCancelPair?(): Promise<void>; mobileRevoke?(id: string): Promise<MobileStatus>;
}
declare global { interface Window { pulse?: PulseAPI } }
