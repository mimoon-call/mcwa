# WhatsApp Service Documentation

## Overview

The `WhatsappService` is a comprehensive WhatsApp management system that provides multi-instance support, message handling, authentication management, and load balancing capabilities. It's built on top of the Baileys library and provides a high-level abstraction for managing multiple WhatsApp instances with automatic connection management and error handling.

## Core Components

### WhatsappService
The main service class that orchestrates multiple WhatsApp instances and provides centralized management with the following key responsibilities:
- Multi-instance management and load balancing
- Authentication and session management
- Message routing and delivery tracking
- Error handling and graceful shutdown
- Noise suppression and logging

### WhatsappInstance
Individual WhatsApp instance management handled internally by the service. Each instance manages its own connection, authentication, and message handling.

## Key Features

### 🔧 Multi-Instance Management
- Manages multiple WhatsApp instances simultaneously using Map-based storage
- Automatic instance creation and connection management
- Staggered connection attempts to prevent conflicts (2-second delays)
- Instance health monitoring through connection status tracking

### 📱 Authentication & Session Management
- Secure credential storage and retrieval through callback functions
- QR code generation for new instance registration via `addInstanceQR()`
- Automatic session restoration on service initialization
- Support for app key management and updates

### 💬 Message Handling
- Incoming and outgoing message processing with callback support
- Message delivery tracking with configurable timeouts
- Support for various content types (text, images, videos, documents, audio, PTT)
- Internal message flagging to distinguish internal vs external messages
- Automatic message read marking for incoming messages

### 🛡️ Error Handling & Recovery
- Comprehensive error handling with graceful degradation
- Automatic retry mechanisms for failed message operations (3 retries with 1s delay)
- Noise suppression for cleaner logs (filters Baileys library noise)
- Graceful shutdown handling for SIGINT and SIGTERM signals
- Uncaught exception and unhandled rejection handling

### 🔄 Load Balancing
- Intelligent instance selection based on connection status and warm-up state
- Round-robin distribution using `lastUsedNumbers` tracking
- Automatic fallback to available instances when preferred instances are unavailable
- Support for filtering instances by connection status, active flag, and warm-up status

## Usage

### Basic Setup

```typescript
import { WhatsappService } from './whatsapp.service';
import type { WAServiceConfig, WAAppAuth } from './whatsapp.type';

const whatsappService = new WhatsappService({
  // Required authentication callbacks
  getAppAuth: async (phoneNumber: string): Promise<WAAppAuth | null> => {
    // Return stored authentication data for the phone number
    return await getStoredAuth(phoneNumber);
  },
  updateAppAuth: async (phoneNumber: string, data: Partial<WAAppAuth>) => {
    // Update authentication data for the phone number
    return await updateStoredAuth(phoneNumber, data);
  },
  deleteAppAuth: async (phoneNumber: string) => {
    // Delete authentication data for the phone number
    await deleteStoredAuth(phoneNumber);
  },
  listAppAuth: async (): Promise<WAAppAuth[]> => {
    // Return list of all authenticated instances
    return await getAllStoredAuths();
  },
  
  // Required app key management
  getAppKeys: async (phoneNumber: string) => {
    // Return stored app keys for the phone number
    return await getStoredKeys(phoneNumber);
  },
  updateAppKey: async (phoneNumber: string, keyType: string, keyId: string, data: any) => {
    // Update app keys for the phone number
    await updateStoredKey(phoneNumber, keyType, keyId, data);
  },
  
  // Optional message callbacks
  onIncomingMessage: async (message, raw, messageId) => {
    // Handle incoming messages
    console.log('Received message:', message.text);
  },
  onOutgoingMessage: async (message, raw, deliveryStatus) => {
    // Handle outgoing messages
    console.log('Sent message:', message.text);
  },
  onSendingMessage: async (instance, toNumber) => {
    // Called before sending a message
    console.log('Sending message to:', toNumber);
  },
  onMessageUpdate: async (messageId, deliveryStatus) => {
    // Handle message status updates
    console.log('Message status update:', deliveryStatus.status);
  },
  onUpdate: async (state) => {
    // Handle instance state updates
    console.log('Instance updated:', state);
  },
  onRegistered: async (phoneNumber) => {
    // Handle new instance registration
    console.log('New instance registered:', phoneNumber);
  },
  onDisconnect: async (phoneNumber, reason) => {
    // Handle instance disconnection
    console.log('Instance disconnected:', phoneNumber, reason);
  },
  
  // Debug mode configuration
  debugMode: ['info', 'warn', 'error'] // or true for all logs, or specific level
});
```

