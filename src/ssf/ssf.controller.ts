import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
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

  private scope(req: any): AdminScope {
    const scope = resolveAdminScope(req.user);
    if (!scope) throw new ForbiddenException('admin access required');
    return scope;
  }

  @Post('streams')
  create(@Req() req: any, @Body() dto: CreateStreamDto) {
    return this.streams.create(this.scope(req), dto);
  }

  @Get('streams')
  list(@Req() req: any) {
    return this.streams.list(this.scope(req));
  }

  @Get('streams/:streamId')
  get(@Req() req: any, @Param('streamId') streamId: string) {
    return this.streams.get(this.scope(req), streamId);
  }

  @Delete('streams/:streamId')
  async remove(@Req() req: any, @Param('streamId') streamId: string) {
    await this.streams.remove(this.scope(req), streamId);
    return { success: true };
  }

  @Post('streams/:streamId/verification')
  async verify(@Req() req: any, @Param('streamId') streamId: string) {
    const stream = await this.streams.get(this.scope(req), streamId);
    await this.emitter.verify(stream);
    return { status: 'sent' };
  }

  @Post('streams/:streamId/poll')
  async poll(@Req() req: any, @Param('streamId') streamId: string, @Body() dto: PollRequestDto) {
    const stream = await this.streams.get(this.scope(req), streamId);
    const sets = await this.delivery.poll(stream.id, dto.acks ?? [], dto.maxEvents ?? 20);
    return { sets };
  }
}
