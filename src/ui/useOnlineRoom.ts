import { useEffect, useMemo, useRef, useState } from 'react';
import { Room, type RoomSnapshot, type RoomOptions } from '../net/room';
import type { Move } from '../engine/types';
import type { RuleConfig } from '../engine/rules';

export type OnlineParams = Omit<RoomOptions, 'onUpdate'>;

export function useOnlineRoom(params: OnlineParams) {
  const [snap, setSnap] = useState<RoomSnapshot>({
    status: 'connecting',
    error: null,
    code: params.code.toUpperCase(),
    isHost: params.role === 'host',
    youAre: params.role === 'host' ? 'host' : null,
    lobbyPlayers: [],
    rules: params.rules ?? {},
    view: null,
    match: null,
  });
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    const room = new Room({ ...params, onUpdate: setSnap });
    roomRef.current = room;
    return () => {
      room.destroy();
      roomRef.current = null;
    };
    // Intentionally created once for the lifetime of this online session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actions = useMemo(
    () => ({
      addBot: () => roomRef.current?.addBot(),
      removeBot: (id: string) => roomRef.current?.removeBot(id),
      setRule: <K extends keyof RuleConfig>(key: K, value: RuleConfig[K]) =>
        roomRef.current?.setRule(key, value),
      startGame: () => roomRef.current?.startGame(),
      move: (m: Move) => roomRef.current?.move(m),
      nextRound: () => roomRef.current?.nextRound(),
      newMatch: () => roomRef.current?.newMatch(),
    }),
    [],
  );

  return { ...snap, ...actions };
}