### Adding New Instances

```typescript
// Generate QR code for new instance
try {
  const qrCode = await whatsappService.addInstanceQR('+1234567890');
  console.log('QR Code:', qrCode);
} catch (error) {
  console.error('Failed to add instance:', error.message);
}
```

### Sending Messages

```typescript
// Send text message using specific instance
await whatsappService.sendMessage('+1234567890', '+0987654321', 'Hello World!');

// Send text message using auto-selected instance
await whatsappService.sendMessage(null, '+0987654321', 'Hello World!');

// Send structured text message
await whatsappService.sendMessage(null, '+0987654321', { 
  type: 'text', 
  text: 'Hello World!' 
});

// Send image message
await whatsappService.sendMessage(null, '+0987654321', {
  type: 'image',
  data: imageBuffer,
  caption: 'Check out this image!',
  mimetype: 'image/jpeg'
});

// Send with custom options
await whatsappService.sendMessage(null, '+0987654321', 'Hello World!', {
  trackDelivery: true,
  waitForDelivery: true,
  waitForRead: false,
  waitTimeout: 30000,
  throwOnDeliveryError: false,
  maxRetries: 3,
  retryDelay: 1000
});
```

### Event Handling

```typescript
// Listen for incoming messages (global callback)
whatsappService.onMessage(async (message, raw, messageId) => {
  console.log('Received:', message.text, 'from:', message.fromNumber);
});

// Listen for instance updates (global callback)
whatsappService.onUpdate(async (state) => {
  console.log('Instance updated:', state);
});

// Listen for ready events (global callback)
whatsappService.onReady(async () => {
  console.log('All instances ready');
});

// Listen for registration events (global callback)
whatsappService.onRegister(async (phoneNumber) => {
  console.log('New instance registered:', phoneNumber);
});

// Listen for disconnection events (global callback)
whatsappService.onDisconnect(async (phoneNumber, reason) => {
  console.log('Instance disconnected:', phoneNumber, 'reason:', reason);
});
```

### Instance Management

```typescript
// Get specific instance
const instance = whatsappService.getInstance('+1234567890');
if (instance) {
  console.log('Instance found:', instance.phoneNumber);
}

// Get all instances
const allInstances = whatsappService.getAllInstances();

// Get connected instances only
const connectedInstances = whatsappService.getAllInstances({ activeFlag: true });

// Get shuffled instances
const shuffledInstances = whatsappService.getAllInstances({ shuffleFlag: true });

// List instance numbers with filters
const connectedNumbers = whatsappService.listInstanceNumbers({
  onlyConnectedFlag: true,
  activeFlag: true
});

const warmedUpNumbers = whatsappService.listInstanceNumbers({
  onlyConnectedFlag: true,
  hasWarmedUp: true,
  shuffleFlag: true
});

// Cleanup service (call on shutdown)
whatsappService.cleanup();
```

## Configuration Options

### WAServiceConfig
The service configuration extends `WAInstanceConfig` with additional requirements:

#### Required Callbacks
- `getAppAuth(phoneNumber: string)`: Function to retrieve authentication data for a specific phone number
- `updateAppAuth(phoneNumber: string, data: Partial<WAAppAuth>)`: Function to update authentication data
- `deleteAppAuth(phoneNumber: string)`: Function to delete authentication data for a phone number
- `listAppAuth()`: Function to list all authenticated instances
- `getAppKeys(phoneNumber: string)`: Function to retrieve app keys for a phone number
- `updateAppKey(phoneNumber: string, keyType: string, keyId: string, data: any)`: Function to update app keys

#### Optional Callbacks
- `onIncomingMessage(message, raw, messageId)`: Callback for incoming messages
- `onOutgoingMessage(message, raw, deliveryStatus)`: Callback for outgoing messages
- `onSendingMessage(instance, toNumber)`: Callback called before sending a message
- `onMessageUpdate(messageId, deliveryStatus)`: Callback for message status updates
- `onUpdate(state)`: Callback for instance state updates
- `onRegistered(phoneNumber)`: Callback for new instance registration
- `onDisconnect(phoneNumber, reason)`: Callback for instance disconnection

