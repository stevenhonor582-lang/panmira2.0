"""Apply R49-C1 step 4 patches - integrate BridgeStream, replace buildContinuationPrompt"""
fp = '/home/ubuntu/panmira-N1/src/bridge/message-bridge.ts'
with open(fp, 'r', encoding='utf-8') as f:
    content = f.read()

# Find buildContinuationPrompt block - use exact regex
import re
m = re.search(
    r'  private buildContinuationPrompt\(originalPrompt: string, lastState: CardState\): string \{[\s\S]*?\n  \}\n',
    content,
)
assert m, "buildContinuationPrompt block not found"
old_block = m.group(0)
old_block_len = len(old_block)
new_block = """  private buildContinuationPrompt(originalPrompt: string, lastState: CardState): string {
    return _buildContinuationPrompt(originalPrompt, lastState);
  }
"""
assert len(new_block) < old_block_len, f"new block not smaller: {len(new_block)} vs {old_block_len}"
content = content.replace(old_block, new_block)

with open(fp, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"OK step 4 buildContinuationPrompt replaced (saved {old_block_len - len(new_block)} chars)")