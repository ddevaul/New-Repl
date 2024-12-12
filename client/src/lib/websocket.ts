import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export function useWebSocket(roomCode: string | undefined) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const { toast } = useToast();

  const connect = useCallback(() => {
    if (!roomCode) return null;

    if (!roomCode) return null;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws/room/${roomCode.toUpperCase()}`);
    
    console.log('Attempting WebSocket connection to:', `${protocol}//${host}/ws/room/${roomCode.toUpperCase()}`);

    ws.onopen = () => {
      console.log('WebSocket Connected');
      toast({
        title: "Connected",
        description: "Successfully connected to the game room",
        duration: 3000,
      });
    };

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    ws.onclose = () => {
      console.log('WebSocket Disconnected');
      
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        toast({
          title: "Disconnected",
          description: `Lost connection to the game room. Reconnecting... (Attempt ${reconnectAttempts}/${maxReconnectAttempts})`,
          variant: "destructive",
          duration: 4000,
        });
        
        setTimeout(() => {
          setSocket(connect());
        }, Math.min(1000 * reconnectAttempts, 5000));
      } else {
        toast({
          title: "Connection Failed",
          description: "Could not reconnect to the game room. Please refresh the page.",
          variant: "destructive",
          duration: 5000,
        });
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket Error:', error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to the game room. Retrying...",
        variant: "destructive",
        duration: 3000,
      });
    };

    return ws;
  }, [roomCode, toast]);

  useEffect(() => {
    const ws = connect();
    if (ws) {
      setSocket(ws);
      return () => {
        ws.close();
      };
    }
  }, [connect]);

  return socket;
}
