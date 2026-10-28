import {
  Controller,
  Get,
  GoneException,
  NotFoundException,
  Param,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Response } from 'express';
import { AgentsService } from './agents.service';

/**
 * did:web resolution for agents: `did:web:<host>:agents:<id>` is fetched from
 * `https://<host>/agents/<id>/did.json`. Public — the point of the document is
 * that anyone an agent pays or calls can see whose agent it is.
 */
@Controller({ path: 'agents', version: VERSION_NEUTRAL })
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get(':id/did.json')
  async didDocument(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const found = await this.agents.document(id);
    if (!found) throw new NotFoundException('No such agent');
    // A retired agent's DID is deactivated: resolvers get 410 Gone.
    if (found.deactivated) throw new GoneException('This agent was disconnected');
    res.setHeader('Content-Type', 'application/did+json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return found.document;
  }
}
