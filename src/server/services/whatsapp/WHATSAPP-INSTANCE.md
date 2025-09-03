# WhatsApp Instance Service

The `WhatsappInstance` service is a comprehensive WhatsApp Web API wrapper built on top of [Baileys](https://github.com/WhiskeySockets/Baileys). It provides a robust, production-ready solution for managing WhatsApp instances with advanced features like message delivery tracking, automatic reconnection, error recovery, and human-like messaging behavior.

## 🚀 Features

### Core Functionality
- **Multi-Instance Management**: Handle multiple WhatsApp instances simultaneously
- **QR Code Authentication**: Easy registration with QR code scanning
- **Session Persistence**: Automatic session storage and restoration
- **Message Delivery Tracking**: Real-time delivery status monitoring
- **Human-like Behavior**: Typing indicators, delays, and presence updates
- **Automatic Reconnection**: Smart reconnection with exponential backoff
- **Error Recovery**: Advanced MAC/decryption error handling
- **Privacy Controls**: Configurable privacy settings

### Message Types Supported
- **Text Messages**: Plain text with human-like typing delays
- **Media Messages**: Images, videos, audio files, and documents
- **Interactive Messages**: Buttons, lists, and template messages
- **Reply Messages**: Context-aware message replies

### Advanced Features
- **Delivery Confirmation**: Wait for message delivery/read status
- **Block Detection**: Automatic detection of blocked numbers
- **Rate Limiting**: Built-in rate limiting and retry mechanisms
- **Health Monitoring**: Continuous connection health checks
- **Graceful Shutdown**: Clean disconnection and cleanup

## 📋 Table of Contents

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Message Types](#message-types)
- [Event Handling](#event-handling)
- [Error Handling](#error-handling)
- [Advanced Features](#advanced-features)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## 🛠 Installation

```bash
npm install @whiskeysockets/baileys qrcode pino
```

## 🎯 Basic Usage

### 1. Create an Instance

```typescript
import { WhatsappInstance } from './whatsapp-instance.service';

const instance = new WhatsappInstance('1234567890', {
  // Database callbacks
  getAppAuth: async (phoneNumber) => {
    // Return stored authentication data
    return await database.getAuth(phoneNumber);
  },
  updateAppAuth: async (phoneNumber, data) => {
    // Update authentication data
    return await database.updateAuth(phoneNumber, data);
  },
  deleteAppAuth: async (phoneNumber) => {
    // Delete authentication data
    await database.deleteAuth(phoneNumber);
  },
  updateAppKey: async (phoneNumber, keyType, keyId, data) => {
    // Update encryption keys
    await database.updateKey(phoneNumber, keyType, keyId, data);
  },
  getAppKeys: async (phoneNumber) => {
    // Get all encryption keys
    return await database.getKeys(phoneNumber);
  },
  
  // Event callbacks
  onIncomingMessage: async (message, raw) => {
    console.log('Received message:', message.text);
  },
  onOutgoingMessage: async (message, raw, info, deliveryStatus) => {
    console.log('Message sent:', message.text);
  },
  onReady: async (instance) => {
    console.log('Instance is ready!');
  },
  onDisconnect: async (phoneNumber, reason) => {
    console.log('Disconnected:', reason);
  },
  
  // Configuration
  debugMode: ['info', 'error'],
  tempDir: '.wa-auth-temp'
});
```

### 2. Register a New Instance

```typescript
// Get QR code for registration
const qrCode = await instance.register();
console.log('Scan this QR code:', qrCode);

// The instance will automatically connect after QR scan
```

### 3. Connect Existing Instance

```typescript
// Connect to existing session
await instance.connect();
```

### 4. Send Messages

```typescript
// Send text message
await instance.send('1234567890', 'Hello World!');

// Send with delivery tracking
await instance.send('1234567890', 'Hello World!', {
  trackDelivery: true,
  waitForDelivery: true,
  onDelivered: (messageId, toNumber, timestamp) => {
    console.log(`Message delivered to ${toNumber} at ${timestamp}`);
  }
});

// Send media message
await instance.send('1234567890', {
  type: 'image',
  data: imageBuffer,
  caption: 'Check this out!',
  mimetype: 'image/jpeg'
});
```

## ⚙️ Configuration

### WAInstanceConfig

```typescript
interface WAInstanceConfig<T> {
  // Required database callbacks
  getAppAuth: (phoneNumber: string) => Promise<WAAppAuth<T> | null>;
  updateAppAuth: (phoneNumber: string, data: Partial<WAAppAuth<T>>) => Promise<WAAppAuth<T>>;
  deleteAppAuth: (phoneNumber: string) => Promise<void>;
  updateAppKey: (phoneNumber: string, keyType: string, keyId: string, data: Partial<any>) => Promise<void>;
  getAppKeys: (phoneNumber: string) => Promise<any[]>;
  
  // Optional configuration
  tempDir?: string; // Default: '.wa-auth-temp'
  debugMode?: true | 'error' | 'warn' | 'info' | 'debug' | ('error' | 'warn' | 'info' | 'debug')[];
  
  // Event callbacks
  onIncomingMessage?: WAMessageIncomingCallback;
  onOutgoingMessage?: WAMessageOutgoingCallback;
  onMessageBlocked?: WAMessageBlockCallback;
  onRegistered?: (phoneNumber: string) => Promise<unknown> | unknown;
  onReady?: (instance: WhatsappInstance<T>) => Promise<unknown> | unknown;
  onDisconnect?: (phoneNumber: string, reason: string) => Promise<unknown> | unknown;
  onError?: (phoneNumber: string, error: any) => Promise<unknown> | unknown;
  onRemove?: (phoneNumber: string) => Promise<unknown> | unknown;
  onUpdate?: (state: Partial<WAAppAuth<T>>) => Promise<unknown> | unknown;
}
```

## 📚 API Reference

### Core Methods

#### `register(): Promise<string>`
Registers a new WhatsApp instance and returns a QR code data URL.

```typescript
const qrCode = await instance.register();
// Display QR code to user for scanning
```

#### `connect(): Promise<void>`
Connects to an existing WhatsApp session.

```typescript
await instance.connect();
```

#### `send(toNumber: string, payload: WAOutgoingContent, options?: WASendOptions): Promise<WebMessageInfo & Partial<WAMessageDelivery>>`
Sends a message to the specified number.

```typescript
const result = await instance.send('1234567890', 'Hello!', {
  maxRetries: 3,
  retryDelay: 1000,
  trackDelivery: true,
  waitForDelivery: true
});
```

#### `disconnect(logout?: boolean, clearSocket?: boolean, reason?: string): Promise<void>`
Disconnects the instance gracefully.

```typescript
await instance.disconnect(true, false, 'Manual disconnect');
```

#### `remove(clearData?: boolean, delay?: number): Promise<void>`
Removes the instance and optionally clears all data.

```typescript
await instance.remove(true, 5000); // Clear data and wait 5 seconds
```

#### `enable(): Promise<void>`
Enables the instance and connects it.

```typescript
await instance.enable();
```

#### `disable(): Promise<void>`
Disables the instance and disconnects it.

```typescript
await instance.disable();
```

### Utility Methods

#### `getMessageDeliveryStatus(messageId: string): WAMessageDelivery | null`
Gets the delivery status of a specific message.

```typescript
const status = instance.getMessageDeliveryStatus('message-id');
console.log(status?.status); // 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'ERROR'
```

#### `recoverFromMacError(): Promise<boolean>`
Manually triggers MAC error recovery.

```typescript
const recovered = await instance.recoverFromMacError();
```

#### `recoverFromDecryptError(): Promise<boolean>`
Manually triggers decryption error recovery.

```typescript
const recovered = await instance.recoverFromDecryptError();
```

## 💬 Message Types

### Text Messages

```typescript
// Simple text
await instance.send('1234567890', 'Hello World!');

// Text with options
await instance.send('1234567890', {
  type: 'text',
  text: 'Hello World!'
});
```

### Media Messages

```typescript
// Image
await instance.send('1234567890', {
  type: 'image',
  data: imageBuffer,
  caption: 'Check this out!',
  mimetype: 'image/jpeg'
});

// Video
await instance.send('1234567890', {
  type: 'video',
  data: videoBuffer,
  caption: 'Amazing video!',
  mimetype: 'video/mp4'
});

// Audio
await instance.send('1234567890', {
  type: 'audio',
  data: audioBuffer,
  mimetype: 'audio/mpeg'
});

// Document
await instance.send('1234567890', {
  type: 'document',
  data: documentBuffer,
  fileName: 'document.pdf',
  mimetype: 'application/pdf',
  caption: 'Important document'
});
```

## 🎭 Event Handling

### Incoming Messages

```typescript
const instance = new WhatsappInstance('1234567890', {
  // ... other config
  onIncomingMessage: async (message, raw) => {
    console.log(`From: ${message.fromNumber}`);
    console.log(`Text: ${message.text}`);
    console.log(`Timestamp: ${raw.messageTimestamp}`);
    
    // Auto-reply example
    if (message.text.toLowerCase().includes('hello')) {
      await instance.send(message.fromNumber, 'Hi there! How can I help you?');
    }
  }
});
```

### Outgoing Messages

```typescript
onOutgoingMessage: async (message, raw, info, deliveryStatus) => {
  console.log(`Sent to: ${message.toNumber}`);
  console.log(`Message: ${message.text}`);
  console.log(`Message ID: ${info?.key?.id}`);
  
  if (deliveryStatus) {
    console.log(`Delivery Status: ${deliveryStatus.status}`);
    console.log(`Delivered At: ${deliveryStatus.deliveredAt}`);
  }
}
```

### Connection Events

```typescript
onReady: async (instance) => {
  console.log('Instance is ready and connected!');
  // Update UI, start services, etc.
},

onDisconnect: async (phoneNumber, reason) => {
  console.log(`Instance ${phoneNumber} disconnected: ${reason}`);
  // Handle disconnection, show reconnection status, etc.
},

onError: async (phoneNumber, error) => {
  console.error(`Instance ${phoneNumber} error:`, error);
  // Log error, notify admin, etc.
}
```

### Message Blocked Events

```typescript
onMessageBlocked: async (fromNumber, toNumber, blockReason) => {
  console.log(`Message blocked from ${fromNumber} to ${toNumber}: ${blockReason}`);
  
  switch (blockReason) {
    case 'USER_BLOCKED':
      console.log('User has blocked this number');
      break;
    case 'AUTH_FAILED':
      console.log('Authentication failed');
      break;
    case 'RATE_LIMITED':
      console.log('Rate limited');
      break;
  }
}
```

## 🚨 Error Handling

### Automatic Error Recovery

The service includes sophisticated error recovery mechanisms:

```typescript
// MAC/Decryption errors are automatically handled
// The service will attempt to:
// 1. Refresh the session
// 2. Reconnect without logout
// 3. Clear credentials and require re-registration (if needed)

// Manual recovery
const recovered = await instance.recoverFromMacError();
if (recovered) {
  console.log('Recovery successful!');
} else {
  console.log('Recovery failed, manual intervention required');
}
```

### Connection Error Handling

```typescript
onError: async (phoneNumber, error) => {
  const errorMessage = error?.message || '';
  
  if (errorMessage.includes('Bad MAC')) {
    console.log('MAC error detected, attempting recovery...');
    // Recovery is handled automatically
  } else if (errorMessage.includes('401')) {
    console.log('Authentication error - check credentials');
  } else if (errorMessage.includes('403')) {
    console.log('Forbidden - insufficient permissions');
  }
}
```

## 🔧 Advanced Features

### Message Delivery Tracking

```typescript
const result = await instance.send('1234567890', 'Hello!', {
  trackDelivery: true,
  waitForDelivery: true,
  waitForRead: false,
  deliveryTrackingTimeout: 30000,
  waitTimeout: 30000,
  throwOnDeliveryError: false,
  onDelivered: (messageId, toNumber, timestamp) => {
    console.log(`Message ${messageId} delivered to ${toNumber}`);
  },
  onRead: (messageId, toNumber, timestamp) => {
    console.log(`Message ${messageId} read by ${toNumber}`);
  }
});

// Check delivery status later
const status = instance.getMessageDeliveryStatus(result.key?.id);
console.log('Current status:', status?.status);
```

### Human-like Behavior

The service automatically implements human-like messaging behavior:

- **Typing Indicators**: Shows typing before sending messages
- **Typing Delays**: Calculates realistic typing time based on message length
- **Idle Time**: Adds random idle time after sending messages
- **Presence Updates**: Manages online/offline status

### Privacy Settings

Privacy settings are automatically configured:

```typescript
// Automatically set on connection:
// - Last seen: Invisible (nobody)
// - Online status: Match last seen
// - Group additions: Contacts only
```

### Retry Mechanisms

```typescript
await instance.send('1234567890', 'Hello!', {
  maxRetries: 3,
  retryDelay: 1000, // Base delay
  // Exponential backoff: 1s, 2s, 4s
});
```

## 📝 Examples

### Complete Bot Example

```typescript
import { WhatsappInstance } from './whatsapp-instance.service';

class WhatsAppBot {
  private instance: WhatsappInstance;
  
  constructor(phoneNumber: string) {
    this.instance = new WhatsappInstance(phoneNumber, {
      getAppAuth: this.getAuth.bind(this),
      updateAppAuth: this.updateAuth.bind(this),
      deleteAppAuth: this.deleteAuth.bind(this),
      updateAppKey: this.updateKey.bind(this),
      getAppKeys: this.getKeys.bind(this),
      
      onIncomingMessage: this.handleMessage.bind(this),
      onReady: this.onReady.bind(this),
      onDisconnect: this.onDisconnect.bind(this),
      onError: this.onError.bind(this),
      
      debugMode: ['info', 'error']
    });
  }
  
  async start() {
    try {
      await this.instance.connect();
      console.log('Bot started successfully!');
    } catch (error) {
      console.log('No existing session, registering new instance...');
      const qrCode = await this.instance.register();
      console.log('Scan QR code:', qrCode);
    }
  }
  
  private async handleMessage(message: any, raw: any) {
    const { fromNumber, text } = message;
    
    // Echo bot
    if (text.toLowerCase().includes('hello')) {
      await this.instance.send(fromNumber, 'Hello! How can I help you today?');
    } else if (text.toLowerCase().includes('time')) {
      const now = new Date().toLocaleString();
      await this.instance.send(fromNumber, `Current time: ${now}`);
    } else {
      await this.instance.send(fromNumber, `You said: "${text}"`);
    }
  }
  
  private async onReady(instance: WhatsappInstance) {
    console.log('Bot is ready and connected!');
  }
  
  private async onDisconnect(phoneNumber: string, reason: string) {
    console.log(`Bot disconnected: ${reason}`);
  }
  
  private async onError(phoneNumber: string, error: any) {
    console.error(`Bot error:`, error);
  }
  
  // Database methods (implement according to your database)
  private async getAuth(phoneNumber: string) {
    // Return stored auth data
  }
  
  private async updateAuth(phoneNumber: string, data: any) {
    // Update auth data
  }
  
  private async deleteAuth(phoneNumber: string) {
    // Delete auth data
  }
  
  private async updateKey(phoneNumber: string, keyType: string, keyId: string, data: any) {
    // Update encryption key
  }
  
  private async getKeys(phoneNumber: string) {
    // Get all encryption keys
  }
}

// Usage
const bot = new WhatsAppBot('1234567890');
bot.start();
```

### Media Sharing Bot

```typescript
class MediaBot extends WhatsAppBot {
  async sendImage(toNumber: string, imagePath: string, caption?: string) {
    const fs = require('fs');
    const imageBuffer = fs.readFileSync(imagePath);
    
    await this.instance.send(toNumber, {
      type: 'image',
      data: imageBuffer,
      caption: caption || 'Check this out!',
      mimetype: 'image/jpeg'
    });
  }
  
  async sendDocument(toNumber: string, filePath: string, fileName: string) {
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(filePath);
    
    await this.instance.send(toNumber, {
      type: 'document',
      data: fileBuffer,
      fileName: fileName,
      mimetype: 'application/pdf'
    });
  }
}
```

## 🔍 Troubleshooting

### Common Issues

#### 1. QR Code Not Appearing
```typescript
// Ensure you're handling the QR code properly
const qrCode = await instance.register();
// qrCode is a data URL, use it in an <img> tag or display it
```

#### 2. Connection Timeout
```typescript
// Check your internet connection and WhatsApp Web status
// The service will automatically retry with exponential backoff
```

#### 3. MAC/Decryption Errors
```typescript
// These are automatically handled, but you can manually trigger recovery
const recovered = await instance.recoverFromMacError();
```

#### 4. Messages Not Sending
```typescript
// Check if the instance is connected
if (!instance.connected) {
  await instance.connect();
}

// Check if the number is blocked
// The service will automatically detect and report blocked numbers
```

#### 5. Session Not Persisting
```typescript
// Ensure your database callbacks are working correctly
// Check that getAppAuth and updateAppAuth are properly implemented
```

### Debug Mode

Enable debug mode for detailed logging:

```typescript
const instance = new WhatsappInstance('1234567890', {
  // ... other config
  debugMode: ['info', 'error', 'warn', 'debug'] // or just true for all
});
```

### Health Monitoring

The service includes built-in health monitoring:

- **Keep-alive**: Sends presence updates every 30 seconds
- **Health checks**: Monitors connection health every 60 seconds
- **Automatic reconnection**: Attempts to reconnect on connection loss

## 📄 License

This service is built on top of [Baileys](https://github.com/WhiskeySockets/Baileys) and follows the same licensing terms.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📞 Support

For support and questions:
- Check the [Baileys documentation](https://github.com/WhiskeySockets/Baileys)
- Review the troubleshooting section above
- Open an issue in the repository

---

**Note**: This service is designed for legitimate use cases. Please ensure compliance with WhatsApp's Terms of Service and applicable laws in your jurisdiction.
