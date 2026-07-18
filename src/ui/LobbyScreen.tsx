import type { LobbyPlayer, MatchInfo } from '../net/protocol';
import type { RuleConfig } from '../engine/rules';

interface Props {
  code: string;
  isHost: boolean;
  youAre: string | null;
  players: LobbyPlayer[];
  rules: Partial<RuleConfig>;
  match: MatchInfo | null;
  status: 'connecting' | 'lobby' | 'playing' | 'error' | 'ended';
  error: string | null;
  onAddBot: () => void;
  onRemoveBot: (id: string) => void;
  onSetRule: <K extends keyof RuleConfig>(key: K, value: RuleConfig[K]) => void;
  onStart: () => void;
  onExit: () => void;
}

const RULE_TOGGLES: { key: keyof RuleConfig; label: string; default: boolean }[] = [
  { key: 'nikoKadi', label: 'Niko Kadi (announce last card)', default: false },
  { key: 'playablePardonsBust', label: 'Pardon on 15', default: true },
  { key: 'stackRequiresMatch', label: 'Strict stacking', default: false },
  { key: 'noVoluntaryDraw', label: 'No lazy draws', default: true },
];

export function LobbyScreen({
  code,
  isHost,
  youAre,
  players,
  rules,
  status,
  error,
  onAddBot,
  onRemoveBot,
  onSetRule,
  onStart,
  onExit,
}: Props) {
  if (status === 'error' || status === 'ended') {
    return (
      <div className="home">
        <div className="home-inner">
          <h1>Oops</h1>
          <p className="tagline">{error ?? 'Something went wrong.'}</p>
          <button className="primary" onClick={onExit}>
            Back to menu
          </button>
        </div>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div className="home">
        <div className="home-inner">
          <h1>{isHost ? 'Opening room…' : 'Joining room…'}</h1>
          <p className="tagline">
            {isHost ? 'Setting up a peer-to-peer table.' : `Looking for room ${code}.`}
          </p>
          <button className="link" onClick={onExit}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const humans = players.filter((p) => !p.isBot);
  const canStart = isHost && players.length >= 2;

  return (
    <div className="home">
      <div className="home-inner">
      <div>
        <h1>
          Room <span className="accent">{code}</span>
        </h1>
        <p className="tagline">
          {isHost
            ? 'Share this code. Friends open the app, tap Join, and enter it.'
            : 'Waiting for the host to deal. Sit tight!'}
        </p>
      </div>

      <div className="panel">
        <div className="field">
          <label>Players ({players.length}/6)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {players.map((p) => (
              <div
                key={p.id}
                className="rules-toggle"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}
              >
                <span>
                  {p.isBot ? '🤖 ' : p.connected ? '🟢 ' : '⚪ '}
                  {p.name}
                  {p.id === youAre ? ' (you)' : ''}
                  {p.isHost ? ' · host' : ''}
                  {!p.isBot && !p.connected ? <small>disconnected</small> : null}
                </span>
                {isHost && p.isBot && (
                  <button className="link" onClick={() => onRemoveBot(p.id)}>
                    remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {isHost && (
          <>
            <div className="seg">
              <button onClick={onAddBot} disabled={players.length >= 6}>
                + Add bot
              </button>
            </div>

            <details className="advanced">
              <summary>House rules</summary>
              <div style={{ marginTop: 10 }}>
                {RULE_TOGGLES.map((t) => {
                  const on = (rules[t.key] as boolean | undefined) ?? t.default;
                  return (
                    <div
                      className="rules-toggle"
                      key={t.key}
                      onClick={() => onSetRule(t.key, !on as RuleConfig[typeof t.key])}
                    >
                      <span>{t.label}</span>
                      <span className={`switch ${on ? 'on' : ''}`} />
                    </div>
                  );
                })}
              </div>
            </details>

            <button className="primary" onClick={onStart} disabled={!canStart}>
              {canStart ? 'Start game' : 'Need at least 2 players'}
            </button>
          </>
        )}

        {!isHost && (
          <div style={{ textAlign: 'center', color: 'var(--ink-dim)' }}>
            {humans.length} player{humans.length === 1 ? '' : 's'} in the room…
          </div>
        )}

        <button className="link" onClick={onExit}>
          Leave room
        </button>
      </div>
      </div>
    </div>
  );
}
