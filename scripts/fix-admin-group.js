// Script: Gán admin về group Administrator, kiểm tra permissions
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb+srv://vnminenetworkgame_db_user:vsKaIcSSJhfiJYLn@luckyhub.myqla9g.mongodb.net/lucky_hub?retryWrites=true&w=majority';

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  
  // 1. Xóa group temp
  await db.collection('groups').deleteMany({ name: 'temp' });
  console.log('✅ Deleted temp group(s)');

  // 2. Tìm group Administrator
  const adminGroup = await db.collection('groups').findOne({ name: 'Administrator' });
  if (!adminGroup) {
    console.error('❌ Group Administrator not found!');
    process.exit(1);
  }
  console.log('✅ Found Administrator:', adminGroup._id);
  console.log('   permissions:', adminGroup.permissions?.length || 0);
  console.log('   has admin:panel:', adminGroup.permissions?.includes('admin:panel'));

  // 3. Gán admin vào Administrator
  const admin = await db.collection('users').findOne({ username: 'admin' });
  if (!admin) {
    console.error('❌ User admin not found!');
    process.exit(1);
  }
  console.log('✅ Found admin user:', admin._id);
  
  // Cập nhật groupId của admin
  await db.collection('users').updateOne(
    { _id: admin._id },
    { $set: { groupId: adminGroup._id } }
  );
  console.log('✅ Set admin groupId to Administrator');

  // Thêm admin vào members của Administrator nếu chưa có
  const adminIdStr = admin._id.toString();
  const isMember = adminGroup.members?.some(m => m.toString() === adminIdStr);
  if (!isMember) {
    await db.collection('groups').updateOne(
      { _id: adminGroup._id },
      { $addToSet: { members: admin._id } }
    );
    console.log('✅ Added admin to Administrator members');
  }

  // 4. Kiểm tra user thường trong group Administrator  
  const adminMembers = adminGroup.members || [];
  console.log('\n=== Administrator members ===');
  for (const memberId of adminMembers) {
    const member = await db.collection('users').findOne(
      { _id: typeof memberId === 'string' ? new mongoose.Types.ObjectId(memberId) : memberId },
      { projection: { username: 1, fullName: 1, groupId: 1 } }
    );
    if (member) {
      console.log(`- ${member.fullName} (@${member.username}) groupId: ${member.groupId}`);
    }
  }

  // 5. Verify cuối
  const verifyAdmin = await db.collection('users').findOne({ username: 'admin' });
  const verifyGroup = await db.collection('groups').findOne({ _id: verifyAdmin.groupId });
  console.log('\n=== FINAL VERIFICATION ===');
  console.log('Admin groupId:', verifyAdmin.groupId);
  console.log('Group name:', verifyGroup?.name);
  console.log('Group has admin:panel:', verifyGroup?.permissions?.includes('admin:panel'));
  console.log('Group isActive:', verifyGroup?.isActive);
  console.log('Admin groupName field:', verifyAdmin.groupName);

  await mongoose.disconnect();
  console.log('\n✅ Done! Vui lòng đăng xuất và đăng nhập lại tài khoản admin.');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });