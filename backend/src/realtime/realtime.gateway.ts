/**
 * Socket.IO gateway. Clients connect with `io(url, { auth: { token } })`; the JWT is verified during
 * the handshake and the socket joins private rooms for that user (and the rider/admin broadcast rooms).
 */
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { AccountStatus, Role } from '../common/enums';
import { config } from '../config/config';
import { User } from '../users/user.entity';
import { RealtimeService, riderRoom, userRoom } from './realtime.service';

@WebSocketGateway({
  cors: { origin: config.isProduction && config.corsOrigins.length ? config.corsOrigins : true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer() server: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  afterInit(server: Server) {
    this.realtime.attach(server);
  }

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth as { token?: string })?.token;
      if (!token) throw new Error('missing token');
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.users.findOne({ where: { id: payload.sub } });
      if (!user || user.status === AccountStatus.SUSPENDED) throw new Error('inactive');

      await client.join(userRoom(user.id));
      if (user.role === Role.RIDER && user.status === AccountStatus.ACTIVE) await client.join(riderRoom);
      if (user.role === Role.ADMIN) await client.join('admins');
    } catch {
      this.logger.debug('Rejected unauthenticated socket');
      client.disconnect(true);
    }
  }
}
