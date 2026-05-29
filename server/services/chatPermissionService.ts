/**
 * ChatPermissionService - Xác định danh sách người dùng được phép chat
 * 
 * Rules:
 * 1. ADMIN (admin:panel) → thấy tất cả users + AI
 * 2. Vận hành NDD (coach:access / owner / co-owner) → thấy: AI, admin, tất cả members trong NDD họ quản lý
 *    - Nếu NDD thuộc branch → thêm: owner/co-owner NDD khác trong branch + members của các NDD trong branch
 * 3. Thành viên thường → thấy: AI, chủ NDD, đồng vận hành NDD, admin
 */
import { User } from '../models/User.ts';
import { Group } from '../models/Group.ts';
import { NutritionGroup } from '../models/NutritionGroup.ts';
import { NutritionBranch } from '../models/NutritionBranch.ts';
import mongoose from 'mongoose';

export interface ChatContact {
  userId: string;
  fullName: string;
  role: string;
  avatar?: string;
  nutritionGroupId?: string;
}

/**
 * Lấy danh sách user IDs được phép chat với userId hiện tại
 */
export async function getChatContactIds(userId: string): Promise<string[]> {
  const contactIds = new Set<string>();

  // AI luôn được phép
  contactIds.add('ai_coach');

  try {
    // Lấy user info
    const user = await User.findById(userId).select('groupId nutritionGroupId');
    if (!user) return Array.from(contactIds);

    // Lấy permissions từ Group
    let permissions: string[] = [];
    if (user.groupId) {
      const group = await Group.findById(user.groupId).select('permissions');
      if (group) {
        permissions = group.permissions || [];
      }
    }

    const isAdmin = permissions.includes('admin:panel');
    const isCoach = permissions.includes('coach:access');

    // ===== CASE 1: ADMIN - thấy tất cả =====
    if (isAdmin) {
      const allUsers = await User.find({ _id: { $ne: userId } }).select('_id');
      allUsers.forEach(u => contactIds.add(u._id.toString()));
      console.log(`[ChatPermission] Admin ${userId}: sees all ${allUsers.length} users`);
      return Array.from(contactIds);
    }

    // Tìm các NDD mà user là owner hoặc co-owner
    const myNddDocs = await NutritionGroup.find({
      $or: [{ ownerId: userId }, { coOwners: userId }],
      isActive: true
    }).select('_id ownerId coOwners members');
    const myNddIds = myNddDocs.map(ndd => ndd._id.toString());

    // Lấy NDD mà user đang sinh hoạt (với tư cách member)
    // Ưu tiên từ user.nutritionGroupId, nếu không tìm thấy thì fallback tìm trong members array
    let memberNdd = user.nutritionGroupId 
      ? await NutritionGroup.findById(user.nutritionGroupId).select('ownerId coOwners members')
      : null;

    // Fallback: nếu nutritionGroupId không trỏ đến NDD hợp lệ, tìm trong members của tất cả NDD
    if (!memberNdd) {
      const nddAsMember = await NutritionGroup.findOne({
        members: userId,
        isActive: true
      }).select('ownerId coOwners members');
      if (nddAsMember) {
        memberNdd = nddAsMember;
        console.log(`[ChatPermission] Fallback: user ${userId} found as member in NDD "${nddAsMember.name || nddAsMember._id}"`);
      }
    }

    // Lấy tất cả admin IDs (để thêm vào contact list cho mọi role)
    const adminGroups = await Group.find({ permissions: 'admin:panel' }).select('members');
    const adminUserIds = new Set<string>();
    for (const g of adminGroups) {
      (g.members || []).forEach((m: any) => adminUserIds.add(m.toString()));
    }
    adminUserIds.forEach(id => contactIds.add(id));

    // ===== CASE 2: Vận hành NDD (coach:access OR owner/co-owner) =====
    if (isCoach || myNddIds.length > 0) {
      // Thêm members từ NDD mà user vận hành
      for (const ndd of myNddDocs) {
        // Thêm owner
        if (ndd.ownerId) contactIds.add(ndd.ownerId.toString());
        // Thêm co-owners
        (ndd.coOwners || []).forEach((c: any) => contactIds.add(c.toString()));
        // Thêm members
        (ndd.members || []).forEach((m: any) => contactIds.add(m.toString()));
      }

      // Kiểm tra branch: NDD của user có thuộc branch nào không?
      const branches = await NutritionBranch.find({
        nutritionGroupIds: { $in: myNddIds },
        isActive: true
      }).populate('memberIds');

      for (const branch of branches) {
        // Lấy tất cả NDD trong branch (ngoại trừ NDD của user)
        const branchNddIds = (branch.nutritionGroupIds || [])
          .filter((id: any) => !myNddIds.includes(id.toString()))
          .map((id: any) => id.toString());

        if (branchNddIds.length > 0) {
          // Lấy owner/co-owner/members của các NDD cùng branch
          const branchNdds = await NutritionGroup.find({
            _id: { $in: branchNddIds },
            isActive: true
          }).select('ownerId coOwners members');

          for (const bndd of branchNdds) {
            if (bndd.ownerId) contactIds.add(bndd.ownerId.toString());
            (bndd.coOwners || []).forEach((c: any) => contactIds.add(c.toString()));
            (bndd.members || []).forEach((m: any) => contactIds.add(m.toString()));
          }
        }
      }

      console.log(`[ChatPermission] Operator ${userId}: sees ${contactIds.size} contacts (incl. ${adminUserIds.size} admins)`);
      contactIds.delete(userId); // không cho chat với chính mình
      return Array.from(contactIds);
    }

    // ===== CASE 3: Thành viên thường =====
    if (memberNdd) {
      // Thêm chủ NDD
      if (memberNdd.ownerId) contactIds.add(memberNdd.ownerId.toString());
      // Thêm đồng vận hành NDD
      (memberNdd.coOwners || []).forEach((c: any) => contactIds.add(c.toString()));

      // Kiểm tra branch: NDD của user có thuộc branch không?
      const memberNddId = user.nutritionGroupId?.toString();
      if (memberNddId) {
        const branches = await NutritionBranch.find({
          nutritionGroupIds: memberNddId,
          isActive: true
        }).select('nutritionGroupIds');

        for (const branch of branches) {
          const branchNddIds = (branch.nutritionGroupIds || [])
            .filter((id: any) => id.toString() !== memberNddId)
            .map((id: any) => id.toString());

          if (branchNddIds.length > 0) {
            // Lấy owner/co-owner của NDD cùng branch (KHÔNG lấy members thường)
            const branchNdds = await NutritionGroup.find({
              _id: { $in: branchNddIds },
              isActive: true
            }).select('ownerId coOwners');

            for (const bndd of branchNdds) {
              if (bndd.ownerId) contactIds.add(bndd.ownerId.toString());
              (bndd.coOwners || []).forEach((c: any) => contactIds.add(c.toString()));
            }
          }
        }
      }
    }

    console.log(`[ChatPermission] Member ${userId}: sees ${contactIds.size} contacts`);
  } catch (err: any) {
    console.error(`[ChatPermission] Error for ${userId}:`, err.message);
  }

  contactIds.delete(userId); // không cho chat với chính mình
  return Array.from(contactIds);
}

