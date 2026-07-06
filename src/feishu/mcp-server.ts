/**
 * Feishu MCP Server
 *
 * Wraps Feishu messaging capabilities as SDK MCP tools.
 * LLM can call these tools directly to send cards/text to the user.
 *
 * Tools (3 core):
 *   - feishu_send_text: Send a text message to the chat
 *   - feishu_send_card: Send an interactive card (CardKit JSON)
 *   - feishu_update_card: Update an existing card by messageId
 *
 * @module feishu/mcp-server
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { IMessageSender } from '../bridge/message-sender.interface.js';

/**
 * Create a Feishu MCP server bound to a specific chat.
 * Each execution gets its own MCP server instance with the current chatId.
 *
 * @param sender - Feishu message sender (per-bot instance)
 * @param chatId - Current chat ID (where messages will be sent)
 * @returns MCP server config for SDK query options.mcpServers
 */
export function createFeishuMcpServer(sender: IMessageSender, chatId: string) {
  return createSdkMcpServer({
    name: 'feishu',
    alwaysLoad: true,
    tools: [
      // Tool 1: Send text message
      tool(
        'feishu_send_text',
        'Send a text message to the user in the current Feishu chat. Use this for short replies, status updates, or questions.',
        {
          text: z.string().min(1).max(4000).describe('The text content to send'),
        },
        async (args) => {
          try {
            await sender.sendText(chatId, args.text);
            return {
              content: [{ type: 'text' as const, text: `Message sent (${args.text.length} chars)` }],
            };
          } catch (err: any) {
            return {
              content: [{ type: 'text' as const, text: `Failed to send: ${err.message}` }],
              isError: true,
            };
          }
        },
      ),

      // Tool 2: Send interactive card
      tool(
        'feishu_send_card',
        'Send an interactive card (Feishu CardKit JSON) to the user. Use for structured content like task lists, data tables, or buttons.',
        {
          card_json: z.string().min(1).describe('CardKit JSON 2.0 content string'),
        },
        async (args) => {
          try {
            await sender.sendRawCard(chatId, args.card_json);
            return {
              content: [{
                type: 'text' as const,
                text: `Card sent to chat ${chatId}`,
              }],
            };
          } catch (err: any) {
            return {
              content: [{ type: 'text' as const, text: `Failed to send card: ${err.message}` }],
              isError: true,
            };
          }
        },
      ),

      // Tool 3: Update existing card
      tool(
        'feishu_update_card',
        'Update an existing card by its message ID. Use for streaming updates or progressive card rendering.',
        {
          message_id: z.string().min(1).describe('The message ID of the card to update'),
          card_json: z.string().min(1).describe('New CardKit JSON 2.0 content'),
        },
        async (args) => {
          try {
            await (sender as any).updateCard(args.message_id, args.card_json);
            return {
              content: [{ type: 'text' as const, text: `Card updated (${args.message_id})` }],
            };
          } catch (err: any) {
            return {
              content: [{ type: 'text' as const, text: `Failed to update: ${err.message}` }],
              isError: true,
            };
          }
        },
      ),
    ],
  });
}
