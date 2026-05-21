import { Router, Request, Response } from 'express';
import { ChatGroup } from '../models/ChatGroup.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';

const router = Router();
router.use(authMiddleware);

// GET /api/chat-groups - Danh sách group chat của user
router.get('/', async (req: Request, res: Response) => {
  try {
    const groups = await ChatGroup.find({
      memberIds: req.user!.userId,
      isActive: true,
    }).select('name nutritionGroupIds memberIds lastMessage').sort({ updatedAt: -1 });
    res.json(groups.map(g => ({ ...g.toObject(), id: g._id, messageCount: g.messages?.length || 0 })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat-groups/all - Tất cả (admin)
router.get('/all', requirePermission(RESOURCES.GROUPS.MANAGE), async (req: Request, res: Response) => {
  try {
    const groups = await ChatGroup.find().sort({ createdAt: -1 });
    res.json(groups.map(g => ({ ...g.toObject(), id: g._id })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat-groups - Tạo group chat (admin)
router.post('/', requirePermission(RESOURCES.GROUPS.MANAGE), async (req: Request, res: Response) => {
  try {
    const { name, nutritionGroupIds, memberIds } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Tên group là bắt buộc' });
    }

    const group = new ChatGroup({
      name: name.trim(),
      nutritionGroupIds: nutritionGroupIds || [],
      memberIds: memberIds || [],
      createdBy: req.user!.userId,
      isActive: true,
      messages: [],
    });
    await group.save();

    console.log(`[ChatGroup] ✅ Created "${group.name}" by ${req.user?.fullName}`);
    res.json({ ...group.toObject(), id: group._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/chat-groups/:id - Sửa group
router.put('/:id', requirePermission(RESOURCES.GROUPS.MANAGE), async (req: Request, res: Response) => {
  try {
    const { name, nutritionGroupIds, memberIds, isActive } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (nutritionGroupIds !== undefined) updateData.nutritionGroupIds = nutritionGroupIds;
    if (memberIds !== undefined) updateData.memberIds = memberIds;
    if (isActive !== undefined) updateData.isActive = isActive;

    const group = await ChatGroup.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group' });
    res.json({ ...group.toObject(), id: group._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/chat-groups/:id
router.delete('/:id', requirePermission(RESOURCES.GROUPS.MANAGE), async (req: Request, res: Response) => {
  try {
    await ChatGroup.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat-groups/:id/messages - Lấy tin nhắn của group
router.get('/:id/messages', async (req: Request, res: Response) => {
  try {
    const group = await ChatGroup.findById(req.params.id).select('messages name');
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group' });
    res.json({ groupName: group.name, messages: group.messages || [] });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat-groups/:id/message - Gửi tin nhắn
router.post('/:id/message', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: 'Nội dung tin nhắn là bắt buộc' });

    const group = await ChatGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group' });

    const message = {
      groupId: req.params.id,
      senderId: req.user!.userId,
      senderName: req.user!.fullName,
      content: content.trim(),
      timestamp: new Date().toISOString(),
      type: 'text',
    };

    group.messages.push(message as any);
    group.lastMessage = { content: content.trim().substring(0, 100), senderName: req.user!.fullName, timestamp: message.timestamp };
    await group.save();

    res.json(message);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;