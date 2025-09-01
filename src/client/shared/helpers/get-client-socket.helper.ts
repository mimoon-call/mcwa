// src/client/shared/helpers/get-client-socket.helper.ts
import { io } from 'socket.io-client';

let socket: ReturnType<typeof io> | null = null;

const getClientSocket = () => {
  if (typeof window === 'undefined' || socket) {
    return socket || null;
  }

  socket = io();

  return socket;
};

export default getClientSocket;
