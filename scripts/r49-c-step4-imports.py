fp = '/home/ubuntu/panmira-N1/src/bridge/message-bridge.ts'
with open(fp, 'r', encoding='utf-8') as f:
    content = f.read()

# Add BridgeStream import
old = "import { BridgeExecutor } from './bridge-executor.js';\n"
new = "import { BridgeExecutor } from './bridge-executor.js';\nimport { BridgeStream, buildContinuationPrompt as _buildContinuationPrompt } from './bridge-stream.js';\n"
assert old in content
content = content.replace(old, new)

# Add stream field
old = "  private executor2!: BridgeExecutor;\n"
new = "  private executor2!: BridgeExecutor;\n  private stream!: BridgeStream;\n"
assert old in content
content = content.replace(old, new)

# Instantiate stream in constructor (after executor2)
old = """    this.executor2 = new BridgeExecutor({
      config: this.config,
      logger: this.logger,
      sessionManager: this.sessionManager,
      getSender: (chatId) => this.getSender(chatId),
      defaultEngine: this.engine,
      defaultExecutor: this.executor,
    });"""
new = """    this.executor2 = new BridgeExecutor({
      config: this.config,
      logger: this.logger,
      sessionManager: this.sessionManager,
      getSender: (chatId) => this.getSender(chatId),
      defaultEngine: this.engine,
      defaultExecutor: this.executor,
    });
    this.stream = new BridgeStream({
      config: this.config,
      logger: this.logger,
      sessionManager: this.sessionManager,
      getSender: (chatId) => this.getSender(chatId),
    });"""
assert old in content
content = content.replace(old, new)

with open(fp, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"OK step 4 imports + field + constructor wired. New length: {len(content)} chars")