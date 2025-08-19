import mongoose from 'mongoose';

export class DatabaseService {
  private static instance: DatabaseService;
  private isConnected = false;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }

    return DatabaseService.instance;
  }

  private async retryAsyncFunction<T>(fn: () => Promise<T | null>, maxRetries: number = 3, attempt: number = 0): Promise<T | null> {
    if (attempt >= maxRetries) return null;

    try {
      return await fn();
    } catch (_err: unknown) {
      return this.retryAsyncFunction(fn, maxRetries, attempt + 1);
    }
  }

  async reconnect(): Promise<void> {
    await this.retryAsyncFunction<void>(async (_attempt?: number) => {
      console.log('MongoDB reconnecting ...');

      await this.connect();

      if (mongoose.connection.readyState !== 1) {
        console.log('getAuthKey', 'Waiting for database connection...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (mongoose.connection.readyState !== 1) {
        throw new Error('Database connection ready');
      }
    });
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      console.log('MongoDB already connected');
      return;
    }

    try {
      const mongoUri = process.env.DB_RUI || 'mongodb://localhost:27017/mimoon-call-whatsapp';

      await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
      });

      this.isConnected = true;
      console.log('✅ MongoDB connected successfully');

      mongoose.connection.on('error', (error) => {
        console.error('MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', async () => {
        console.log('MongoDB disconnected');
        this.isConnected = false;

        await this.reconnect();
      });

      mongoose.connection.on('reconnected', () => {
        console.log('MongoDB reconnected');
        this.isConnected = true;
      });
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('MongoDB disconnected');
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  isConnectedToDatabase(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }
}
