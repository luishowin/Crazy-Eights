import { useState } from 'react';
import type { BotLevel } from '../engine/bot';
import type { RuleConfig } from '../engine/rules';
import type { LocalConfig } from './useLocalGame';

const BOT_NAMES = ['Otieno', 'Wanjiru', 'Kamau', 'Achieng', 'Mwangi'];

interface RuleToggle {
  key: keyof RuleConfig;
  label: string;
  hint: string;
}
const RULE_TOGGLES: RuleToggle[] = [
  { key: 'nikoKadi', label: 'Niko Kadi', hint: 'Announce your last card or draw a penalty' },
  {
    key: 'playablePardonsBust',
    label: 'Pardon on 15',
    hint: 'A playable 15th card saves you from busting',
  },
  {
    key: 'stackRequiresMatch',
    label: 'Strict stacking',
    hint: 'Stacked 2s/3s must match suit or rank',
  },
  {
    key: 'noVoluntaryDraw',
    label: 'No lazy draws',
    hint: 'Can’t draw while you hold a playable card',
  },
];

interface Props {
  onStart: (config: LocalConfig) => void;
  onCreateRoom: (name: string, rules: Partial<RuleConfig>, targetScore: number) => void;
  onJoinRoom: (name: string, code: string) => void;
}

export function HomeScreen({ onStart, onCreateRoom, onJoinRoom }: Props) {
  const [name, setName] = useState('');
  const [botCount, setBotCount] = useState(2);
  const [level, setLevel] = useState<BotLevel>('normal');
  const [targetScore, setTargetScore] = useState(100);
  const [rules, setRules] = useState<Partial<RuleConfig>>({});
  const [joinCode, setJoinCode] = useState('');

  const start = () => {
    const bots = Array.from({ length: botCount }, (_, i) => ({
      name: BOT_NAMES[i % BOT_NAMES.length],
      level,
    }));
    onStart({ humanName: name, bots, rules, targetScore });
  };

  const toggle = (key: keyof RuleConfig, defaultOn: boolean) => {
    setRules((r) => {
      const cur = (r[key] as boolean | undefined) ?? defaultOn;
      return { ...r, [key]: !cur };
    });
  };
  const isOn = (key: keyof RuleConfig, defaultOn: boolean) =>
    (rules[key] as boolean | undefined) ?? defaultOn;

  return (
    <div className="home">
      <div>
        <h1>
          Very <span className="accent">Crazy Eights</span>
        </h1>
        <p className="tagline">
          The chaotic Kenyan street game. Play against bots now — invite friends soon.
        </p>
      </div>

      <div className="panel">
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            type="text"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            placeholder="You"
          />
        </div>

        <div className="field">
          <label>Opponents (bots)</label>
          <div className="seg">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={botCount === n ? 'on' : ''} onClick={() => setBotCount(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Bot difficulty</label>
          <div className="seg">
            {(['easy', 'normal', 'hard'] as BotLevel[]).map((l) => (
              <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
                {l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Play to (match ends when someone hits)</label>
          <div className="seg">
            {[50, 100, 150, 200].map((t) => (
              <button
                key={t}
                className={targetScore === t ? 'on' : ''}
                onClick={() => setTargetScore(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <details className="advanced">
          <summary>House rules</summary>
          <div style={{ marginTop: 10 }}>
            {RULE_TOGGLES.map((t) => {
              const defaultOn =
                t.key === 'playablePardonsBust' || t.key === 'noVoluntaryDraw';
              const on = isOn(t.key, defaultOn);
              return (
                <div
                  className="rules-toggle"
                  key={t.key}
                  onClick={() => toggle(t.key, defaultOn)}
                >
                  <span>
                    {t.label}
                    <small>{t.hint}</small>
                  </span>
                  <span className={`switch ${on ? 'on' : ''}`} />
                </div>
              );
            })}
          </div>
        </details>

        <button className="primary" onClick={start}>
          Deal me in
        </button>

        <div
          style={{
            textAlign: 'center',
            color: 'var(--ink-dim)',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          — or play with friends —
        </div>

        <button className="ghost" onClick={() => onCreateRoom(name, rules, targetScore)}>
          🎉 Create an online room
        </button>

        <div className="field">
          <label>Join a room</label>
          <div className="seg">
            <input
              type="text"
              value={joinCode}
              maxLength={6}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="CODE"
              style={{ flex: '2 1 120px', textAlign: 'center', letterSpacing: 3, fontWeight: 700 }}
            />
            <button
              className={joinCode.length >= 4 ? 'on' : ''}
              disabled={joinCode.length < 4}
              onClick={() => onJoinRoom(name, joinCode)}
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