#### Debug Configuration
- `debugMode`: Debug logging configuration
  - `true`: Enable all debug logs
  - `'error' | 'warn' | 'info' | 'debug'`: Enable specific log level
  - `['error', 'warn', 'info', 'debug']`: Enable multiple log levels

### Message Content Types (WAOutgoingContent)
The service supports various message content types:

#### Text Messages
```typescript
// Simple string
'Hello World!'

// Structured text
{ type: 'text', text: 'Hello World!' }
```

#### Media Messages
```typescript
// Image message
{
  type: 'image',
  data: Buffer, // Image buffer
  caption?: string, // Optional caption
  mimetype?: string // e.g., 'image/jpeg', 'image/png'
}

// Video message
{
  type: 'video',
  data: Buffer, // Video buffer
  caption?: string, // Optional caption
  mimetype?: string // e.g., 'video/mp4'
}

// Audio message (voice note)
{
  type: 'audio',
  data: Buffer, // Audio buffer
  caption?: string, // Optional caption
  mimetype?: string, // e.g., 'audio/ogg'
  ptt?: boolean, // Push-to-talk (voice note)
  seconds?: number, // Duration in seconds
  duration?: number, // Alternative duration field
  text?: string // Optional text transcription
}

// Document message
{
  type: 'document',
  data: Buffer, // Document buffer
  fileName: string, // Required filename
  mimetype?: string, // e.g., 'application/pdf'
  caption?: string // Optional caption
}
```

### Send Options (WASendOptions)
The service provides comprehensive options for message sending:

#### Retry Configuration
- `maxRetries?: number`: Maximum retry attempts for failed messages (default: 3)
- `retryDelay?: number`: Delay between retry attempts in milliseconds (default: 1000)

#### Callback Functions
- `onSuccess?: (...arg: any[]) => void`: Called when message is sent successfully
- `onFailure?: (error: any, attempts: number) => void`: Called when message fails after all retries
- `onUpdate?: (messageId: string, deliveryStatus: WAMessageDelivery) => void`: Called for message status updates

#### Delivery Tracking
- `trackDelivery?: boolean`: Enable delivery status tracking (default: true)
- `deliveryTrackingTimeout?: number`: Timeout for delivery tracking in milliseconds (default: 30000)

#### Wait Options
- `waitForDelivery?: boolean`: Wait for DELIVERED status before resolving (default: true)
- `waitForRead?: boolean`: Wait for READ status before resolving (implies waitForDelivery)
- `waitTimeout?: number`: Timeout for waiting for delivery confirmation in milliseconds (default: 30000)

#### Error Handling
- `throwOnDeliveryError?: boolean`: Throw error if delivery fails (default: false)

## API Methods

### Instance Management
- `addInstanceQR(phoneNumber: string): Promise<string>`: Generate QR code for new instance registration
- `getInstance(phoneNumber: string): WAInstance<T> | undefined`: Get specific instance by phone number
- `getAllInstances(options?: { shuffleFlag?: boolean; activeFlag?: boolean }): WAInstance<T>[]`: Get all instances with optional filtering
- `listInstanceNumbers(options?: { onlyConnectedFlag?: boolean; activeFlag?: boolean; hasWarmedUp?: boolean; shuffleFlag?: boolean }): string[]`: List instance phone numbers with filtering
- `cleanup(): void`: Clean up all instances (call on shutdown)

### Message Operations
- `sendMessage(fromNumber: string | null, toNumber: string, content: WAOutgoingContent, options?: WASendOptions): Promise<{ ...result, instanceNumber: string }>`: Send message using specific or auto-selected instance

### Event Listeners
- `onMessage(callback: WAMessageIncomingCallback): void`: Add global incoming message listener
- `onUpdate(callback: (state: Partial<WAAppAuth<T>>) => Promise<unknown> | unknown): void`: Add global instance update listener
- `onReady(callback: () => Promise<void> | void): void`: Add global ready event listener
- `onDisconnect(callback: () => void): void`: Add global disconnection listener
- `onRegister(callback: (phoneNumber: string) => Promise<void> | void): void`: Add global registration listener

## Error Handling

The service includes comprehensive error handling:

### Connection Management
- **Staggered Connections**: 2-second delays between connection attempts to prevent conflicts
- **Graceful Shutdown**: Proper cleanup on SIGINT and SIGTERM signals
- **Connection Recovery**: Automatic retry mechanisms for failed connections

