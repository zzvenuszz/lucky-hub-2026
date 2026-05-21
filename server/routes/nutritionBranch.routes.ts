import { Router, Request, Response } from 'express';
import { NutritionBranch } from '../models/NutritionBranch.ts';
import { NutritionGroup } from '../models/NutritionGroup.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';

const router = Router();

// GET /api/nutrition-branches - Danh sách tất cả nhánh (admin)
router.get('/', requirePermission(RESOURCES.NDD.SYSTEM), async (req: Request, res: Response) => {
  try {
    const branches = await NutritionBranch.find()
      .populate('nutritionGroupIds', 'name ownerName members')
      .sort({ createdAt: -1 });
    res.json(branches);
  } catch (err: any) {
    console.error('[NutritionBranch] List error:', err.message);
    res.status(500).json({ message: 'Lỗi khi tải danh sách nhánh' });
  }
});

// GET /api/nutrition-branches/my-branches - Nhánh của HLV (dựa trên NDD họ quản lý)
router.get('/my-branches', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    // Tìm các NDD mà user là owner hoặc co-owner
    const myNddIds = await NutritionGroup.find({
      $or: [{ ownerId: userId }, { coOwners: userId }],
      isActive: true
    }).select('_id');
    const nddIdList = myNddIds.map(g => g._id);

    if (nddIdList.length === 0) {
      return res.json([]);
    }

    // Tìm các nhánh chứa các NDD đó
    const branches = await NutritionBranch.find({
      nutritionGroupIds: { $in: nddIdList },
      isActive: true
    }).populate('nutritionGroupIds', 'name ownerName');

    res.json(branches);
  } catch (err: any) {
    console.error('[NutritionBranch] My branches error:', err.message);
    res.status(500).json({ message: 'Lỗi khi tải nhánh của bạn' });
  }
});

// POST /api/nutrition-branches - Tạo nhánh mới (admin)
router.post('/', requirePermission(RESOURCES.NDD.SYSTEM), async (req: Request, res: Response) => {
  try {
    const { name, nutritionGroupIds } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Tên nhánh là bắt buộc' });
    }
    if (!nutritionGroupIds || nutritionGroupIds.length < 2) {
      return res.status(400).json({ message: 'Cần chọn ít nhất 2 NDD' });
    }

    // Tự động tính memberIds từ các NDD
    const ndds = await NutritionGroup.find({ _id: { $in: nutritionGroupIds } });
    const memberIds = new Set<string>();
    ndds.forEach(ndd => {
      ndd.members.forEach((m: any) => memberIds.add(m._id ? m._id.toString() : m.toString()));
      if (ndd.ownerId) memberIds.add(ndd.ownerId.toString());
      (ndd.coOwners || []).forEach((c: any) => memberIds.add(c._id ? c._id.toString() : c.toString()));
    });

    const branch = new NutritionBranch({
      name: name.trim(),
      nutritionGroupIds,
      memberIds: Array.from(memberIds),
      createdBy: (req as any).user?.userId,
      isActive: true,
    });
    await branch.save();
    console.log(`[NutritionBranch] ✅ Created branch "${branch.name}" with ${branch.memberIds.length} members`);
    res.json(branch);
  } catch (err: any) {
    console.error('[NutritionBranch] Create error:', err.message);
    res.status(500).json({ message: 'Lỗi khi tạo nhánh' });
  }
});

// PUT /api/nutrition-branches/:id - Sửa nhánh
router.put('/:id', requirePermission(RESOURCES.NDD.SYSTEM), async (req: Request, res: Response) => {
  try {
    const { name, nutritionGroupIds, isActive } = req.body;
    const branch = await NutritionBranch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Không tìm thấy nhánh' });

    if (name) branch.name = name.trim();
    if (nutritionGroupIds) {
      if (nutritionGroupIds.length < 2) {
        return res.status(400).json({ message: 'Cần chọn ít nhất 2 NDD' });
      }
      branch.nutritionGroupIds = nutritionGroupIds;
      // Cập nhật memberIds
      const ndds = await NutritionGroup.find({ _id: { $in: nutritionGroupIds } });
      const memberIds = new Set<string>();
      ndds.forEach(ndd => {
        ndd.members.forEach((m: any) => memberIds.add(m._id ? m._id.toString() : m.toString()));
        if (ndd.ownerId) memberIds.add(ndd.ownerId.toString());
        (ndd.coOwners || []).forEach((c: any) => memberIds.add(c._id ? c._id.toString() : c.toString()));
      });
      branch.memberIds = Array.from(memberIds);
    }
    if (typeof isActive === 'boolean') branch.isActive = isActive;
    await branch.save();
    console.log(`[NutritionBranch] ✅ Updated branch "${branch.name}"`);
    res.json(branch);
  } catch (err: any) {
    console.error('[NutritionBranch] Update error:', err.message);
    res.status(500).json({ message: 'Lỗi khi cập nhật nhánh' });
  }
});

