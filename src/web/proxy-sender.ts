import type { WebSocket } from 'ws';
import type { IMessageSender } from '../bridge/message-sender.interface.js';
import type { CardState } from '../types.js';

/**
 * ProxySender replaces the platform sender for proxy_message requests.
 * Instead of sending cards to Feishu directly, it serializes them as
 * JSON through the WebSocket back to the Gateway, which then routes
 * them to the correct Feishu app.
 */
export class ProxySender implements IMessageSender {
  private messageIdCounter = 0;

  constructor(
    private ws: WebSocket,
    private chatId: string,
    private originalSender: IMessageSender,
  ) {}

  private nextMessageId(): string {
    return `proxy-${this.chatId}-${++this.messageIdCounter}-${Date.now()}`;
  }

  async sendCard(chatId: string, state: CardState): Promise<string | undefined> {
    const messageId = this.nextMessageId();
    this.sendToGateway('proxy_send_card', { chatId, messageId, state });
    return messageId;
  }

  async updateCard(messageId: string, state: CardState): Promise<boolean> {
    this.sendToGateway('proxy_update_card', { chatId: this.chatId, messageId, state });
    return true;
  }

  async sendTextNotice(chatId: string, title: string, content: string, color: string = 'blue'): Promise<void> {
    this.sendToGateway('proxy_text_notice', { chatId, title, content, color });
  }

  async sendRawCard(chatId: string, cardJson: string): Promise<void> {
    this.sendToGateway('proxy_raw_card', { chatId, cardJson });
  }

  async sendText(chatId: string, text: string): Promise<void> {
    this.sendToGateway('proxy_send_text', { chatId, text });
  }

  async sendImageFile(chatId: string, filePath: string): Promise<boolean> {
    this.sendToGateway('proxy_send_image', { chatId, filePath });
    return true;
  }

  async sendLocalFile(chatId: string, filePath: string, fileName: string): Promise<boolean> {
    this.sendToGateway('proxy_send_file', { chatId, filePath, fileName });
    return true;
  }

  /** Download using the original Feishu sender — proxy can't download remotely */
  async downloadImage(messageId: string, imageKey: string, savePath: string): Promise<boolean> {
    return this.originalSender.downloadImage(messageId, imageKey, savePath);
  }

  /** Download using the original Feishu sender */
  async downloadFile(messageId: string, fileKey: string, savePath: string): Promise<boolean> {
    return this.originalSender.downloadFile(messageId, fileKey, savePath);
  }

  private sendToGateway(type: string, payload: Record<string, unknown>): void {
    if (this.ws.readyState !== 1) {
      return;
    }
    this.ws.send(JSON.stringify({ type, ...payload }));
  }
}
