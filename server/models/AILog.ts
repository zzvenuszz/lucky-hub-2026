/**
 * AILog Model
 * Comprehensive logging for all AI requests with debug payload support
 */

import mongoose from 'mongoose';

const UsageSchema = new mongoose.Schema({
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  costUsd: { type: Number, default: 0 },
}, { _id: false });

const ModelOptionTriedSchema = new mongoose.Schema({
  providerId: { type: String },
  providerName: { type: String },
  modelId: { type: String },
  apiKeyLabel: { type: String },
  error: { type: String },
  errorCode: { type: String },
  durationMs: { type: Number },
}, { _id: false });

const DebugPayloadSchema = new mongoose.Schema({
  requestPayload: { type: mongoose.Schema.Types.Mixed },
  responsePayload: { type: mongoose.Schema.Types.Mixed },
  modelOptionsTried: { type: [ModelOptionTriedSchema], default: [] },
}, { _id: false });

const AILogSchema = new mongoose.Schema({
  // Request identification
  requestId: { type: String, required: true, index: true },
  taskType: {
    type: String,
    required: true,
    index: true,
    enum: ['chat', 'coach', 'vision', 'verify', 'food', 'meal-plan', 'embedding']
  },
  userId: { type: String, index: true },
  timestamp: { type: Date, default: Date.now },

  // Provider/Model/Key used
  providerId: { type: String, index: true },
  providerName: { type: String },
  modelId: { type: String },
  apiKeyLabel: { type: String }, // Masked label, never the actual key

  // Timing
  durationMs: { type: Number, default: 0 },
  queueTimeMs: { type: Number, default: 0 }, // Time waiting due to rate limits/cooldowns

  // Result
  status: {
    type: String,
    required: true,
    index: true,
    enum: ['success', 'error', 'fallback', 'rate_limited', 'timeout', 'cancelled']
  },
  fallbackFrom: { type: String }, // "provider/model" that we fell back from
  fallbackAttempt: { type: Number, default: 0 }, // Which fallback attempt (1, 2, 3...)

  // Error details
  errorCode: { type: String, index: true }, // 'AI_RATE_LIMIT', 'AI_TIMEOUT', 'AI_INVALID_KEY', 'AI_NO_MODELS', 'AI_GATEWAY_ERROR'
  errorMessage: { type: String },
  httpStatus: { type: Number },

  // Token usage & cost
  usage: { type: UsageSchema, default: {} },

  // Debug payload (only populated when debugMode = true)
  debug: { type: DebugPayloadSchema },

  // Log level
  logLevel: {
    type: String,
    enum: ['info', 'warn', 'error', 'debug'],
    default: 'info',
    index: true
  },
}, { timestamps: true });

// Compound indexes for common queries
AILogSchema.index({ timestamp: -1, status: 1 });
AILogSchema.index({ taskType: 1, timestamp: -1 });
AILogSchema.index({ providerId: 1, timestamp: -1 });
AILogSchema.index({ userId: 1, timestamp: -1 });
AILogSchema.index({ logLevel: 1, timestamp: -1 });

// TTL index - auto delete logs older than 30 days
export const AI_LOG_RETENTION_SECONDS = 30 * 24 * 60 * 60;
AILogSchema.index({ timestamp: 1 }, { expireAfterSeconds: AI_LOG_RETENTION_SECONDS });

// Virtual for formatted duration
AILogSchema.virtual('durationFormatted').get(function() {
  if (this.durationMs < 1000) return `${this.durationMs}ms`;
  return `${(this.durationMs / 1000).toFixed(2)}s`;
});

// Virtual for status display
AILogSchema.virtual('statusDisplay').get(function() {
  const icons: Record<string, string> = {
    success: '✅',
    error: '❌',
    fallback: '🔄',
    rate_limited: '⚠️',
    timeout: '⏱️',
    cancelled: '🚫',
  };
  return `${icons[this.status] || '❓'} ${this.status}`;
});

