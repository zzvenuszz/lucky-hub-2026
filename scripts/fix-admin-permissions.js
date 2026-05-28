// Script: Tạo group "temp" với đầy đủ quyền và gán cho user "admin"
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb+srv://vnminenetworkgame_db_user:vsKaIcSSJhfiJYLn@luckyhub.myqla9g.mongodb.net/lucky_hub?retryWrites=true&w=majority';

const ALL_PERMISSIONS = [
  'metrics:view:own', 'metrics:create:own', 'metrics:update:own',
  'metrics:view:any', 'metrics:create:any', 'metrics:update:any', 'metrics:delete:any',
  'users:view', 'users:create', 'users:update', 'users:delete',
  'ai:manage', 'ai:view',
  'groups:manage',
  'system:config', 'system:logs',
  'admin:panel',
  'posts:view', 'posts:create', 'posts:update:own', 'posts:update:any', 'posts:delete:own', 'posts:delete:any',
  'chat:send', 'chat:view',
  'coach:access',
  'ndd:manage', 'ndd:system',
];

async function main() {
  await mongoose.connect(uri);
  console.log('[DB] ✅ Connected to MongoDB');

  // Kiểm tra user admin
  const adminUser = await mongoose.connection.db.collection('users').findOne({ username: 'admin' });
  if (!adminUser) {
    console.error('[ERROR] ❌ User "admin" không tồn tại trong database!');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`[USER] ✅ Found admin: ${adminUser.fullName} (${adminUser._id})`);

  // Kiểm tra group "temp" đã tồn tại chưa
  let tempGroup = await mongoose.connection.db.collection('groups').findOne({ name: 'temp' });

  if (tempGroup) {
    console.log('[GROUP] ℹ️ Group "temp" đã tồn tại. Cập nhật permissions...');
    await mongoose.connection.db.collection('groups').updateOne(
      { _id: tempGroup._id },
      { $set: { permissions: ALL_PERMISSIONS, isActive: true } }
    );
  } else {
    console.log('[GROUP] 🔄 Tạo group "temp" mới...');
    const result = await mongoose.connection.db.collection('groups').insertOne({
      name: 'temp',
      description: 'Group tạm với đầy đủ quyền',
      members: [],
      permissions: ALL_PERMISSIONS,
      createdBy: adminUser._id,
      isActive: true,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    tempGroup = result;
    console.log(`[GROUP] ✅ Created group "temp" (${result.insertedId})`);
  }

  // Gán groupId cho user admin
  await mongoose.connection.db.collection('users').updateOne(
    { _id: adminUser._id },
    { $set: { groupId: tempGroup._id || tempGroup.insertedId } }
  );
  console.log(`[USER] ✅ Gán group "temp" cho admin thành công!`);

  await mongoose.disconnect();
  console.log('[DONE] ✅ Hoàn tất!');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});