/**
 * Lấy danh sách Contacts kèm thông tin chi tiết
 */
export async function getChatContacts(userId: string): Promise<ChatContact[]> {
  const contactIds = await getChatContactIds(userId);
  
  const contacts: ChatContact[] = [];
  
  // Thêm AI coach
  contacts.push({
    userId: 'ai_coach',
    fullName: '🍀Trợ lý Lucky',
    role: 'AI',
  });

  // Lấy thông tin users
  const realIds = contactIds.filter(id => id !== 'ai_coach');
  if (realIds.length > 0) {
    const users = await User.find({ _id: { $in: realIds } })
      .select('_id fullName nutritionGroupId avatar groupId')
      .lean();

    for (const u of users) {
      // Xác định role hiển thị dựa trên permissions
      let role = 'MEMBER';
      const group = (u as any).groupId 
        ? await Group.findById((u as any).groupId).select('permissions').lean()
        : null;
      const perms = group?.permissions || [];
      
      if (perms.includes('admin:panel')) role = 'ADMIN';
      else if (perms.includes('coach:access')) role = 'COACH';

      contacts.push({
        userId: u._id.toString(),
        fullName: u.fullName,
        role,
        avatar: u.avatar,
        nutritionGroupId: u.nutritionGroupId?.toString(),
      });
    }
  }

  return contacts;
}