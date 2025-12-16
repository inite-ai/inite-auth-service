import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== Dashboard Stats ====================

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  // ==================== Users Management ====================

  @Get('users')
  async getAllUsers(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.adminService.getAllUsers(parseInt(page), parseInt(limit));
  }

  @Get('users/:userId')
  async getUserById(@Param('userId') userId: string) {
    return this.adminService.getUserById(userId);
  }

  @Put('users/:userId/roles')
  async updateUserRoles(
    @Param('userId') userId: string,
    @Body() body: { roles: string[] },
  ) {
    return this.adminService.updateUserRoles(userId, body.roles);
  }

  @Delete('users/:userId')
  async deleteUser(@Param('userId') userId: string) {
    return this.adminService.deleteUser(userId);
  }

  // ==================== OAuth Clients Management ====================

  @Get('oauth-clients')
  async getAllOAuthClients() {
    return this.adminService.getAllOAuthClients();
  }

  @Get('oauth-clients/:clientId')
  async getOAuthClientById(@Param('clientId') clientId: string) {
    return this.adminService.getOAuthClientById(clientId);
  }

  @Post('oauth-clients')
  async createOAuthClient(
    @Body()
    body: {
      name: string;
      clientId: string;
      clientSecret: string;
      redirectUris: string[];
      allowedScopes?: string[];
    },
  ) {
    return this.adminService.createOAuthClient(body);
  }

  @Put('oauth-clients/:clientId')
  async updateOAuthClient(
    @Param('clientId') clientId: string,
    @Body()
    body: Partial<{
      name: string;
      redirectUris: string[];
      allowedScopes: string[];
      isActive: boolean;
    }>,
  ) {
    return this.adminService.updateOAuthClient(clientId, body);
  }

  @Delete('oauth-clients/:clientId')
  async deleteOAuthClient(@Param('clientId') clientId: string) {
    return this.adminService.deleteOAuthClient(clientId);
  }
}

