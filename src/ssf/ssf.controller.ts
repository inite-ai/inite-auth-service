import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { resolveAdminScope, AdminScope } from '../admin/admin-scope';
import { SsfStreamService } from './ssf-stream.service';
import { SsfDeliveryService } from './ssf-delivery.service';
import { SsfEmitterService } from './ssf-emitter.service';
import { CreateStreamDto } from './dto/create-stream.dto';
import { PollRequestDto } from './dto/poll-request.dto';

/**
 * OpenID Shared Signals Framework transmitter API. Admin-scoped stream
 * management + poll delivery. Streams are tenant-scoped to the operator.
 */
@ApiTags('ssf')
@Controller({ path: 'ssf', version: '1' })
@UseGuards(AdminGuard)
export class SsfController {
  constructor(
    private readonly streams: SsfStreamService,
    private readonly delivery: SsfDeliveryService,
    private readonly emitter: SsfEmitterService,
  ) {}

  private scope(user: AuthenticatedUser): AdminScope {
    const scope = resolveAdminScope(user);
    if (!scope) throw new ForbiddenException('admin access required');
    return scope;
  }

  @Post('streams')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStreamDto) {
    return this.streams.create(this.scope(user), dto);
  }

  @Get('streams')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.streams.list(this.scope(user));
  }

  @Get('streams/:streamId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('streamId') streamId: string) {
    return this.streams.get(this.scope(user), streamId);
  }

  @Delete('streams/:streamId')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('streamId') streamId: string) {
    await this.streams.remove(this.scope(user), streamId);
    return { success: true };
  }

  @Post('streams/:streamId/verification')
  async verify(@CurrentUser() user: AuthenticatedUser, @Param('streamId') streamId: string) {
    const stream = await this.streams.get(this.scope(user), streamId);
    await this.emitter.verify(stream);
    return { status: 'sent' };
  }

  @Post('streams/:streamId/poll')
  async poll(@CurrentUser() user: AuthenticatedUser, @Param('streamId') streamId: string, @Body() dto: PollRequestDto) {
    const stream = await this.streams.get(this.scope(user), streamId);
    const sets = await this.delivery.poll(stream.id, dto.acks ?? [], dto.maxEvents ?? 20);
    return { sets };
  }
}
