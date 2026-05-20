import { Router, Request, Response } from 'express';
import { Metric } from '../models/Metric.ts';
import { User } from '../models/User.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { Notification } from '../models/Notification.ts';
import { AuditLogType } from '../../types.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission, can } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { validateBody } from '../../services/validationService.ts';

const router = Router();

// Tất cả metric routes cần auth
router.use(authMiddleware);

/**
 * GET /api/metrics/:userId - Lấy metrics của user
 * MEMBER: chỉ xem của mình (metrics:view:own)
 * COACH/ADMIN: xem của bất kỳ (metrics:view:any)
 */
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user!.userId;

    // Kiểm tra quyền
    const canViewAny = req.user!.permissions.includes(RESOURCES.METRICS.VIEW_ANY) || req.user!.role === 'ADMIN';
    const canViewOwn = req.user!.permissions.includes(RESOURCES.METRICS.VIEW_OWN);

    if (!canViewAny && (!canViewOwn || targetUserId !== currentUserId)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem chỉ số này' });
    }

    const m = await Metric.find({ userId: targetUserId }).sort({ date: -1 });
    res.json(m.map(item => ({ ...item.toObject(), id: item._id })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/metrics - Tạo metric mới
 * MEMBER: chỉ tạo cho mình (metrics:create:own)
 * COACH/ADMIN: tạo cho bất kỳ (metrics:create:any)
 */
router.post('/', validateBody(
  { field: 'userId', type: 'string', required: true },
  { field: 'date', type: 'string', required: true },
  { field: 'weight', type: 'number', required: false },
  { field: 'bodyFat', type: 'number', required: false },
  { field: 'muscleMass', type: 'number', required: false },
  { field: 'waterPercent', type: 'number', required: false },
  { field: 'boneMinerals', type: 'number', required: false },
  { field: 'visceralFat', type: 'number', required: false },
  { field: 'energy', type: 'number', required: false },
  { field: 'bioAge', type: 'number', required: false },
  { field: 'balanceIndex', type: 'number', required: false }
), async (req: Request, res: Response) => {
  try {
    const { actorId, actorName, ...metricData } = req.body;
    const currentUserId = req.user!.userId;

    // Kiểm tra quyền
    const canCreateAny = req.user!.permissions.includes(RESOURCES.METRICS.CREATE_ANY) || req.user!.role === 'ADMIN';
    const canCreateOwn = req.user!.permissions.includes(RESOURCES.METRICS.CREATE_OWN);

    if (!canCreateAny && (!canCreateOwn || metricData.userId !== currentUserId)) {
      return res.status(403).json({ message: 'Bạn không có quyền thêm chỉ số cho người này' });
    }

    const m = new Metric(metricData);
    await m.save();

    const target = await User.findById(metricData.userId);
    const isHelp = metricData.userId.toString() !== currentUserId;

    const logType = isHelp ? AuditLogType.METRIC_HELP_UPDATE : AuditLogType.METRIC_UPDATE;
    const details = isHelp
      ? `Cập nhật chỉ số giúp hội viên ${target?.fullName}`
      : `Tự cập nhật chỉ số cá nhân`;

    const log = new AuditLog({
      actorId: currentUserId, actorName: req.user?.fullName || 'Hội viên',
      targetId: metricData.userId, targetName: target?.fullName,
      type: logType, details, timestamp: new Date().toISOString()
    });
    await log.save();

    // Gửi notification cho member khi coach/admin cập nhật metrics giúp
    if (isHelp && metricData.userId) {
      const notification = new Notification({
        userId: metricData.userId,
        type: 'metric_help',
        message: `📊 ${req.user?.fullName || 'Huấn luyện viên'} đã cập nhật chỉ số sức khỏe cho bạn.`,
        link: `/metrics`
      });
      await notification.save();
    }

    res.json({ ...m.toObject(), id: m._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /api/metrics/:id - Cập nhật metric
 * MEMBER: chỉ sửa của mình (metrics:update:own)
 * COACH/ADMIN: sửa được tất cả (metrics:update:any)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const metricId = req.params.id;
    const currentUserId = req.user!.userId;

    const metric = await Metric.findById(metricId);
    if (!metric) return res.status(404).json({ message: 'Không tìm thấy chỉ số' });

    // Kiểm tra quyền
    const canUpdateAny = req.user!.permissions.includes(RESOURCES.METRICS.UPDATE_ANY) || req.user!.role === 'ADMIN';
    const canUpdateOwn = req.user!.permissions.includes(RESOURCES.METRICS.UPDATE_OWN);
    const isOwner = metric.userId.toString() === currentUserId;

    if (!canUpdateAny && (!canUpdateOwn || !isOwner)) {
      return res.status(403).json({ message: 'Bạn không có quyền sửa chỉ số này' });
    }

    const updatedMetric = await Metric.findByIdAndUpdate(metricId, req.body, { new: true });
    if (!updatedMetric) return res.status(404).json({ message: 'Không tìm thấy chỉ số' });

    // Audit log
    const target = await User.findById(metric.userId);
    const log = new AuditLog({
      actorId: currentUserId, actorName: req.user?.fullName || 'User',
      targetId: metric.userId, targetName: target?.fullName,
      type: AuditLogType.METRIC_UPDATE,
      details: `Sửa chỉ số ngày ${metric.date} của ${target?.fullName || 'hội viên'}`,
      timestamp: new Date().toISOString()
    });
    await log.save();

    console.log(`[Metrics] ✅ Updated metric ${metricId} by ${req.user?.fullName}`);
    res.json({ ...updatedMetric.toObject(), id: updatedMetric._id });
  } catch (err: any) {
    console.error(`[Metrics] ❌ Update error: ${err.message}`);
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/metrics/:id - Xóa metric
 * Chỉ COACH/ADMIN mới có quyền xóa (metrics:delete:any)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const metricId = req.params.id;
    const currentUserId = req.user!.userId;

    // Chỉ COACH/ADMIN mới được xóa
    const canDeleteAny = req.user!.permissions.includes(RESOURCES.METRICS.DELETE_ANY) || req.user!.role === 'ADMIN';
    if (!canDeleteAny) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa chỉ số' });
    }

    const metric = await Metric.findById(metricId);
    if (!metric) return res.status(404).json({ message: 'Không tìm thấy chỉ số' });

    await Metric.findByIdAndDelete(metricId);

    // Audit log
    const target = await User.findById(metric.userId);
    const log = new AuditLog({
      actorId: currentUserId, actorName: req.user?.fullName || 'User',
      targetId: metric.userId, targetName: target?.fullName,
      type: AuditLogType.METRIC_UPDATE,
      details: `Xóa chỉ số ngày ${metric.date} của ${target?.fullName || 'hội viên'}`,
      timestamp: new Date().toISOString()
    });
    await log.save();

    console.log(`[Metrics] ✅ Deleted metric ${metricId} by ${req.user?.fullName}`);
    res.json({ success: true, message: 'Đã xóa chỉ số' });
  } catch (err: any) {
    console.error(`[Metrics] ❌ Delete error: ${err.message}`);
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/metrics/delete-bulk - Xóa hàng loạt metrics
 * Chỉ COACH/ADMIN
 */
router.post('/delete-bulk', async (req: Request, res: Response) => {
  try {
    const canDeleteAny = req.user!.permissions.includes(RESOURCES.METRICS.DELETE_ANY) || req.user!.role === 'ADMIN';
    if (!canDeleteAny) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa chỉ số' });
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
    }

    const result = await Metric.deleteMany({ _id: { $in: ids } });

    console.log(`[Metrics] ✅ Bulk deleted ${result.deletedCount} metrics by ${req.user?.fullName}`);
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/metrics/all/:userId - Xóa toàn bộ metrics của user
 * Chỉ COACH/ADMIN
 */
router.delete('/all/:userId', async (req: Request, res: Response) => {
  try {
    const canDeleteAny = req.user!.permissions.includes(RESOURCES.METRICS.DELETE_ANY) || req.user!.role === 'ADMIN';
    if (!canDeleteAny) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa chỉ số' });
    }

    const { userId } = req.params;
    const result = await Metric.deleteMany({ userId });

    const target = await User.findById(userId);
    const log = new AuditLog({
      actorId: req.user!.userId, actorName: req.user?.fullName || 'User',
      targetId: userId, targetName: target?.fullName,
      type: AuditLogType.METRIC_UPDATE,
      details: `Xóa toàn bộ chỉ số của ${target?.fullName || 'hội viên'} (${result.deletedCount} bản ghi)`,
      timestamp: new Date().toISOString()
    });
    await log.save();

    console.log(`[Metrics] ✅ Deleted all ${result.deletedCount} metrics for user ${userId} by ${req.user?.fullName}`);
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/metrics/export/:userId - Export metrics
 * Kiểm tra quyền xem
 */
router.get('/export/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user!.userId;
    const format = (req.query.format as string) || 'csv';
    const fromDate = req.query.from as string;
    const toDate = req.query.to as string;

    const canViewAny = req.user!.permissions.includes(RESOURCES.METRICS.VIEW_ANY) || req.user!.role === 'ADMIN';
    const canViewOwn = req.user!.permissions.includes(RESOURCES.METRICS.VIEW_OWN);

    if (!canViewAny && (!canViewOwn || userId !== currentUserId)) {
      return res.status(403).json({ message: 'Bạn không có quyền xuất dữ liệu này' });
    }

    let query: any = { userId };
    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = fromDate;
      if (toDate) query.date.$lte = toDate;
    }

    const metrics = await Metric.find(query).sort({ date: -1 }).limit(1000);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=metrics.json');
      return res.json(metrics);
    }

    const headers = 'Date,Weight,BodyFat,MuscleMass,WaterPercent,BoneMinerals,VisceralFat,Energy,BioAge,BalanceIndex';
    const rows = metrics.map(m =>
      `${m.date},${m.weight || ''},${m.bodyFat || ''},${m.muscleMass || ''},${m.waterPercent || ''},${m.boneMinerals || ''},${m.visceralFat || ''},${m.energy || ''},${m.bioAge || ''},${m.balanceIndex || ''}`
    );
    const csv = `${headers}\n${rows.join('\n')}`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=health_metrics.csv');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/metrics/bulk - Bulk insert/upsert metrics
 */
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { metrics } = req.body;
    if (!Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    }

    const canCreateAny = req.user!.permissions.includes(RESOURCES.METRICS.CREATE_ANY) || req.user!.role === 'ADMIN';
    const canCreateOwn = req.user!.permissions.includes(RESOURCES.METRICS.CREATE_OWN);

    const firstUserId = metrics[0].userId;
    if (!canCreateAny && (!canCreateOwn || firstUserId !== req.user!.userId)) {
      return res.status(403).json({ message: 'Bạn không có quyền thêm chỉ số cho người này' });
    }

    const targetUserId = firstUserId;
    const target = await User.findById(targetUserId);

    const operations = metrics.map(m => ({
      updateOne: { filter: { userId: m.userId, date: m.date }, update: { $set: m }, upsert: true }
    }));
    const result = await Metric.bulkWrite(operations);

    const isHelp = targetUserId.toString() !== req.user!.userId;
    const logType = isHelp ? AuditLogType.METRIC_HELP_UPDATE : AuditLogType.METRIC_UPDATE;
    const details = isHelp
      ? `Cập nhật hàng loạt ${metrics.length} chỉ số giúp hội viên ${target?.fullName}`
      : `Tự cập nhật hàng loạt ${metrics.length} chỉ số cá nhân`;

    const log = new AuditLog({
      actorId: req.user!.userId, actorName: req.user?.fullName || 'Hội viên',
      targetId: targetUserId, targetName: target?.fullName,
      type: logType, details, timestamp: new Date().toISOString()
    });
    await log.save();

    res.json({ success: true, upsertedCount: result.upsertedCount });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;