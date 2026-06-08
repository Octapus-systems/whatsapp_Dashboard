/**
 * WhatsApp-web.js Engine Plugin
 * Built-in engine plugin that wraps the whatsapp-web.js library
 */

import { PluginContext, PluginType, IEnginePlugin } from '../../../core/plugins';
import { IWhatsAppEngine } from '../../../engine/interfaces/whatsapp-engine.interface';
import { WhatsAppWebJsAdapter } from '../../../engine/adapters/whatsapp-web-js.adapter';

export interface WhatsAppWebJsConfig {
  sessionDataPath?: string;
  headless?: boolean;
  puppeteerArgs?: string[];
  puppeteerExecutablePath?: string;
}

export class WhatsAppWebJsPlugin implements IEnginePlugin {
  type = PluginType.ENGINE as const;
  private context?: PluginContext;

  onLoad(context: PluginContext): Promise<void> {
    this.context = context;
    context.logger.log('WhatsApp-web.js engine plugin loaded');
    return Promise.resolve();
  }

  onEnable(context: PluginContext): Promise<void> {
    context.logger.log('WhatsApp-web.js engine plugin enabled');
    return Promise.resolve();
  }

  onDisable(context: PluginContext): Promise<void> {
    context.logger.log('WhatsApp-web.js engine plugin disabled');
    return Promise.resolve();
  }

  createEngine(config: Record<string, unknown>): IWhatsAppEngine {
    const engineConfig =
      (
        this.context?.config as unknown as {
          engine?: {
            sessionDataPath?: string;
            puppeteer?: {
              headless?: boolean;
              args?: string[];
              executablePath?: string;
            };
          };
        }
      )?.engine ?? {};
    const sessionId = config.sessionId as string;
    const sessionDataPath = engineConfig.sessionDataPath ?? './data/sessions';
    const headless = engineConfig.puppeteer?.headless ?? true;
    const puppeteerArgs = engineConfig.puppeteer?.args ?? ['--no-sandbox', '--disable-setuid-sandbox'];
    const puppeteerExecutablePath = engineConfig.puppeteer?.executablePath ?? process.env.PUPPETEER_EXECUTABLE_PATH;

    const proxyUrl = config.proxyUrl as string | undefined;
    const proxyType = config.proxyType as 'http' | 'https' | 'socks4' | 'socks5' | undefined;

    return new WhatsAppWebJsAdapter({
      sessionId,
      sessionDataPath,
      puppeteer: {
        headless,
        args: puppeteerArgs,
        executablePath: puppeteerExecutablePath || undefined,
      },
      proxy: proxyUrl
        ? {
            url: proxyUrl,
            type: proxyType ?? 'http',
          }
        : undefined,
    });
  }

  getFeatures(): string[] {
    return [
      'text-messages',
      'media-messages',
      'location-messages',
      'contact-messages',
      'group-management',
      'message-reactions',
      'message-replies',
      'message-forwarding',
      'message-deletion',
      'read-receipts',
      'typing-indicator',
      'labels',
      'channels',
      'status-updates',
      'catalog',
    ];
  }

  healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return Promise.resolve({ healthy: true, message: 'WhatsApp-web.js engine is available' });
  }
}

export default WhatsAppWebJsPlugin;
