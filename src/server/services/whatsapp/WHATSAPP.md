# WhatsApp Service Documentation

## Overview

The `WhatsappService` is a comprehensive WhatsApp management system that provides multi-instance support, message handling, authentication management, and advanced features like warm-up capabilities. It's built on top of the Baileys library and provides a high-level abstraction for managing multiple WhatsApp instances.

## Core Components

### WhatsappService
The main service class that orchestrates multiple WhatsApp instances and provides centralized management.

### Extended Services
- **WhatsappInstance**: Individual WhatsApp instance management
- **WhatsappWarmService**: Extended service with warm-up capabilities for account safety
- **WhatsappAiService**: AI-powered conversation handling and persona management

## Key Features

### 🔧 Multi-Instance Management
- Manages multiple WhatsApp instances simultaneously
- Automatic load balancing across available instances
- Instance health monitoring and connection management

### 📱 Authentication & Session Management
- Secure credential storage and retrieval
- QR code generation for new instance registration
- Automatic session restoration and management

### 💬 Message Handling
- Incoming and outgoing message processing
- Message delivery tracking and status monitoring
- Support for various content types (text, images, videos, documents, audio)

### 🛡️ Error Handling & Recovery
- Comprehensive error handling with graceful degradation
- Automatic retry mechanisms for failed operations
- Noise suppression for cleaner logs

### 🔄 Load Balancing
- Intelligent instance selection for message sending
- Round-robin distribution to prevent overuse
- Warm-up status consideration for instance selection

## Usage

### Basic Setup

```typescript
import { WhatsappService } from './whatsapp.service';

const whatsappService = new WhatsappService({
  // Authentication callbacks
  getAppAuth: async (phoneNumber: string) => {
    // Return stored authentication data
  },
  updateAppAuth: async (phoneNumber: string, data: Partial<WAAppAuth>) => {
    // Update authentication data
  },
  deleteAppAuth: async (phoneNumber: string) => {
    // Delete authentication data
  },
  listAppAuth: async () => {
    // Return list of all authenticated instances
  },
  
  // App key management
  getAppKeys: async (phoneNumber: string) => {
    // Return stored app keys
  },
  updateAppKey: async (phoneNumber: string, keyType: string, keyId: string, data: any) => {
    // Update app keys
  },
  
  // Message callbacks
  onIncomingMessage: async (message, raw) => {
    // Handle incoming messages
  },
  onOutgoingMessage: async (message, raw, info, deliveryStatus) => {
    // Handle outgoing messages
  },
  
  // Debug mode
  debugMode: ['info', 'warn', 'error']
});
```

### Adding New Instances

```typescript
// Generate QR code for new instance
const qrCode = await whatsappService.addInstanceQR('+1234567890');
console.log('QR Code:', qrCode);
```

### Sending Messages

```typescript
// Send message using specific instance
await whatsappService.sendMessage('+1234567890', '+0987654321', 'Hello World!');

// Send message using auto-selected instance
await whatsappService.sendMessage(null, '+0987654321', 'Hello World!');

// Send with options
await whatsappService.sendMessage(null, '+0987654321', 'Hello World!', {
  trackDelivery: true,
  waitForDelivery: true,
  waitTimeout: 30000
});
```

### Event Handling

```typescript
// Listen for incoming messages
whatsappService.onMessage(async (message, raw) => {
  console.log('Received:', message.text);
});

// Listen for instance updates
whatsappService.onUpdate(async (state) => {
  console.log('Instance updated:', state);
});

// Listen for ready events
whatsappService.onReady(async () => {
  console.log('All instances ready');
});

// Listen for registration events
whatsappService.onRegister(async (phoneNumber) => {
  console.log('New instance registered:', phoneNumber);
});
```

### Instance Management

