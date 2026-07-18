import { useEffect, useState } from 'react';
import { HomeScreen } from './ui/HomeScreen';
import { GameScreen } from './ui/GameScreen';
import { LobbyScreen } from './ui/LobbyScreen';
import { CardDefs } from './ui/Card';
import { useLocalGame, type LocalConfig } from './ui/useLocalGame';
import { useOnlineRoom, type OnlineParams } from './ui/useOnlineRoom';
import { makeRoomCode } from './net/protocol';
import { unlockAudio } from './ui/sound';
import type { RuleConfig } from './engine/rules';

type Screen =
  | { m: 'home' }
  | { m: 'local'; config: LocalConfig }
  | { m: 'online'; params: OnlineParams };

function LocalGameHost({ config, onExit }: { config: LocalConfig; onExit: () => void }) {
  const { view, match, humanMove, nextRound, newMatch } = useLocalGame(config);
  return (
    <GameScreen
      view={view}
      match={match}
      targetScore={config.targetScore}
      onMove={humanMove}
      onNextRound={nextRound}
      onNewMatch={newMatch}
      onExit={onExit}
    />
  );
}

function OnlineGameHost({ params, onExit }: { params: OnlineParams; onExit: () => void }) {
  const room = useOnlineRoom(params);

  if (room.status === 'playing' && room.view) {
    return (
      <GameScreen
        view={room.view}
        match={room.match ?? { totals: {}, round: 1 }}
        targetScore={room.match?.targetScore ?? 100}
        onMove={room.move}
        onNextRound={room.nextRound}
        onNewMatch={room.newMatch}
        onExit={onExit}
        waitingForHost={!room.isHost}
        notice={room.notice}
      />
    );
  }

  return (
    <LobbyScreen
      code={room.code}
      isHost={room.isHost}
      youAre={room.youAre}
      players={room.lobbyPlayers}
      rules={room.rules}
      match={room.match}
      status={room.status}
      error={room.error}
      onAddBot={room.addBot}
      onRemoveBot={room.removeBot}
      onSetRule={room.setRule}
      onStart={room.startGame}
      onExit={onExit}
    />
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ m: 'home' });
  const goHome = () => setScreen({ m: 'home' });

  // Browsers only allow audio after a user gesture — unlock on the first one.
  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener('pointerdown', h, { once: true, capture: true });
    return () => window.removeEventListener('pointerdown', h, { capture: true });
  }, []);

  return (
    <div className="app">
      <CardDefs />
      {screen.m === 'home' && (
        <HomeScreen
          onStart={(config) => setScreen({ m: 'local', config })}
          onCreateRoom={(name, rules: Partial<RuleConfig>, targetScore) =>
            setScreen({
              m: 'online',
              params: { role: 'host', name, code: makeRoomCode(), rules, targetScore },
            })
          }
          onJoinRoom={(name, code) =>
            setScreen({ m: 'online', params: { role: 'guest', name, code } })
          }
        />
      )}
      {screen.m === 'local' && <LocalGameHost config={screen.config} onExit={goHome} />}
      {screen.m === 'online' && <OnlineGameHost params={screen.params} onExit={goHome} />}
    </div>
  );
}
