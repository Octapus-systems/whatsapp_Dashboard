# Wirebot SDKs

Official client libraries for the Wirebot WhatsApp API Gateway.

> **Note:** These SDKs are scaffolds and will be auto-generated from the OpenAPI spec in the future. They provide a working starting point for community contributions.

## JavaScript / TypeScript

```bash
cd sdk/javascript
npm install
npm run build
```

```typescript
import { WirebotClient } from '@wirebot/sdk';

const client = new WirebotClient({
  baseUrl: 'http://localhost:2785',
  apiKey: 'your-api-key',
});

const result = await client.messages.sendText('session-1', {
  chatId: '628123456789@c.us',
  text: 'Hello from Wirebot SDK!',
});
```

## Python

```bash
cd sdk/python
pip install -e .
```

```python
from wirebot import WirebotClient

client = WirebotClient(
    base_url="http://localhost:2785",
    api_key="your-api-key",
)

result = client.messages.send_text("session-1", {
    "chatId": "628123456789@c.us",
    "text": "Hello from Wirebot Python SDK!",
})
```
