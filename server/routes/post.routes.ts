import { Router, Request, Response } from 'express';
import { Post } from '../models/Post.ts';
import { Notification } from '../models/Notification.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { AuditLogType } from '../../types.ts';
import { authMiddleware, optionalAuth } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { uploadToImgBB } from '../utils/imageUtils.ts';
import { validateBody } from '../../services/validationService.ts';
import { logger } from '../../src/utils/logger.ts';

const router = Router();

// GET /api/posts - Lấy bài viết (có phân trang)
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const search = (req.query.search as string) || '';
  const hashtag = (req.query.hashtag as string) || '';
  const skip = (page - 1) * limit;

  let query: any = {};
  if (search) query.content = { $regex: search, $options: 'i' };
  if (hashtag) query.hashtags = hashtag;

  const total = await Post.countDocuments(query);
  const p = await Post.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalPages = Math.ceil(total / limit);
  res.json({
    posts: p.map(i => ({ ...i.toObject(), id: i._id })),
    pagination: { page, limit, total, totalPages, hasMore: page < totalPages }
  });
});

// POST /api/posts - Tạo bài viết
router.post('/', authMiddleware, requirePermission(RESOURCES.POSTS.CREATE), validateBody(
  { field: 'userId', type: 'string', required: true },
  { field: 'content', type: 'content', required: true },
  { field: 'userFullName', type: 'string', required: false, max: 100 }
), async (req: Request, res: Response) => {
  const { imageUrls, ...data } = req.body;
  const uploadedImages = [];
  if (imageUrls && Array.isArray(imageUrls)) {
    for (const img of imageUrls) {
      if (img.startsWith('data:image')) {
        const imgData = await uploadToImgBB(img);
        if (imgData) uploadedImages.push(imgData);
      }
    }
  }
  const p = new Post({ ...data, images: uploadedImages, imageUrls: uploadedImages.map(i => i.url) });
  await p.save();

  const log = new AuditLog({
    actorId: p.userId, actorName: p.userFullName, type: AuditLogType.POST_CREATE,
    details: `Đăng bài viết mới: "${p.content?.substring(0, 50)}..."`, timestamp: new Date().toISOString()
  });
  await log.save();

  res.json({ ...p.toObject(), id: p._id });
});

// PUT /api/posts/:id - Sửa bài viết
router.put('/:id', authMiddleware, validateBody(
  { field: 'content', type: 'content', required: false }
), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content, existingImages, newImages, hashtags } = req.body;

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Kiểm tra quyền sửa
    const canEditAny = req.user!.permissions.includes(RESOURCES.POSTS.UPDATE_ANY);
    const canEditOwn = req.user!.permissions.includes(RESOURCES.POSTS.UPDATE_OWN);
    const isOwner = post.userId === req.user!.userId;

    if (!canEditAny && (!canEditOwn || !isOwner)) {
      return res.status(403).json({ message: 'Bạn không có quyền sửa bài viết này' });
    }

    if (content !== undefined) post.content = content;
    if (hashtags !== undefined) post.hashtags = hashtags;

    if (existingImages !== undefined || newImages !== undefined) {
      const keptImageUrls: string[] = existingImages || [];
      const newUploadedImages: { url: string; deleteUrl: string }[] = [];
      if (newImages && Array.isArray(newImages)) {
        for (const img of newImages) {
          if (img.startsWith('data:image')) {
            const imgData = await uploadToImgBB(img);
            if (imgData) newUploadedImages.push(imgData);
          } else {
            newUploadedImages.push({ url: img, deleteUrl: '' });
          }
        }
      }
      const finalUrls = [...keptImageUrls, ...newUploadedImages.map(i => i.url)];
      const keptImages = (post.images || []).filter((img: any) => keptImageUrls.includes(img.url));
      post.imageUrls = finalUrls;
      (post as any).images = [...keptImages, ...newUploadedImages];
    }

    await post.save();

    const log = new AuditLog({
      actorId: post.userId, actorName: post.userFullName, type: AuditLogType.POST_UPDATE,
      details: `Chỉnh sửa bài viết: "${post.content?.substring(0, 50)}..."`, timestamp: new Date().toISOString()
    });
    await log.save();

    res.json({ ...post.toObject(), id: post._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/posts/:id - Xóa bài viết
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const canDeleteAny = req.user!.permissions.includes(RESOURCES.POSTS.DELETE_ANY);
    const canDeleteOwn = req.user!.permissions.includes(RESOURCES.POSTS.DELETE_OWN);
    const isOwner = post.userId === req.user!.userId;

    if (!canDeleteAny && (!canDeleteOwn || !isOwner)) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa bài viết này' });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/posts/:postId/react - Reaction
router.put('/:postId/react', async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { userId, type, userName, userAvatar } = req.body;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    if (!Array.isArray(post.reactions)) (post as any).reactions = [];

    const existingReaction = post.reactions.find((r: any) => r.userId === userId && r.type === type);
    if (existingReaction) {
      existingReaction.count = (existingReaction.count || 1) + 1;
    } else {
      post.reactions.push({ userId, userName: userName || 'Unknown', userAvatar: userAvatar || '', type, count: 1 });
    }

    await post.save();

    // Gửi notification cho chủ bài viết
    if (post.userId && post.userId !== userId) {
      const reactTypes: Record<string, string> = {
        'like': '👍 thích', 'love': '❤️ yêu thích', 'laugh': '😂 cười',
        'wow': '😮 ngạc nhiên', 'sad': '😢 buồn', 'angry': '😠 tức giận'
      };
      const notification = new Notification({
        userId: post.userId, type: 'reaction',
        message: `${userName || 'Ai đó'} đã bày tỏ cảm xúc "${reactTypes[type] || type}" bài viết của bạn.`,
        link: `/posts/${postId}`
      });
      await notification.save();
    }

    res.json({ ...post.toObject(), id: post._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/posts/:postId/react - Remove reaction
router.delete('/:postId/react', async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { userId, type } = req.body;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const reactionIndex = post.reactions?.findIndex((r: any) => r.userId === userId && r.type === type);
    if (reactionIndex === undefined || reactionIndex === -1) {
      return res.status(404).json({ message: 'Reaction not found' });
    }

    post.reactions!.splice(reactionIndex, 1);
    await post.save();

    res.json({ ...post.toObject(), id: post._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/hashtags - Popular hashtags
router.get('/hashtags/all', async (req: Request, res: Response) => {
  try {
    const hashtagCounts = await Post.aggregate([
      { $unwind: '$hashtags' },
      { $group: { _id: '$hashtags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    res.json(hashtagCounts.map(h => ({ tag: h._id, count: h.count })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;