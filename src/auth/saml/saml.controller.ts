import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { SamlEnabledGuard } from './saml-enabled.guard';
import { SamlConnectionStore } from './saml-connection.store';
import { SamlService } from './saml.service';

/**
 * Public SAML 2.0 SP endpoints (RFC-adjacent OASIS SAML core). PR 1 exposes the
 * SP metadata for a connection; SP-initiated start + the ACS callback land in a
 * follow-up. Gated by SAML_ENABLED.
 *
 *   GET /v1/auth/saml/:slug/metadata → SP EntityDescriptor XML
 */
@ApiTags('auth')
@UseGuards(SamlEnabledGuard)
@Controller({ path: 'auth/saml', version: '1' })
export class SamlController {
  constructor(
    private readonly store: SamlConnectionStore,
    private readonly saml: SamlService,
  ) {}

  @Get(':slug/metadata')
  @ApiOperation({ summary: 'SAML SP metadata (EntityDescriptor) for a connection' })
  async metadata(@Param('slug') slug: string, @Res() res: Response): Promise<void> {
    const connection = await this.store.findEnabledBySlug(slug);
    res.type('application/xml').send(this.saml.metadata(connection));
  }
}
