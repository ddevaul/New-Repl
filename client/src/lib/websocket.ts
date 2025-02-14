import { useState, useEffect } from "react";

export function useWebSocket(roomCode: string | undefined, playerId: number) {
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/room/${roomCode}?playerId=${playerId}`);

    ws.onopen = () => {
      console.log('WebSocket Connected for player:', playerId, 'in room:', roomCode);
    };

    ws.onerror = (error) => {
      console.error('WebSocket Error:', error, 'for player:', playerId, 'in room:', roomCode);
    };

    ws.onclose = () => {
      console.log('WebSocket Closed for player:', playerId, 'in room:', roomCode);
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [roomCode, playerId]);

  return socket;
}