### Message Operations
- **Retry Logic**: 3 retry attempts with 1-second delays for failed message operations
- **Delivery Tracking**: Configurable timeout and error handling for message delivery
- **Error Propagation**: Proper error handling with detailed error messages

### System Errors
- **Uncaught Exceptions**: Graceful handling with recovery attempts for non-critical errors
- **Unhandled Rejections**: Logging and continuation for non-critical promise rejections
- **Critical Error Detection**: Automatic shutdown for critical errors (ECONNREFUSED, EADDRINUSE, ENOTFOUND)

### Noise Suppression
- **Baileys Noise Filtering**: Automatic filtering of common Baileys library noise messages
- **Structured Logging**: Timestamped logs with configurable debug levels
- **Clean Console Output**: Suppressed noise patterns for better debugging experience

## Performance Features

### Load Balancing
- **Intelligent Selection**: Instance selection based on connection status and warm-up state
- **Round-Robin Distribution**: `lastUsedNumbers` tracking to prevent instance overuse
- **Automatic Fallback**: Fallback to available instances when preferred instances are unavailable
- **Instance Filtering**: Support for filtering by connection status, active flag, and warm-up status

### Memory Management
- **Efficient Storage**: Map-based instance storage for O(1) access
- **Automatic Cleanup**: Instance cleanup on service shutdown
- **Connection Staggering**: Prevents memory spikes during bulk connections

## Security Features

- **Secure Credential Storage**: All authentication data handled through callback functions
- **Session Management**: Automatic session restoration and management
- **Internal Message Flagging**: Distinguishes internal vs external messages
- **Privacy Controls**: Support for privacy settings and blocked contact tracking

## Best Practices

1. **Instance Management**: Always check instance status before sending messages using `getInstance()` and verify connection status
2. **Error Handling**: Implement proper error handling for all callbacks and use try-catch blocks for async operations
3. **Resource Cleanup**: Always call `cleanup()` on application shutdown to properly dispose of instances
4. **Load Balancing**: Use `null` as `fromNumber` to leverage automatic load balancing
5. **Message Options**: Configure appropriate `waitTimeout` and retry settings based on your use case
6. **Debug Logging**: Use appropriate debug levels to monitor service health without overwhelming logs
7. **Security**: Store credentials securely through the provided callback functions
8. **Connection Staggering**: The service automatically handles connection staggering, but avoid creating too many instances simultaneously

## Troubleshooting

### Common Issues

#### Connection Failures
- **Symptom**: Instances fail to connect or disconnect frequently
- **Solution**: Check network connectivity, verify credentials, and ensure proper callback implementations
- **Debug**: Enable debug mode to see connection attempt logs

#### Message Delivery Issues
- **Symptom**: Messages not being delivered or taking too long
- **Solution**: Verify recipient numbers, check message content format, and adjust `waitTimeout` settings
- **Debug**: Use `trackDelivery: true` and monitor delivery status callbacks

#### Authentication Errors
- **Symptom**: QR code generation fails or instances can't authenticate
- **Solution**: Ensure proper implementation of `getAppAuth`, `updateAppAuth`, and `listAppAuth` callbacks
- **Debug**: Check that authentication data is being stored and retrieved correctly

#### Instance Selection Issues
- **Symptom**: Messages always use the same instance or fail to find available instances
- **Solution**: Check instance connection status, verify warm-up state, and ensure proper filtering options
- **Debug**: Use `listInstanceNumbers()` to verify available instances

### Debug Mode
Enable debug mode to get detailed logging:
```typescript
// Enable all debug logs
debugMode: true

// Enable specific log levels
debugMode: ['info', 'warn', 'error', 'debug']

// Enable single log level
debugMode: 'error'
```

### Service Health Monitoring
```typescript
// Check service health
const connectedInstances = whatsappService.getAllInstances({ activeFlag: true });
console.log(`Connected instances: ${connectedInstances.length}`);

// Monitor instance status
const instanceNumbers = whatsappService.listInstanceNumbers({ onlyConnectedFlag: true });
console.log(`Available instances: ${instanceNumbers.join(', ')}`);
```

This service provides a robust foundation for WhatsApp automation with comprehensive error handling, load balancing, and performance optimization features.
