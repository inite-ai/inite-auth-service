/**
 * Public MCP endpoint that handles user onboarding — the AI assistant
 * can talk to this server BEFORE the user is signed in, walk them
 * through the RFC 8628 device flow, and hand back an access_token.
 *
 *   POST /v1/mcp/login
 *
 * Three tools surfaced:
 *   - start_login         → device_code + user_code + verification URL
 *   - poll_login          → polls /oauth/token; returns access_token on approval
 *   - whoami              → optional access_token → user profile (or null)
 *
 * No `Authorization` header required — this is the bootstrap point for
 * MCP clients (Claude Desktop, Cursor, …) that don't have a token yet.
 *
 * Wire-protocol: JSON-RPC 2.0 over single HTTP request/response. SSE
 * streaming is omitted — every tool here completes synchronously
 * inside one round-trip.
 */

import { Body, Controller, Post, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { DeviceFlowService } from '../oauth/device-flow.service';
import { OAuthService } from '../oauth/oauth.service';
import { PrismaService } from '../prisma/prisma.service';

const SERVER_INFO = { name: 'inite-auth-login', version: '1.0.0' };
const PROTOCOL_VERSION = '2024-11-05';
const CLIENT_ID = 'inite-cli';

const TOOLS = [
  {
    name: 'start_login',
    description:
      "Begin the device-flow sign-in (RFC 8628). Returns a short user_code, the verification URL the user opens in their browser, and a device_code the assistant must pass to poll_login. Use when the user says 'log me in', 'sign in', 'authenticate me' and there is no existing INITE token.",
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'poll_login',
    description:
      "Poll the token endpoint for the device_code returned by start_login. Returns { status: 'pending' } while the user has not yet approved, { status: 'approved', access_token, refresh_token, expires_in } once they do, or { status: 'denied' | 'expired' } on terminal states. Tell the user to open the verification_uri shown by start_login and approve, then call this until status === 'approved'.",
    inputSchema: {
      type: 'object',
      properties: {
        device_code: {
          type: 'string',
          description: 'The device_code returned by start_login.',
        },
      },
      required: ['device_code'],
    },
  },
  {
    name: 'whoami',
    description:
      "Return the profile of the currently-signed-in INITE user (DID, email, name, isAdmin) if an access_token is passed OR if the request carries an Authorization: Bearer header. Returns { authenticated: false } when no valid token is present. Use to verify a freshly-issued token from poll_login or to confirm an existing session.",
    inputSchema: {
      type: 'object',
      properties: {
        access_token: {
          type: 'string',
          description:
            'Optional. JWT to inspect. If omitted, falls back to the request Authorization header.',
        },
      },
      required: [],
    },
  },
];

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: any;
}

@Controller({ path: 'mcp/login', version: '1' })
export class MCPLoginController {
  constructor(
    private readonly deviceFlow: DeviceFlowService,
    private readonly oauthService: OAuthService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  @Post()
  async handle(@Body() body: JsonRpcRequest, @Req() req: Request) {
    const { id, method, params } = body ?? ({} as JsonRpcRequest);

    try {
      switch (method) {
        case 'initialize':
          return rpcOk(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          });

        case 'notifications/initialized':
          // Notification — per JSON-RPC spec we should not return a
          // response. Returning 200 with empty body keeps the HTTP
          // transport simple.
          return null;

        case 'tools/list':
          return rpcOk(id, { tools: TOOLS });

        case 'tools/call': {
          const { name, arguments: args } = params ?? {};
          const result = await this.callTool(name, args ?? {}, req);
          return rpcOk(id, {
            content: [
              { type: 'text', text: JSON.stringify(result, null, 2) },
            ],
          });
        }

        default:
          return rpcErr(id, -32601, `Method not found: ${method}`);
      }
    } catch (err: any) {
      const message = err?.message ?? 'Internal error';
      return rpcErr(id, -32603, message);
    }
  }

