import type { WAPersona, WAServiceConfig } from './whatsapp.type';
import type { WAAppAuth, WAAppKey } from './whatsapp-instance.type';
import { WhatsAppAuth, WhatsAppKey } from './whatsapp.db';
import mongoose from 'mongoose';
import { WhatsappAiService } from './whatsapp.ai';
import getLocalTime from '../../helpers/get-local-time';

const getAppAuth = async <T extends object>(phoneNumber: string): Promise<WAAppAuth<T> | null> => {
  // Ensure mongoose is connected before querying
  if (mongoose.connection.readyState !== 1) {
    console.log('getAuthKey', 'Waiting for database connection...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return ((await WhatsAppAuth.findOne({ phoneNumber }))?.toObject() as unknown as WAAppAuth<T>) || null;
};

const updateAppAuth = async <T extends object>(phoneNumber: string, data: Partial<WAAppAuth<T>>): Promise<WAAppAuth<T>> => {
  const now = getLocalTime();

  // 1) do the immediate update and return it
  const result = await WhatsAppAuth.findOneAndUpdate(
    { phoneNumber },
    { $set: { ...data, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean<WAAppAuth<T>>();

  const hasNoPersona = !(result as any).name;

  // 2) background enrichment (don't await)
  if (hasNoPersona) {
    setImmediate(async () => {
      try {
        const ai = new WhatsappAiService();
        const aiData = await ai.generatePersona(result.phoneNumber);

        await WhatsAppAuth.updateOne({ phoneNumber, name: { $exists: false } }, { $set: { ...aiData, updatedAt: now } }, { writeConcern: { w: 1 } });
      } catch (error) {
        console.error('updateAppAuth', 'failed write persona profile:', error);
      }
    });
  }

  return result;
};

const deleteAppAuth = async (phoneNumber: string): Promise<void> => {
  try {
    // Delete auth data
    await WhatsAppAuth.deleteOne({ phoneNumber });
    // Delete keys
    await WhatsAppKey.deleteMany({ phoneNumber });
  } catch (error) {
    console.error('deleteAppAuth', 'Error deleting auth data:', error);
  }
};

const listAppAuth = async <T extends object>(): Promise<WAAppAuth<T>[]> => {
  try {
    // Ensure mongoose is connected before querying
    if ((mongoose.connection.readyState as number) !== 1) {
      console.log('listAppAuth', 'Database not connected, waiting...');
      // Wait for database connection with timeout
      let attempts = 0;
      const maxAttempts = 10;
      while ((mongoose.connection.readyState as number) !== 1 && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
        console.log('listAppAuth', `Database connection attempt ${attempts}/${maxAttempts}`);
      }

      if ((mongoose.connection.readyState as number) !== 1) {
        console.error('listAppAuth', 'Database connection timeout, returning empty list');
        return [];
      }
    }

    console.log('listAppAuth', 'Database connected, querying auth states...');
    return await WhatsAppAuth.find({}, { _id: 0 });
  } catch (error) {
    console.error('listAppAuth', 'Error listing auth states:', error);
    return [];
  }
};

const updateAppKey = async <T extends object>(phoneNumber: string, keyType: string, keyId: string, data: Partial<WAAppAuth<T>>): Promise<void> => {
  const now = getLocalTime();

  // Ensure mongoose is connected before querying
  if (mongoose.connection.readyState !== 1) {
    console.log('updateAppKey', 'Waiting for database connection...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await WhatsAppKey.findOneAndUpdate(
    { phoneNumber, keyType, keyId },
    {
      $set: { ...data, phoneNumber, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, new: true }
  );
};

const getAppKeys = async (phoneNumber: string): Promise<WAAppKey[]> => {
  return WhatsAppKey.find({ phoneNumber });
};

export const whatsappConfig: WAServiceConfig<WAPersona> = {
  getAppAuth,
  updateAppAuth,
  deleteAppAuth,
  listAppAuth,
  updateAppKey,
  getAppKeys,
};
