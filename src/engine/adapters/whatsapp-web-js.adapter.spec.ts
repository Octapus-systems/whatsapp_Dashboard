import { EngineStatus } from '../interfaces/whatsapp-engine.interface';
import { WhatsAppWebJsAdapter } from './whatsapp-web-js.adapter';

describe('WhatsAppWebJsAdapter client recovery', () => {
  it('marks a stale READY client disconnected when loading contacts is aborted', async () => {
    const onDisconnected = jest.fn();
    const adapter = new WhatsAppWebJsAdapter({
      sessionId: 'test-session',
      sessionDataPath: './data/sessions',
    });

    // Simulate a WhatsApp Web page that has died without emitting its normal
    // `disconnected` event. This is the state that previously left the session
    // displayed as READY while the dashboard could neither load chats nor send.
    (adapter as unknown as { client: unknown }).client = {
      getContacts: jest.fn().mockRejectedValue(new Error('signal is aborted without reason')),
    };
    (adapter as unknown as { status: EngineStatus }).status = EngineStatus.READY;
    (adapter as unknown as { callbacks: { onDisconnected: typeof onDisconnected } }).callbacks = { onDisconnected };

    await expect(adapter.getContacts()).rejects.toThrow('signal is aborted without reason');

    expect(adapter.getStatus()).toBe(EngineStatus.DISCONNECTED);
    expect(onDisconnected).toHaveBeenCalledWith(
      expect.stringContaining('signal is aborted without reason'),
    );
  });
});
