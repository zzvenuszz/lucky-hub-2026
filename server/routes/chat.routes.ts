import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Chat } from '../models/Chat.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { getChatContactIds, getChatContacts } from '../services/chatPermissionService.ts';

const router = Router();
router.use(authMiddleware);

// GET /api/chats
router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  // Lấy danh sách contact được phép chat
  const contactIds = await getChatContactIds(userId);
  
  const chats = await Chat.find({
    $or: [{ memberId: userId }, { coachId: userId }]
  });
  
  // Chỉ giữ lại chats với người nằm trong contact list
  const filteredChats = chats.filter(chat => {
    const otherId = String(chat.memberId) === userId ? String(chat.coachId) : String(chat.memberId);
    return contactIds.includes(otherId);
  });
  
  console.log(`[Chat] User ${userId}: ${filteredChats.length}/${chats.length} chats after permission filter`);
  res.json(filteredChats);
});

// GET /api/chats/contacts - Danh sách người dùng được phép chat
router.get('/contacts', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  try {
    const contacts = await getChatContacts(userId);
    console.log(`[Chat] Contacts for ${userId}: ${contacts.length} contacts`);
    res.json(contacts);
  } catch (err: any) {
    console.error('[Chat] Error fetching contacts:', err.message);
    res.status(500).json({ message: 'Lỗi khi tải danh sách liên hệ' });
  }
});

// POST /api/chats
router.post('/', async (req: Request, res: Response) => {
  const { id, ...data } = req.body;
  const chat = await Chat.findOneAndUpdate({ id }, { ...data, id }, { upsert: true, new: true });
  res.json(chat);
});

// POST /api/chats/send - Gửi tin nhắn từ HLV đến member
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { receiverId, content } = req.body;
    const senderId = (req as any).user?.userId;
    const senderName = (req as any).user?.fullName || 'Unknown';

    if (!receiverId || !content) {
      return res.status(400).json({ message: 'Thiếu thông tin tin nhắn' });
    }

    // Tìm hoặc tạo chat session giữa HLV và member
    let chat = await Chat.findOne({
      $or: [
        { memberId: senderId, coachId: receiverId },
        { memberId: receiverId, coachId: senderId },
      ]
    });

    if (!chat) {
      chat = new Chat({
        id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        memberId: receiverId,
        coachId: senderId,
        messages: [],
      });
    }

    // Lấy group name của người gửi để làm senderRole
    const { getEffectivePermissions } = await import('../services/permissionService.ts');
    const GroupModel = mongoose.model('Group');
    const sender = await mongoose.model('User').findById(senderId).select('groupId groupName');
    const senderGroup = sender?.groupId ? await GroupModel.findById(sender.groupId).select('name') : null;
    const senderRole = senderGroup?.name || sender?.groupName || 'Hội viên';

    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId,
      senderName,
      senderRole,
      content,
      timestamp: new Date().toISOString(),
      type: 'text',
      status: 'sent',
    };

    chat.messages.push(newMessage);
    await chat.save();

    console.log(`[Chat] 💬 Message sent: ${senderName} -> ${receiverId.substring(0, 8)}`);
    res.json(newMessage);
  } catch (err: any) {
    console.error('[Chat] Send error:', err.message);
    res.status(500).json({ message: 'Lỗi khi gửi tin nhắn' });
  }
});

// PUT /api/chats/:id/clear
router.put('/:id/clear', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const chat = await Chat.findOneAndUpdate({ id }, { $set: { messages: [] } }, { new: true });
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;