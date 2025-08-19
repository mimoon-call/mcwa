import { MongoService } from '@server/services/database/mongo.service';
import { Auth } from '@server/api/auth/auth.db';
import authService from '@server/api/auth/auth.service';
import { ADD_USER } from '@server/api/auth/auth.map';
import type { AddUserReq } from '@server/api/auth/auth.type';

// Sample users data
const sampleUsers: AddUserReq[] = [
  {
    firstName: 'Ziv',
    lastName: 'Tal',
    email: 'zivtal83@gmail.com',
    password: 'KuKu123!',
  },
  {
    firstName: 'Nimi',
    lastName: 'Mimoon',
    email: 'nimi@gmail.com',
    password: 'Nimimoon3321',
  },
];

async function seedUsers() {
  try {
    console.log('🌱 Starting database seeding...');

    // Connect to database
    await MongoService.connect();
    console.log('✅ Connected to database');

    // Clear existing users (optional - remove if you want to keep existing data)
    await Auth.deleteMany({});
    console.log('🗑️  Cleared existing users');

    // Add sample users
    for (const userData of sampleUsers) {
      try {
        await authService[ADD_USER](userData);
        console.log(`✅ Added user: ${userData.email}`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate key')) {
          console.log(`⚠️  User already exists: ${userData.email}`);
        } else {
          console.error(`❌ Failed to add user ${userData.email}:`, error);
        }
      }
    }

    console.log('🎉 Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await MongoService.disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run the seed function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedUsers();
}

export default seedUsers;
