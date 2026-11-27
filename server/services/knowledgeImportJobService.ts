import { KnowledgeImportJob } from '../models/KnowledgeImportJob.ts';
import { KnowledgeDocumentInput, importKnowledgeDocument } from './knowledgeDocumentService.ts';
import { invalidateKnowledgeRetrievalCache } from './knowledgeRetrievalService.ts';

const MODULE = 'KnowledgeImportJob';
const JOB_RETENTION_DAYS = 7;

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
  return job._id.toString();
}

export async function runKnowledgeDocumentImportJob(jobId: string, input: KnowledgeDocumentInput): Promise<void> {
  const jobFilter = { _id: jobId, userId: input.userId };
  try {
    await KnowledgeImportJob.updateOne(jobFilter, {
      $set: { status: 'processing', stage: 'extracting', percent: 0, message: 'Đang chuẩn bị đọc tài liệu...' },
    });
    const result: KnowledgeDocumentImportJobResult = await importKnowledgeDocument({
      ...input,
      requestId: jobId,
      onProgress: async progress => {
        console.log(`[${MODULE}] Progress:`, { jobId, stage: progress.stage, page: `${progress.pageNumber}/${progress.totalPages}`, percent: progress.percent, message: progress.message });
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
  }
}

export async function getKnowledgeDocumentImportJob(jobId: string, userId: string) {
  return KnowledgeImportJob.findOne({ _id: jobId, userId })
    .select('fileName status stage pageNumber totalPages percent message error result createdAt updatedAt')
    .lean()
    .exec();
}
