"""Apply R49-C1 step 2 patches to message-bridge.ts - replace local card methods with facades"""
import re
import sys

fp = '/home/ubuntu/panmira-N1/src/bridge/message-bridge.ts'
with open(fp, 'r', encoding='utf-8') as f:
    content = f.read()

# Read original method bodies from backup
with open('/tmp/message-bridge.ts.bak', 'r', encoding='utf-8') as f:
    orig = f.read()

# --- Extract the original methods to replace ---
# Find the block: from "Send the final card update" comment through "sendPlanContent" method end
m = re.search(
    r'  /\*\*\n   \* Send the final card update.*?\n  private async sendPlanContent\(chatId: string, processor: StreamProcessor, _currentState: CardState\): Promise<void> \{\n    return sendPlanContent\(this\._cardDeps, chatId, processor, _currentState\);\n  \}',
    orig,
    re.DOTALL,
)
assert m, "sendFinalCard+sAutonomy+sendPlanContent block not found"
block_to_replace = m.group(0)

# Replace with thin facades
replacement = """  /**
   * Facade — 转发到 this.card (R49-C1 step 2 抽出 BridgeCard)
   */
  private async sendFinalCard(messageId: string, state: CardState, chatId?: string): Promise<void> {
    return this.card.sendFinalCard(messageId, state, chatId);
  }
  public getAutonomyViolationCount(): number { return this.card.getAutonomyViolationCount(); }
  public resetAutonomyViolationCount(): void { return this.card.resetAutonomyViolationCount(); }
  private auditBotAutonomy(state: CardState, chatId?: string): { violations: string[], count: number } {
    return this.card.auditBotAutonomy(state, chatId);
  }
  private async sendPlanContent(chatId: string, processor: StreamProcessor, currentState: CardState): Promise<void> {
    return this.card.sendPlanContent(chatId, processor, currentState);
  }"""

content = content.replace(block_to_replace, replacement)
assert block_to_replace not in content, "old block still present"

# --- Replace sendCompletionNotice ---
old = """  private async sendCompletionNotice(chatId: string, state: CardState, durationMs: number): Promise<void> {
    return sendCompletionNotice(this._cardDeps, chatId, state, durationMs);
  }"""
new = """  private async sendCompletionNotice(chatId: string, state: CardState, durationMs: number): Promise<void> {
    return this.card.sendCompletionNotice(chatId, state, durationMs);
  }"""
assert old in content
content = content.replace(old, new)

# --- Replace auditCorrectFinalCard ---
m2 = re.search(
    r'  private async auditCorrectFinalCard\(\n    chatId: string,\n    state: CardState,\n  \): Promise<CardState> \{.*?^\}',
    orig,
    re.DOTALL | re.MULTILINE,
)
assert m2, "auditCorrectFinalCard block not found"
audit_block = m2.group(0)
audit_replacement = """  private async auditCorrectFinalCard(
    chatId: string,
    state: CardState,
  ): Promise<CardState> {
    return this.card.auditCorrectFinalCard(chatId, state);
  }"""
content = content.replace(audit_block, audit_replacement)
assert audit_block not in content, "auditCorrectFinalCard block still present"

with open(fp, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"OK step 2 patches applied. New length: {len(content)} chars")