// Static method to get logs with filters
AILogSchema.statics.getLogs = async function(filters: {
  page?: number;
  limit?: number;
  taskType?: string;
  providerId?: string;
  status?: string;
  userId?: string;
  requestId?: string;
  startDate?: Date;
  endDate?: Date;
  logLevel?: string;
} = {}) {
  const { page = 1, limit = 50, ...queryFilters } = filters;
  const query: any = {};

  if (queryFilters.taskType) query.taskType = queryFilters.taskType;
  if (queryFilters.providerId) query.providerId = queryFilters.providerId;
  if (queryFilters.status) query.status = queryFilters.status;
  if (queryFilters.userId) query.userId = queryFilters.userId;
  if (queryFilters.requestId) query.requestId = queryFilters.requestId;
  if (queryFilters.logLevel) query.logLevel = queryFilters.logLevel;

  if (queryFilters.startDate || queryFilters.endDate) {
    query.timestamp = {};
    if (queryFilters.startDate) query.timestamp.$gte = queryFilters.startDate;
    if (queryFilters.endDate) query.timestamp.$lte = queryFilters.endDate;
  }

  const [logs, total] = await Promise.all([
    this.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    this.countDocuments(query)
  ]);

  return { logs, total, page, limit };
};

// Static method to get stats for dashboard
AILogSchema.statics.getStats = async function(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [
    totalStats,
    byTaskType,
    byProvider,
    byStatus,
    byHour
  ] = await Promise.all([
    // Overall stats
    this.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: {
        _id: null,
        totalRequests: { $sum: 1 },
        successCount: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        errorCount: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
        fallbackCount: { $sum: { $cond: [{ $eq: ['$status', 'fallback'] }, 1, 0] } },
        rateLimitedCount: { $sum: { $cond: [{ $eq: ['$status', 'rate_limited'] }, 1, 0] } },
        avgDuration: { $avg: '$durationMs' },
        totalTokens: { $sum: '$usage.totalTokens' },
        totalCost: { $sum: '$usage.costUsd' },
      }}
    ]),

    // By task type
    this.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: {
        _id: '$taskType',
        count: { $sum: 1 },
        successCount: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        avgDuration: { $avg: '$durationMs' },
        totalTokens: { $sum: '$usage.totalTokens' },
        totalCost: { $sum: '$usage.costUsd' },
      }},
      { $sort: { count: -1 } }
    ]),

    // By provider
    this.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: {
        _id: '$providerName',
        count: { $sum: 1 },
        successCount: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        avgDuration: { $avg: '$durationMs' },
        totalTokens: { $sum: '$usage.totalTokens' },
        totalCost: { $sum: '$usage.costUsd' },
      }},
      { $sort: { count: -1 } }
    ]),

    // By status
    this.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgDuration: { $avg: '$durationMs' },
      }},
      { $sort: { count: -1 } }
    ]),

    // By hour (for chart)
    this.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp' } },
        count: { $sum: 1 },
        successCount: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        avgDuration: { $avg: '$durationMs' },
      }},
      { $sort: { _id: 1 } }
    ])
  ]);

  return {
    overview: totalStats[0] || {},
    byTaskType,
    byProvider,
    byStatus,
    byHour,
  };
};

// Static method to clean old logs
AILogSchema.statics.cleanOldLogs = async function(olderThanDays = 30) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await this.deleteMany({ timestamp: { $lt: cutoff } });
  return result.deletedCount;
};

export interface AILogDoc extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  requestId: string;
  taskType: 'chat' | 'coach' | 'vision' | 'verify' | 'food' | 'meal-plan' | 'embedding';
  userId?: string;
  timestamp: Date;
  providerId: string;
  providerName: string;
  modelId: string;
  apiKeyLabel: string;
  durationMs: number;
  queueTimeMs: number;
  status: 'success' | 'error' | 'fallback' | 'rate_limited' | 'timeout' | 'cancelled';
  fallbackFrom?: string;
  fallbackAttempt: number;
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  debug?: {
    requestPayload?: any;
    responsePayload?: any;
    modelOptionsTried?: Array<{
      providerId: string;
      providerName: string;
      modelId: string;
      apiKeyLabel: string;
      error: string;
      errorCode: string;
      durationMs: number;
    }>;
  };
  logLevel: 'info' | 'warn' | 'error' | 'debug';
  createdAt: Date;
  updatedAt: Date;
}

/** Filters accepted by the getLogs static */
export interface AILogFilters {
  page?: number;
  limit?: number;
  taskType?: string;
  providerId?: string;
  status?: string;
  userId?: string;
  requestId?: string;
  startDate?: Date;
  endDate?: Date;
  logLevel?: string;
}

/** Static methods declared on AILogSchema */
export interface AILogStatics extends mongoose.Model<AILogDoc> {
  getLogs(filters?: AILogFilters): Promise<{ logs: any[]; total: number; page: number; limit: number }>;
  getStats(hours?: number): Promise<any>;
  cleanOldLogs(olderThanDays?: number): Promise<number>;
}

export const AILog = mongoose.model<AILogDoc, AILogStatics>('AILog', AILogSchema);