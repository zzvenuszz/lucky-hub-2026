import { KnowledgeImportJob } from '../models/KnowledgeImportJob.ts';
import { KnowledgeDocumentInput, importKnowledgeDocument } from './knowledgeDocumentService.ts';
import { invalidateKnowledgeRetrievalCache } from './knowledgeRetrievalService.ts';

const MODULE = 'KnowledgeImportJob';
const JOB_RETENTION_DAYS = 7;
const STALE_JOB_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_LOG_ENTRIES_PER_JOB = 5000;
const MAX_LOGGED_JOBS = 10;

export interface KnowledgeImportJobLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

const inMemoryJobLogs = new Map<string, KnowledgeImportJobLog[]>();

function appendJobLog(jobId: string, message: string, level: KnowledgeImportJobLog['level'] = 'info', details?: Record<string, unknown>): void {
  const logs = inMemoryJobLogs.get(jobId) || [];
  logs.push({ timestamp: new Date().toISOString(), level, message, ...(details ? { details } : {}) });
  if (logs.length > MAX_LOG_ENTRIES_PER_JOB) logs.splice(0, logs.length - MAX_LOG_ENTRIES_PER_JOB);
  inMemoryJobLogs.set(jobId, logs);
  while (inMemoryJobLogs.size > MAX_LOGGED_JOBS) {
    const oldestJobId = inMemoryJobLogs.keys().next().value;
    if (!oldestJobId) break;
    inMemoryJobLogs.delete(oldestJobId);
  }
}

export interface KnowledgeDocumentImportJobResult {
  inserted: number;
  source: string;
  pages: number;
  embedded: number;
  synthesized?: number;
  alreadyImported: boolean;
  needsResynthesis?: boolean;
  reindexed: number;
}

export async function createKnowledgeDocumentImportJob(userId: string, fileName: string): Promise<string> {
  const job = await KnowledgeImportJob.create({
    userId,
    fileName: String(fileName || 'tai-lieu').slice(0, 180),
    status: 'queued',
    stage: 'queued',
    message: 'Đang chờ xử lý...',
    expiresAt: new Date(Date.now() + JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000),
  });
  console.log(`[${MODULE}] Job queued:`, { jobId: job._id.toString(), userId, fileName: job.fileName });
  appendJobLog(job._id.toString(), 'Tác vụ nhập tài liệu đã được tạo.', 'info', { fileName: job.fileName });
  return job._id.toString();
}

export async function runKnowledgeDocumentImportJob(jobId: string, input: KnowledgeDocumentInput): Promise<void> {
  const jobFilter = { _id: jobId, userId: input.userId };
  try {
    appendJobLog(jobId, 'Worker bắt đầu xử lý tài liệu.', 'info', { fileName: input.fileName, mimeType: input.mimeType });
    await KnowledgeImportJob.updateOne(jobFilter, {
      $set: { status: 'processing', stage: 'extracting', percent: 0, message: 'Đang chuẩn bị đọc tài liệu...' },
    });
    const result: KnowledgeDocumentImportJobResult = await importKnowledgeDocument({
      ...input,
      requestId: jobId,
      onLog: (message, level = 'info', details) => {
        appendJobLog(jobId, message, level, details);
        input.onLog?.(message, level, details);
      },
      onProgress: async progress => {
        console.log(`[${MODULE}] Progress:`, { jobId, stage: progress.stage, page: `${progress.pageNumber}/${progress.totalPages}`, percent: progress.percent, message: progress.message });
        appendJobLog(jobId, progress.message, 'info', { stage: progress.stage, pageNumber: progress.pageNumber, totalPages: progress.totalPages, percent: progress.percent });
        await KnowledgeImportJob.updateOne(jobFilter, {
          $set: {
            status: 'processing',
            stage: progress.stage,
            pageNumber: progress.pageNumber,
            totalPages: progress.totalPages,
            percent: Math.min(99, Math.max(0, progress.percent)),
            message: progress.message,
          },
        });
      },
    });
    if ((!result.alreadyImported && result.inserted > 0) || result.reindexed > 0) invalidateKnowledgeRetrievalCache();
    await KnowledgeImportJob.updateOne(jobFilter, {
      $set: {
        status: 'completed',
        stage: 'completed',
        pageNumber: result.pages,
        totalPages: result.pages,
        percent: 100,
        message: result.alreadyImported ? 'Tài liệu đã có trong kho kiến thức.' : `Đã nhập xong ${result.inserted} đoạn kiến thức.`,
        result,
        error: '',
        expiresAt: new Date(Date.now() + JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    console.log(`[${MODULE}] Job completed:`, { jobId, inserted: result.inserted, pages: result.pages, alreadyImported: result.alreadyImported });
    appendJobLog(jobId, 'Tác vụ nhập tài liệu hoàn tất.', 'info', { inserted: result.inserted, pages: result.pages, alreadyImported: result.alreadyImported });
  } catch (error: any) {
    const rawMessage = String(error?.message || 'Không thể nhập tài liệu.');
    const message = rawMessage.includes('The string did not match the expected pattern')
      ? 'Bộ đọc không xử lý được cấu trúc hoặc font trong PDF này. Hãy thử lưu lại thành PDF chuẩn hoặc chuyển trang bị lỗi thành ảnh.'
      : rawMessage;
    await KnowledgeImportJob.updateOne(jobFilter, {
      $set: {
        status: 'failed',
        stage: 'failed',
        message: `Nhập tài liệu thất bại: ${message}`,
        error: message,
        expiresAt: new Date(Date.now() + JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    console.error(`[${MODULE}] Job failed:`, { jobId, userId: input.userId, name: error?.name, errorCode: error?.errorCode, message, stack: error?.stack });
    appendJobLog(jobId, `Tác vụ nhập thất bại: ${message}`, 'error', { name: error?.name, errorCode: error?.errorCode });
  }
}

export async function getKnowledgeDocumentImportJob(jobId: string, userId: string) {
  const job = await KnowledgeImportJob.findOne({ _id: jobId, userId })
    .select('fileName status stage pageNumber totalPages percent message error result createdAt updatedAt')
    .lean()
    .exec();
  if (job?.status === 'processing' && Date.now() - new Date(job.updatedAt).getTime() > STALE_JOB_TIMEOUT_MS) {
    const error = 'Tác vụ không cập nhật tiến độ trong hơn 3 phút và đã được dừng. Hãy nhập lại tài liệu; nếu lỗi lặp lại, hãy lưu PDF thành bản mới rồi thử lại.';
    const result = await KnowledgeImportJob.updateOne(
      { _id: jobId, userId, status: 'processing', updatedAt: job.updatedAt },
      { $set: { status: 'failed', stage: 'failed', message: `Nhập tài liệu thất bại: ${error}`, error, expiresAt: new Date(Date.now() + JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
    );
    if (result.modifiedCount) {
      console.error(`[${MODULE}] Stale job marked failed:`, { jobId, userId, lastUpdatedAt: job.updatedAt, stage: job.stage, pageNumber: job.pageNumber, totalPages: job.totalPages });
      appendJobLog(jobId, 'Tác vụ bị đánh dấu thất bại vì không cập nhật tiến độ quá 3 phút.', 'error', { stage: job.stage, pageNumber: job.pageNumber, totalPages: job.totalPages });
    }
  }
  const latestJob = await KnowledgeImportJob.findOne({ _id: jobId, userId })
    .select('fileName status stage pageNumber totalPages percent message error result createdAt updatedAt')
    .lean()
    .exec();
  return latestJob ? { ...latestJob, logs: inMemoryJobLogs.get(jobId) || [] } : null;
}