  private async callTool(
    name: string,
    args: Record<string, any>,
    req: Request,
  ): Promise<unknown> {
    switch (name) {
      case 'start_login':
        return this.startLogin(req);
      case 'poll_login':
        return this.pollLogin(args.device_code as string);
      case 'whoami':
        return this.whoami(req, args.access_token as string | undefined);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Tools
  // ────────────────────────────────────────────────────────────────

  private async startLogin(req: Request) {
    const client = await this.oauthService.validateClient(CLIENT_ID);
    const proto =
      (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
    const host = req.headers.host ?? 'auth.inite.ai';
    const verificationUri = `${proto}://${host}/v1/oauth/device`;
    const res = await this.deviceFlow.issue({
      client,
      scope: 'openid profile email',
      verificationUri,
    });
    return {
      // Echoed so the AI can show the user where to go.
      verification_uri: res.verification_uri,
      verification_uri_complete: res.verification_uri_complete,
      user_code: res.user_code,
      expires_in: res.expires_in,
      interval: res.interval,
      // Opaque — passed back to poll_login.
      device_code: res.device_code,
      instructions:
        `Open ${res.verification_uri_complete} in your browser and approve the request. ` +
        `Then call poll_login with device_code=${res.device_code} every ${res.interval}s ` +
        `until status === 'approved' (will time out after ${res.expires_in}s).`,
    };
  }

  private async pollLogin(deviceCode: string) {
    if (!deviceCode) throw new Error('device_code is required');
    try {
      const approved = await this.deviceFlow.pollForApproval({
        deviceCode,
        clientId: CLIENT_ID,
      });
      const user = await this.prisma.user.findUnique({
        where: { id: approved.userId! },
      });
      if (!user) {
        return { status: 'denied', error: 'user_not_found' };
      }
      const tokens = await this.oauthService.generateTokens(
        user,
        CLIENT_ID,
        approved.scope ?? '',
      );
      return {
        status: 'approved',
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: tokens.expiresIn,
        scope: tokens.scope,
        next_step:
          'Save access_token in ~/.config/inite/auth.json or your MCP client config under ' +
          'Authorization: Bearer …, then point at any vertical MCP route (e.g. ' +
          'https://inite.rent/mcp/<companySlug>).',
      };
    } catch (err: any) {
      // The token endpoint throws OAuth-spec errors like
      // 'authorization_pending', 'slow_down', 'access_denied', 'expired_token'.
      const msg: string = err?.message ?? '';
      const oauthError =
        err?.response?.error ??
        err?.error ??
        (msg.match(/authorization_pending|slow_down|access_denied|expired_token/)?.[0] ??
          null);
      if (oauthError === 'authorization_pending')
        return { status: 'pending' };
      if (oauthError === 'slow_down')
        return { status: 'pending', slow_down: true };
      if (oauthError === 'access_denied')
        return { status: 'denied' };
      if (oauthError === 'expired_token')
        return { status: 'expired' };
      throw err;
    }
  }

  private async whoami(req: Request, accessTokenArg: string | undefined) {
    const fromHeader = (req.headers.authorization ?? '').trim();
    const bearer =
      accessTokenArg ??
      (fromHeader.toLowerCase().startsWith('bearer ')
        ? fromHeader.slice(7).trim()
        : '');
    if (!bearer) return { authenticated: false };

    try {
      const payload = (await this.jwtService.verifyAsync(bearer)) as any;
      const sub = payload?.sub as string | undefined;
      if (!sub) return { authenticated: false };

      const user = await this.prisma.user.findUnique({
        where: { did: sub },
      });
      if (!user) return { authenticated: false };

      return {
        authenticated: true,
        did: user.did,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        isAdmin: !!(user.metadata as any)?.isAdmin,
      };
    } catch {
      return { authenticated: false };
    }
  }
}

// ──────────────────────────────────────────────────────────────────
//  JSON-RPC helpers
// ──────────────────────────────────────────────────────────────────

function rpcOk(id: number | string | null | undefined, result: any) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcErr(
  id: number | string | null | undefined,
  code: number,
  message: string,
) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}
