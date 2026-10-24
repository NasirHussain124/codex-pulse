export type ProviderBrand = 'codex' | 'copilot' | 'claude' | 'gemini' | 'cursor';
const assets: Record<ProviderBrand, { file: string; mono: boolean }> = {
  codex: { file: 'codex', mono: true }, copilot: { file: 'githubcopilot', mono: true },
  claude: { file: 'claude-color', mono: false }, gemini: { file: 'gemini-color', mono: false }, cursor: { file: 'cursor', mono: true },
};
/** Local, pinned Lobe Icons SVGs. No runtime CDN, remote markup or scripts. */
export function ProviderMark({ provider, size = 20, label }: { provider: ProviderBrand; size?: number; label?: string }) {
  const asset = assets[provider];
  return <img className={`provider-mark ${asset.mono ? 'provider-mark-mono' : ''}`} src={`/providers/${asset.file}.svg`} width={size} height={size} alt={label || ''} aria-hidden={!label} draggable={false} />;
}
