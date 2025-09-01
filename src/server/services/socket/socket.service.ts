// src/server/services/socket/socket-manager-service.ts
import { Socket } from 'socket.io';
import SocketServer, { SocketManage } from '@server/services/socket/socket-server';

export class SocketService<Token extends object> extends SocketServer<Token> {
  private readonly idKey: keyof Token;
  private readonly onConnectedCallbacks: Array<[string, any[] | (() => any[])]> = [];

  constructor(idKey: keyof Token, server: ConstructorParameters<typeof SocketServer>[0], options: ConstructorParameters<typeof SocketServer>[1]) {
    super(server, options);

    this.idKey = idKey;

    this.io.on('connection', (socket: SocketManage<Token>) => {
      this.registerUserHandlers(socket);
      this.onConnectedCallbacks.forEach(([event, arg]) => socket.send(event, ...(arg instanceof Function ? arg() : arg)));
    });

    this.io.on('refresh', (socket: SocketManage<Token>) => {
      this.registerUserHandlers(socket);
    });
  }

  private hasId(obj: unknown | undefined): obj is Record<string, string> {
    return typeof obj === 'object' && obj !== null && (this.idKey as string) in obj;
  }

  private idValue(obj: unknown | undefined): string | null {
    return this.hasId(obj) ? (obj as Record<string, string>)[this.idKey as string] : null;
  }

  private registerUserHandlers(socket: SocketManage<Token>) {
    const userId = this.idValue(socket.data.user);

    if (!userId) {
      socket.disconnect();

      return;
    }

    this.track(socket, userId);

    socket.on('join', (roomId: string) => {
      this.joinRoom(socket, roomId);
    });

    socket.on('leave', (roomId: string) => {
      this.leaveRoom(socket, roomId);
    });

    socket.on('disconnect', () => {
      this.untrack(socket, userId);
    });
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private namedRoom(roomId: string) {
    return `room:${roomId}`;
  }

  private track(socket: Socket, userId: string) {
    console.log(`socket:${socket.id}`, `track:${userId}`);
    socket.join(this.userRoom(userId));
  }

  private untrack(socket: Socket, userId: string) {
    console.log(`socket:${socket.id}`, `untrack:${userId}`);
    socket.leave(this.userRoom(userId));
  }

  private joinRoom(socket: Socket, roomId: string) {
    socket.join(this.namedRoom(roomId));
  }

  private leaveRoom(socket: Socket, roomId: string) {
    socket.leave(this.namedRoom(roomId));
  }

  private userIsInRoom(userRoom: string, targetRoom: string): boolean {
    const room = this.io.sockets.adapter.rooms.get(targetRoom);

    if (!room) return false;

    for (const socketId of room) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket?.rooms.has(userRoom)) return true;
    }

    return false;
  }

  send<S extends object = Record<string, any>>(userId: string, event: string, payload: S, roomId?: string): boolean {
    const userRoom = this.userRoom(userId);
    const targetRoom = roomId ? this.namedRoom(roomId) : null;

    const isInTargetRoom = targetRoom && this.userIsInRoom(userRoom, targetRoom);

    if (isInTargetRoom) {
      this.io.to(targetRoom!).emit(event, payload);
      return true;
    }

    const isInUserRoom = this.isConnected(userId);

    if (isInUserRoom) {
      this.io.to(userRoom).emit(event, payload);
      return true;
    }

    return false;
  }

  // Send message to all active connections with except optional
  broadcast<S extends object = Record<string, any>>(event: string, payload: S, excludeUserIds?: string[]): void {
    if (excludeUserIds?.length) {
      const excludeSet = excludeUserIds.reduce<Set<string>>((acc, userId) => {
        const userRoom = this.userRoom(userId);
        const room = this.io.sockets.adapter.rooms.get(userRoom);

        for (const socketId of room || []) {
          acc.add(socketId);
        }

        return acc;
      }, new Set<string>());

      const exceptIds = [...excludeSet];

      if (exceptIds.length) {
        this.io.except(exceptIds).emit(event, payload);

        return;
      }
    }

    this.io.emit(event, payload);
  }

  isConnected(userId: string): boolean {
    const room = this.io.sockets.adapter.rooms.get(this.userRoom(userId));

    return !!room && room.size > 0;
  }

  onConnected(event: string, callback: any[] | (() => any[])): void {
    if (this.onConnectedCallbacks.find(([e]) => e === event)) {
      return;
    }

    this.onConnectedCallbacks.push([event, callback]);
  }
}
