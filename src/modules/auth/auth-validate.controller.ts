import { Controller, Post, Headers, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { createLogger } from '../../common/services/logger.service';

@ApiTags('auth')
@Controller('auth')
export class AuthValidateController {
  private readonly logger = createLogger('AuthValidateController');

  constructor(private readonly authService: AuthService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate an API key' })
  @ApiHeader({ name: 'X-API-Key', description: 'API key to validate' })
  @ApiResponse({ status: 200, description: 'API key is valid' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  async validate(@Headers('x-api-key') apiKey?: string): Promise<{ valid: boolean; role?: string }> {
    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    // Check if this is the master key — it bypasses the DB and is always admin
    const masterKey = process.env.API_MASTER_KEY;
    if (masterKey && apiKey === masterKey) {
      return { valid: true, role: 'admin' };
    }

    try {
      const keyEntity = await this.authService.validateApiKey(apiKey);
      if (keyEntity && keyEntity.isActive) {
        return { valid: true, role: keyEntity.role };
      }
      throw new UnauthorizedException('Invalid or inactive API key');
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.warn('API key validation error', { error: error instanceof Error ? error.message : String(error) });
      throw new UnauthorizedException('Invalid API key');
    }
  }
}