// DELETE /api/nutrition-branches/:id - Xóa nhánh
router.delete('/:id', requirePermission(RESOURCES.NDD.SYSTEM), async (req: Request, res: Response) => {
  try {
    const branch = await NutritionBranch.findByIdAndDelete(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Không tìm thấy nhánh' });
    console.log(`[NutritionBranch] ✅ Deleted branch "${branch.name}"`);
    res.json({ success: true, message: 'Đã xóa nhánh' });
  } catch (err: any) {
    console.error('[NutritionBranch] Delete error:', err.message);
    res.status(500).json({ message: 'Lỗi khi xóa nhánh' });
  }
});

// POST /api/nutrition-branches/:id/message - Gửi tin nhắn trong nhánh
router.post('/:id/message', async (req: Request, res: Response) => {
  try {
    const branch = await NutritionBranch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Không tìm thấy nhánh' });
    if (!branch.isActive) return res.status(400).json({ message: 'Nhánh này hiện không hoạt động' });

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Nội dung tin nhắn là bắt buộc' });
    }

    const senderId = (req as any).user?.userId;
    const senderName = (req as any).user?.fullName || 'Unknown';

    const newMessage = {
      senderId,
      senderName,
      content: content.trim(),
      timestamp: new Date().toISOString(),
      type: 'text',
    };

    branch.messages.push(newMessage);
    branch.lastMessage = { content: content.trim(), senderName, timestamp: new Date().toISOString() };
    await branch.save();

    console.log(`[NutritionBranch] 💬 Message sent in "${branch.name}" by ${senderName}`);
    res.json(newMessage);
  } catch (err: any) {
    console.error('[NutritionBranch] Message error:', err.message);
    res.status(500).json({ message: 'Lỗi khi gửi tin nhắn' });
  }
});

// GET /api/nutrition-branches/:id/messages - Lấy tin nhắn trong nhánh
router.get('/:id/messages', async (req: Request, res: Response) => {
  try {
    const branch = await NutritionBranch.findById(req.params.id).select('messages');
    if (!branch) return res.status(404).json({ message: 'Không tìm thấy nhánh' });
    res.json(branch.messages || []);
  } catch (err: any) {
    console.error('[NutritionBranch] Get messages error:', err.message);
    res.status(500).json({ message: 'Lỗi khi tải tin nhắn' });
  }
});

// GET /api/nutrition-branches/:id/members-metrics - Lấy chỉ số member trong nhánh
router.get('/:id/members-metrics', async (req: Request, res: Response) => {
  try {
    const branch = await NutritionBranch.findById(req.params.id)
      .populate('memberIds', 'fullName username avatar role');
    if (!branch) return res.status(404).json({ message: 'Không tìm thấy nhánh' });

    // Lấy chỉ số mới nhất cho mỗi member
    const Metric = require('mongoose').model('Metric');
    const members = await Promise.all(
      branch.memberIds.map(async (member: any) => {
        const latestMetric = await Metric.findOne({ userId: member._id })
          .sort({ date: -1 })
          .select('weight bodyFat muscleMass date');
        return {
          user: member,
          latestMetric: latestMetric || null,
        };
      })
    );

    res.json(members);
  } catch (err: any) {
    console.error('[NutritionBranch] Members metrics error:', err.message);
    res.status(500).json({ message: 'Lỗi khi tải chỉ số' });
  }
});

export default router;