```typescript
// Get specific instance
const instance = whatsappService.getInstance('+1234567890');

// Get all instances
const allInstances = whatsappService.getAllInstances();

// Get connected instances only
const connectedInstances = whatsappService.getAllInstances({ activeFlag: true });

// List instance numbers with filters
const numbers = whatsappService.listInstanceNumbers({
  onlyConnectedFlag: true,
  hasWarmedUp: true,
  shuffleFlag: true
});
```

## Configuration Options

### WAServiceConfig
- `getAppAuth`: Function to retrieve authentication data
- `updateAppAuth`: Function to update authentication data
- `deleteAppAuth`: Function to delete authentication data
- `listAppAuth`: Function to list all authenticated instances
- `getAppKeys`: Function to retrieve app keys
- `updateAppKey`: Function to update app keys
- `onIncomingMessage`: Callback for incoming messages
- `onOutgoingMessage`: Callback for outgoing messages
- `onUpdate`: Callback for instance updates
- `debugMode`: Debug logging configuration

### Message Content Types
- **Text**: Simple string or `{ type: 'text', text: string }`
- **Image**: `{ type: 'image', data: Buffer, caption?: string, mimetype?: string }`
- **Video**: `{ type: 'video', data: Buffer, caption?: string, mimetype?: string }`
- **Audio**: `{ type: 'audio', data: Buffer, caption?: string, mimetype?: string }`
- **Document**: `{ type: 'document', data: Buffer, fileName: string, mimetype?: string, caption?: string }`

### Send Options
- `maxRetries`: Maximum retry attempts for failed messages
- `retryDelay`: Delay between retry attempts
- `trackDelivery`: Enable delivery status tracking
- `waitForDelivery`: Wait for delivery confirmation
- `waitForRead`: Wait for read confirmation
- `waitTimeout`: Timeout for delivery/read confirmation
- `throwOnDeliveryError`: Throw error on delivery failure

## Error Handling

The service includes comprehensive error handling:
- **Connection Errors**: Automatic retry with exponential backoff
- **Authentication Errors**: Graceful handling of auth failures
- **Message Errors**: Retry mechanisms for failed message delivery
- **Critical Errors**: Proper cleanup and graceful shutdown

## Performance Features

### Load Balancing
- Intelligent instance selection based on availability and warm-up status
- Round-robin distribution to prevent instance overuse
- Automatic fallback to available instances

### Noise Suppression
- Filters out Baileys library noise from console output
- Configurable debug levels for cleaner logging
- Structured logging with timestamps

### Memory Management
- Efficient instance storage using Map
- Automatic cleanup on service shutdown
- LRU-based caching for frequently accessed data

## Security Features

- Secure credential storage through callback functions
- Session management with automatic restoration
- Privacy settings management
- Blocked contact tracking

## Extended Services

### WhatsappWarmService
Extends the base service with warm-up capabilities:
- Gradual message volume increase
- Conversation simulation
- Account safety features
- Daily message limits

### WhatsappAiService
Provides AI-powered features:
- Persona-based conversations
- Multi-language support
- Intelligent response generation
- Conversation context management

## Best Practices

1. **Instance Management**: Always check instance status before sending messages
2. **Error Handling**: Implement proper error handling for all callbacks
3. **Resource Cleanup**: Ensure proper cleanup on application shutdown
4. **Rate Limiting**: Respect WhatsApp's rate limits and use warm-up features
5. **Monitoring**: Monitor instance health and message delivery status
6. **Security**: Store credentials securely and implement proper access controls

## Troubleshooting

### Common Issues
- **Connection Failures**: Check network connectivity and credentials
- **Message Delivery**: Verify recipient numbers and message content
- **Authentication Errors**: Ensure proper credential storage and retrieval
- **Instance Overload**: Use load balancing and warm-up features

### Debug Mode
Enable debug mode to get detailed logging:
```typescript
debugMode: ['info', 'warn', 'error', 'debug']
```

This service provides a robust foundation for WhatsApp automation while maintaining account safety and performance optimization.
