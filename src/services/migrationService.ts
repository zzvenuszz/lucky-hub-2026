
import mongoose from 'mongoose';
import { logger } from '../utils/logger.ts';
import { cryptoUtils } from '../utils/cryptoUtils.ts';

/**
 * Service to handle database migrations.
 */
export const migrationService = {
  /**
   * Populates avatarHash for users who don't have it.
   */
  runAvatarHashMigration: async (UserModel: mongoose.Model<any>) => {
    try {
      logger.info('MIGRATION', 'Checking for users without avatarHash...');
      const usersToUpdate = await UserModel.find({ 
        avatar: { $exists: true, $ne: '' }, 
        avatarHash: { $exists: false } 
      });

      if (usersToUpdate.length > 0) {
        logger.info('MIGRATION', `Found ${usersToUpdate.length} users needing avatarHash. Updating...`);
        for (const user of usersToUpdate) {
          const hash = cryptoUtils.generateAvatarHash(user.avatar);
          await UserModel.updateOne({ _id: user._id }, { $set: { avatarHash: hash } });
          logger.info('MIGRATION', `Updated user: @${user.username}`);
        }
        logger.info('MIGRATION', `Successfully updated ${usersToUpdate.length} users.`);
      } else {
        logger.info('MIGRATION', 'All users are up to date.');
      }
    } catch (err: any) {
      logger.error('MIGRATION', `Error during avatarHash migration: ${err.message}`);
    }
  }
};
