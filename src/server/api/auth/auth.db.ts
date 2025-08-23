import { MongoService } from '@server/services/database/mongo.service';
import { AuthUser } from '@server/api/auth/auth.type';
import getLocalTime from '@server/helpers/get-local-time';

const setModifiedAndCreationDate = function (doc: any) {
  const now = getLocalTime();

  if (doc.isNew) {
    doc.createdAt = now;
  }

  // Only set updatedAt if the field exists in the schema
  if (doc.schema.paths.updatedAt) {
    doc.updatedAt = now;
  }
};

export const Auth = new MongoService<AuthUser>(
  'WhatsappUsers',
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    hashPassword: { type: String, required: true },
    email: { type: String, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date },
  },
  { timestamps: false },
  {
    indexes: [{ fields: { email: 1 }, options: { unique: true, name: 'email_unique' } }],
    preSave: setModifiedAndCreationDate,
  }
);
