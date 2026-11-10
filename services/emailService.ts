/**
 * Email Service for Lucky Hub
 * Dual-provider strategy:
 * - Primary: Brevo (miễn phí 300 emails/ngày vĩnh viễn)
 * - Fallback: SendGrid (miễn phí 100 emails/ngày)
 * 
 * Không cần verify domain, không bị chặn trên Render
 */

import sgMail from '@sendgrid/mail';
import { logger } from './logger.ts';
import mongoose from 'mongoose';
import { SystemSettings } from '../server/models/SystemSettings.ts';
import { decrypt } from '../server/utils/encryption.ts';

const DEFAULT_FRONTEND_URL = 'https://lucky-hub-2026.onrender.com';

const API_BREVO = 'https://api.brevo.com/v3/smtp/email';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface SendResult {
  success: boolean;
  provider: string;
  error?: string;
}

class EmailService {
  private brevoApiKey: string = '';
  private sgApiKey: string = '';
  private senderEmail: string = 'luckyhubvn@gmail.com';
  private senderName: string = 'Lucky Hub';
  private appBaseUrl: string;
  private storedSettingsLoadedAt = 0;

  constructor() {
    this.brevoApiKey = process.env.BREVO_API_KEY || '';
    this.sgApiKey = process.env.SENDGRID_API_KEY || '';
    this.senderEmail = process.env.EMAIL_FROM || 'luckyhubvn@gmail.com';
    // EMAIL_FROM_NAME có dấu ngoặc kép "Lucky Hub", cần strip để dùng trong code
    const rawName = process.env.EMAIL_FROM_NAME || 'Lucky Hub';
    this.senderName = rawName.replace(/^"|"$/g, '');
    this.appBaseUrl = (process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL).replace(/\/$/, '');

    // Khởi tạo SendGrid nếu có key
    if (this.sgApiKey && this.sgApiKey !== 'your-sendgrid-api-key-here') {
      sgMail.setApiKey(this.sgApiKey);
    }

    console.log('[EMAIL-SERVICE] Initialized:', {
      brevo: this.brevoApiKey ? '✅ configured' : '❌ not configured',
      sendgrid: this.sgApiKey && this.sgApiKey !== 'your-sendgrid-api-key-here' ? '✅ configured' : '❌ not configured',
      senderEmail: this.senderEmail,
      senderName: this.senderName,
      appBaseUrl: this.appBaseUrl
    });
  }

  private async refreshStoredSettings(): Promise<void> {
    if (mongoose.connection.readyState !== 1 || Date.now() - this.storedSettingsLoadedAt < 5000) return;
    try {
      const settings = await SystemSettings.findOne({}).select('email').lean();
      const email = settings?.email;
      if (!email) return;

      this.senderEmail = email.senderEmail || this.senderEmail;
      this.senderName = email.senderName || this.senderName;
      this.appBaseUrl = (email.appBaseUrl || this.appBaseUrl).replace(/\/$/, '');

      const providers = (email.providers || []).filter((provider: any) => provider.isActive)
        .sort((left: any, right: any) => left.priority - right.priority);
      const envBrevoKey = process.env.BREVO_API_KEY || '';
      const envSgKey = process.env.SENDGRID_API_KEY || '';
      if (providers.length > 0) {
        this.brevoApiKey = '';
        this.sgApiKey = '';
      }
      for (const provider of providers) {
        const rawKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : '';
        if (!rawKey) continue;
        if (rawKey.includes('••••')) {
          console.warn(`[EMAIL-SERVICE] ⚠️ Stored API key for provider "${provider.provider}" (${provider.label || 'no-label'}) is masked ("${rawKey}"). Falling back to environment variable if available.`);
          if (provider.provider === 'brevo' && envBrevoKey) this.brevoApiKey = envBrevoKey;
          if (provider.provider === 'sendgrid' && envSgKey && envSgKey !== 'your-sendgrid-api-key-here') {
            this.sgApiKey = envSgKey;
            sgMail.setApiKey(envSgKey);
          }
          continue;
        }
        let apiKey = rawKey;
        if (rawKey.split(':').length === 3) {
          try {
            apiKey = decrypt(rawKey);
          } catch (decErr: any) {
            console.error(`[EMAIL-SERVICE] ❌ Failed to decrypt API key for provider "${provider.provider}":`, decErr.message);
            continue;
          }
        }
        if (!apiKey) continue;
        if (provider.provider === 'brevo') this.brevoApiKey = apiKey;
        if (provider.provider === 'sendgrid') {
          this.sgApiKey = apiKey;
          sgMail.setApiKey(apiKey);
        }
      }
      if (!this.brevoApiKey && envBrevoKey && envBrevoKey !== 'your-brevo-api-key-here') {
        this.brevoApiKey = envBrevoKey;
      }
      if (!this.sgApiKey && envSgKey && envSgKey !== 'your-sendgrid-api-key-here') {
        this.sgApiKey = envSgKey;
        sgMail.setApiKey(envSgKey);
      }
      this.storedSettingsLoadedAt = Date.now();
      console.log('[EMAIL-SERVICE] 🔄 Refreshed settings from DB:', {
        senderEmail: this.senderEmail,
        senderName: this.senderName,
        activeProvidersInDb: providers.map((p: any) => `${p.provider}(${p.label || 'default'})`),
        brevoKeyReady: !!this.brevoApiKey,
        sendgridKeyReady: !!this.sgApiKey,
      });
    } catch (error: any) {
      console.error('[EMAIL-SERVICE] Failed to load stored email settings:', error.message);
      logger.error('Email', `Could not load saved email settings: ${error.message}`);
    }
  }

  private maskKeyForLog(key: string): string {
    if (!key) return '(empty)';
    if (key.length <= 10) return `${key.slice(0, 2)}***`;
    return `${key.slice(0, 6)}...${key.slice(-4)} (len=${key.length})`;
  }

  /**
   * Gửi email qua Brevo API (primary)
   */
  private async sendViaBrevo(options: EmailOptions, apiKeyOverride?: string): Promise<SendResult> {
    const activeKey = apiKeyOverride || this.brevoApiKey;
    if (!activeKey || activeKey === 'your-brevo-api-key-here') {
      console.warn('[EMAIL-SERVICE] [Brevo] Step: Skipped — API key not configured');
      return { success: false, provider: 'brevo', error: 'Brevo API key chưa được cấu hình' };
    }

    const startedAt = Date.now();
    try {
      console.log('[EMAIL-SERVICE] [Brevo] Step 1: Preparing HTTP POST to Brevo API:', {
        endpoint: API_BREVO,
        sender: { name: this.senderName, email: this.senderEmail },
        to: options.to,
        subject: options.subject,
        apiKeyPreview: this.maskKeyForLog(activeKey),
      });

      const response = await fetch(API_BREVO, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': activeKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: {
            name: this.senderName,
            email: this.senderEmail
          },
          to: [{ email: options.to }],
          subject: options.subject,
          htmlContent: options.html,
          textContent: options.text || this.stripHtml(options.html)
        })
      });

      const durationMs = Date.now() - startedAt;
      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[EMAIL-SERVICE] [Brevo] ❌ Step 2: Brevo API returned error:', {
          status: response.status,
          statusText: response.statusText,
          durationMs,
          body: errorBody,
        });
        return { success: false, provider: 'brevo', error: `Brevo HTTP ${response.status}: ${errorBody}` };
      }

      const result = await response.json();
      console.log('[EMAIL-SERVICE] [Brevo] ✅ Step 2: Brevo sent successfully:', {
        messageId: result.messageId,
        durationMs,
      });
      return { success: true, provider: 'brevo' };
    } catch (error: any) {
      const durationMs = Date.now() - startedAt;
      console.error('[EMAIL-SERVICE] [Brevo] ❌ Step 2: Brevo network/exception error:', {
        message: error.message,
        durationMs,
      });
      return { success: false, provider: 'brevo', error: `Brevo exception: ${error.message}` };
    }
  }

  /**
   * Gửi email qua SendGrid API (fallback)
   */
  private async sendViaSendGrid(options: EmailOptions, apiKeyOverride?: string): Promise<SendResult> {
    const activeKey = apiKeyOverride || this.sgApiKey;
    if (!activeKey || activeKey === 'your-sendgrid-api-key-here') {
      console.warn('[EMAIL-SERVICE] [SendGrid] Step: Skipped — API key not configured');
      return { success: false, provider: 'sendgrid', error: 'SendGrid API key chưa được cấu hình' };
    }

    const startedAt = Date.now();
    try {
      sgMail.setApiKey(activeKey);
      console.log('[EMAIL-SERVICE] [SendGrid] Step 1: Preparing request to SendGrid API:', {
        from: { email: this.senderEmail, name: this.senderName },
        to: options.to,
        subject: options.subject,
        apiKeyPreview: this.maskKeyForLog(activeKey),
      });

      const msg = {
        to: options.to,
        from: {
          email: this.senderEmail,
          name: this.senderName
        },
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html)
      };

      const [sgResponse] = await sgMail.send(msg);
      const durationMs = Date.now() - startedAt;

      console.log('[EMAIL-SERVICE] [SendGrid] ✅ Step 2: SendGrid sent successfully:', {
        statusCode: sgResponse?.statusCode,
        durationMs,
      });
      return { success: true, provider: 'sendgrid' };
    } catch (error: any) {
      const durationMs = Date.now() - startedAt;
      const sgDetail = error.response?.body ? JSON.stringify(error.response.body) : error.message;
      console.error('[EMAIL-SERVICE] [SendGrid] ❌ Step 2: SendGrid API error:', {
        message: error.message,
        code: error.code,
        durationMs,
        responseBody: error.response?.body,
      });
      return { success: false, provider: 'sendgrid', error: `SendGrid HTTP ${error.code || 'ERR'}: ${sgDetail}` };
    }
  }

  /**
   * Send email with full diagnostic steps (used by Admin Test Email & internal logging)
   */
  public async sendEmailWithDiagnostic(
    options: EmailOptions & { preferredProvider?: string; apiKeyOverride?: string }
  ): Promise<{
    success: boolean;
    providerUsed?: string;
    error?: string;
    steps: string[];
    details: Record<string, any>;
  }> {
    const steps: string[] = [];
    const startedAt = Date.now();
    const recordStep = (msg: string) => {
      const entry = `[+${Date.now() - startedAt}ms] ${msg}`;
      steps.push(entry);
      console.log(`[EMAIL-DIAGNOSTIC] ${entry}`);
    };

    recordStep(`Bắt đầu gửi email tới "${options.to}" | Tiêu đề: "${options.subject}"`);
    await this.refreshStoredSettings();
    recordStep(`Cấu hình người gửi: "${this.senderName} <${this.senderEmail}>" | Preferred provider: ${options.preferredProvider || 'auto (Brevo -> SendGrid)'}`);

    let cleanOverrideKey = options.apiKeyOverride?.trim() || '';
    if (cleanOverrideKey.includes('••••')) {
      recordStep(`⚠️ API Key truyền vào đang ở dạng bị che ("${cleanOverrideKey}"), tự động bỏ qua và dùng key gốc trong hệ thống.`);
      cleanOverrideKey = '';
    }

    const attempts: Record<string, any> = {};

    if (options.preferredProvider === 'sendgrid') {
      recordStep(`Đang thử gửi qua SendGrid (key=${this.maskKeyForLog(cleanOverrideKey || this.sgApiKey)})...`);
      const sgResult = await this.sendViaSendGrid(options, cleanOverrideKey || undefined);
      attempts.sendgrid = sgResult;
      if (sgResult.success) {
        recordStep(`✅ Gửi thành công qua SendGrid!`);
        return { success: true, providerUsed: 'sendgrid', steps, details: { attempts, durationMs: Date.now() - startedAt } };
      }
      recordStep(`❌ SendGrid thất bại: ${sgResult.error}. Chuyển sang fallback Brevo...`);
      const brevoResult = await this.sendViaBrevo(options);
      attempts.brevo = brevoResult;
      if (brevoResult.success) {
        recordStep(`✅ Gửi thành công qua Brevo (fallback)!`);
        return { success: true, providerUsed: 'brevo', steps, details: { attempts, durationMs: Date.now() - startedAt } };
      }
      recordStep(`❌ Brevo (fallback) cũng thất bại: ${brevoResult.error}`);
    } else {
      recordStep(`Đang thử gửi qua Brevo (key=${this.maskKeyForLog(cleanOverrideKey || this.brevoApiKey)})...`);
      const brevoResult = await this.sendViaBrevo(options, cleanOverrideKey || undefined);
      attempts.brevo = brevoResult;
      if (brevoResult.success) {
        recordStep(`✅ Gửi thành công qua Brevo!`);
        return { success: true, providerUsed: 'brevo', steps, details: { attempts, durationMs: Date.now() - startedAt } };
      }
      recordStep(`❌ Brevo thất bại: ${brevoResult.error}. Chuyển sang fallback SendGrid (key=${this.maskKeyForLog(this.sgApiKey)})...`);
      const sgResult = await this.sendViaSendGrid(options);
      attempts.sendgrid = sgResult;
      if (sgResult.success) {
        recordStep(`✅ Gửi thành công qua SendGrid (fallback)!`);
        return { success: true, providerUsed: 'sendgrid', steps, details: { attempts, durationMs: Date.now() - startedAt } };
      }
      recordStep(`❌ SendGrid (fallback) cũng thất bại: ${sgResult.error}`);
    }

    const combinedError = `Brevo: ${attempts.brevo?.error || 'N/A'} | SendGrid: ${attempts.sendgrid?.error || 'N/A'}`;
    logger.error('Email', `Both providers failed for ${options.to}. ${combinedError}`);
    return {
      success: false,
      error: combinedError,
      steps,
      details: { attempts, senderEmail: this.senderEmail, senderName: this.senderName, durationMs: Date.now() - startedAt },
    };
  }

  /**
   * Send email - thử Brevo trước, fallback SendGrid nếu lỗi
   */
  public async sendEmail(options: EmailOptions): Promise<boolean> {
    const diag = await this.sendEmailWithDiagnostic(options);
    return diag.success;
  }

  /**
   * Send email verification email
   */
  public async sendVerificationEmail(email: string, verificationToken: string, userName: string): Promise<boolean> {
    await this.refreshStoredSettings();
    console.log('[EMAIL-SERVICE] sendVerificationEmail called:', { email, userName, tokenLength: verificationToken.length });

    const verifyUrl = `${this.appBaseUrl}/verify-email?token=${verificationToken}`;
    console.log('[EMAIL-SERVICE] Verification URL generated:', verifyUrl);

    const html = `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Xác thực Email - Lucky Hub</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 40px 30px; text-align: center; }
          .logo { font-size: 32px; margin-bottom: 10px; }
          .title { font-size: 24px; font-weight: bold; margin: 0; }
          .content { padding: 40px 30px; color: #374151; line-height: 1.6; }
          .greeting { font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #059669; }
          .verify-button { display: inline-block; background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 20px 0; }
          .note { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; font-size: 14px; }
          .footer { background-color: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🍀</div>
            <h1 class="title">Xác thực Email</h1>
          </div>
          <div class="content">
            <div class="greeting">Xin chào ${userName}!</div>
            <p>Cảm ơn bạn đã đăng ký tài khoản <strong>Lucky Hub</strong>.</p>
            <p>Vui lòng nhấp vào nút bên dưới để xác thực địa chỉ email của bạn:</p>
            <div style="text-align: center;">
              <a href="${verifyUrl}" class="verify-button">XÁC THỰC EMAIL</a>
            </div>
            <div class="note">
              <strong>⏰ Liên kết có hiệu lực trong 24 giờ.</strong><br>
              Nếu bạn không đăng ký tài khoản Lucky Hub, vui lòng bỏ qua email này.
            </div>
            <p>Trân trọng,<br><strong>Đội ngũ Lucky Hub</strong></p>
          </div>
          <div class="footer">
            <p><strong>Lucky Hub</strong> - Chuyên gia sức khỏe của bạn</p>
            <p style="margin-top: 15px; font-size: 12px; color: #9ca3af;">© 2026 Lucky Hub. Tất cả quyền được bảo lưu.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `Xin chào ${userName}!\n\nCảm ơn bạn đã đăng ký tài khoản Lucky Hub.\n\nVui lòng truy cập liên kết sau để xác thực email (có hiệu lực trong 24 giờ):\n${verifyUrl}\n\nTrân trọng,\nĐội ngũ Lucky Hub`;

    const result = await this.sendEmail({
      to: email,
      subject: 'Xác thực email - Lucky Hub',
      html,
      text
    });
    console.log('[EMAIL-SERVICE] sendVerificationEmail result:', result);
    return result;
  }

  /**
   * Send password reset email
   */
  public async sendPasswordResetEmail(email: string, resetToken: string, userName: string): Promise<boolean> {
    await this.refreshStoredSettings();
    console.log('[EMAIL-SERVICE] sendPasswordResetEmail called:', { email, userName, tokenLength: resetToken.length });

    const resetUrl = `${this.appBaseUrl}/reset-password?token=${resetToken}`;
    console.log('[EMAIL-SERVICE] Reset URL generated:', resetUrl);

    const html = this.getResetEmailHtml(resetUrl, userName);
    const text = this.getResetEmailText(resetUrl, userName);

    console.log('[EMAIL-SERVICE] About to call sendEmail with:', { to: email, subject: 'Đặt lại mật khẩu - Lucky Hub' });
    const result = await this.sendEmail({
      to: email,
      subject: 'Đặt lại mật khẩu - Lucky Hub',
      html,
      text
    });
    console.log('[EMAIL-SERVICE] sendEmail result:', result);

    return result;
  }

  /**
   * Send welcome email for new users
   */
  public async sendWelcomeEmail(email: string, userName: string): Promise<boolean> {
    await this.refreshStoredSettings();
    const loginUrl = `${this.appBaseUrl}/login`;

    const html = `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chào mừng đến với Lucky Hub</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 40px 30px; text-align: center; }
          .logo { font-size: 32px; margin-bottom: 10px; }
          .title { font-size: 24px; font-weight: bold; margin: 0; }
          .content { padding: 40px 30px; color: #374151; line-height: 1.6; }
          .greeting { font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #059669; }
          .welcome-button { display: inline-block; background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 20px 0; }
          .features { background-color: #f0fdf4; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .features h3 { color: #059669; margin-top: 0; }
          .features ul { margin: 10px 0; padding-left: 20px; }
          .features li { margin: 5px 0; }
          .footer { background-color: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🍀</div>
            <h1 class="title">Chào mừng đến với Lucky Hub!</h1>
          </div>

          <div class="content">
            <div class="greeting">Xin chào ${userName}!</div>

            <p>Chúc mừng bạn đã trở thành thành viên của <strong>Lucky Hub</strong> - nền tảng quản lý sức khỏe hàng đầu!</p>

            <div style="text-align: center;">
              <a href="${loginUrl}" class="welcome-button">BẮT ĐẦU NGAY</a>
            </div>

            <div class="features">
              <h3>✨ Những gì bạn có thể làm:</h3>
              <ul>
                <li><strong>📊 Theo dõi chỉ số sức khỏe:</strong> Cân nặng, mỡ cơ thể, cơ bắp, nước trong cơ thể</li>
                <li><strong>🤖 AI Lucky:</strong> Phân tích ảnh InBody, tư vấn sức khỏe cá nhân hóa</li>
                <li><strong>🌍 Cộng đồng:</strong> Kết nối với những người có cùng mục tiêu sức khỏe</li>
                <li><strong>🏆 Badge system:</strong> Đạt được các thành tích và huy hiệu đặc biệt</li>
                <li><strong>📱 Magic Mirror:</strong> Hiển thị thông tin sức khỏe trên gương thông minh</li>
              </ul>
            </div>

            <p><strong>Mẹo nhỏ:</strong> Hãy bắt đầu bằng việc cập nhật chỉ số cơ thể đầu tiên để AI Lucky có thể đưa ra lời khuyên phù hợp nhất cho bạn!</p>

            <p>Chúc bạn có một hành trình sức khỏe tuyệt vời cùng Lucky Hub!</p>

            <p>Trân trọng,<br><strong>Đội ngũ Lucky Hub</strong></p>
          </div>

          <div class="footer">
            <p><strong>Lucky Hub</strong> - Chuyên gia sức khỏe của bạn</p>
            <p style="margin-top: 15px; font-size: 12px; color: #9ca3af;">
              © 2026 Lucky Hub. Tất cả quyền được bảo lưu.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Chào mừng đến với Lucky Hub!',
      html
    });
  }

  private getResetEmailHtml(resetUrl: string, userName: string): string {
    return `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Đặt lại mật khẩu - Lucky Hub</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 40px 30px; text-align: center; }
          .logo { font-size: 32px; margin-bottom: 10px; }
          .title { font-size: 24px; font-weight: bold; margin: 0; }
          .content { padding: 40px 30px; color: #374151; line-height: 1.6; }
          .greeting { font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #059669; }
          .message { margin-bottom: 30px; }
          .reset-button { display: inline-block; background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 20px 0; }
          .reset-button:hover { background: linear-gradient(135deg, #047857, #059669); }
          .warning { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; }
          .warning-title { font-weight: bold; color: #92400e; margin-bottom: 5px; }
          .warning-text { color: #78350f; font-size: 14px; }
          .footer { background-color: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; }
          .footer-links { margin-top: 15px; }
          .footer-links a { color: #059669; text-decoration: none; margin: 0 10px; }
          .footer-links a:hover { text-decoration: underline; }
          .security-note { background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 15px; margin: 20px 0; }
          .security-note-title { font-weight: bold; color: #065f46; margin-bottom: 5px; }
          .security-note-text { color: #047857; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🍀</div>
            <h1 class="title">Lucky Hub</h1>
            <p>Nền tảng Sức khỏe của bạn</p>
          </div>
          <div class="content">
            <div class="greeting">Xin chào ${userName}!</div>
            <div class="message">
              <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Lucky Hub của mình. Vui lòng nhấp vào nút bên dưới để đặt lại mật khẩu:</p>
            </div>
            <div style="text-align: center;">
              <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#10b981);color:white;padding:15px 30px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;margin:20px 0">ĐẶT LẠI MẬT KHẨU</a>
            </div>

            <div class="warning">
              <div class="warning-title">⚠️ Bạn không yêu cầu đặt lại mật khẩu?</div>
              <div class="warning-text">
                Nếu bạn <strong>không</strong> yêu cầu đặt lại mật khẩu, vui lòng <strong>bỏ qua email này</strong>. Tài khoản của bạn vẫn an toàn và không có thay đổi nào được thực hiện.
              </div>
            </div>

            <div class="security-note">
              <div class="security-note-title">🔒 Liên kết khôi phục mật khẩu hợp lệ</div>
              <div class="security-note-text">
                • Liên kết: <a href="${resetUrl}" style="color:#059669;word-break:break-all">${resetUrl}</a><br>
                • Liên kết này sẽ hết hạn sau <strong>1 giờ</strong><br>
                • Liên kết chỉ có thể sử dụng <strong>một lần</strong>
              </div>
            </div>

            <p>Trân trọng,<br><strong>Đội ngũ Lucky Hub</strong></p>
          </div>

          <div class="footer">
            <p><strong>Lucky Hub</strong> - Chuyên gia sức khỏe của bạn</p>
            <p style="margin-top: 15px; font-size: 12px; color: #9ca3af;">
              © 2026 Lucky Hub. Tất cả quyền được bảo lưu.<br>
              Email này được gửi tự động, vui lòng không trả lời.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getResetEmailText(resetUrl: string, userName: string): string {
    return `
      Xin chào ${userName}!

      Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Lucky Hub.

      Để đặt lại mật khẩu, vui lòng truy cập liên kết sau (có hiệu lực trong 1 giờ):
      ${resetUrl}

      ⚠️ Nếu bạn KHÔNG yêu cầu đặt lại mật khẩu, vui lòng BỎ QUA email này.
      Tài khoản của bạn vẫn an toàn.

      Trân trọng,
      Đội ngũ Lucky Hub
    `;
  }

  /**
   * Send registration success email with login credentials
   */
  public async sendRegistrationEmail(email: string, userName: string, loginId: string, password: string): Promise<boolean> {
    await this.refreshStoredSettings();
    console.log('[EMAIL-SERVICE] sendRegistrationEmail called:', { email, userName });

    const loginUrl = `${this.appBaseUrl}/login`;
    const homeUrl = this.appBaseUrl;

    const html = `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Đăng ký thành công - Lucky Hub</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 40px 30px; text-align: center; }
          .logo { font-size: 32px; margin-bottom: 10px; }
          .title { font-size: 24px; font-weight: bold; margin: 0; }
          .content { padding: 40px 30px; color: #374151; line-height: 1.6; }
          .greeting { font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #059669; }
          .info-box { background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 20px; margin: 20px 0; }
          .info-box h3 { color: #059669; margin: 0 0 15px 0; font-size: 16px; }
          .info-row { display: flex; padding: 8px 0; border-bottom: 1px dashed #d1fae5; }
          .info-row:last-child { border-bottom: none; }
          .info-label { font-weight: bold; color: #065f46; width: 120px; min-width: 120px; }
          .info-value { color: #374151; word-break: break-all; }
          .login-button { display: inline-block; background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 20px 0; }
          .warning { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; font-size: 14px; }
          .footer { background-color: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🍀</div>
            <h1 class="title">Đăng ký thành công!</h1>
          </div>
          <div class="content">
            <div class="greeting">Xin chào ${userName}!</div>
            <p>Cảm ơn bạn đã đăng ký tài khoản <strong>Lucky Hub</strong> - Nền tảng quản lý dinh dưỡng thông minh.</p>

            <div class="info-box">
              <h3>📋 Thông tin tài khoản</h3>
              <div class="info-row">
                <span class="info-label">Tên đăng nhập:</span>
                <span class="info-value">${loginId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Mật khẩu:</span>
                <span class="info-value">${password}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Trang chủ:</span>
                <span class="info-value"><a href="${homeUrl}" style="color:#059669;">${homeUrl}</a></span>
              </div>
            </div>

            <div style="text-align: center;">
              <a href="${loginUrl}" class="login-button">ĐĂNG NHẬP NGAY</a>
            </div>

            <div class="warning">
              <strong>🔒 Vui lòng bảo mật thông tin này.</strong><br>
              Không chia sẻ mật khẩu cho người khác. Nếu bạn nhận được email này do nhầm lẫn, vui lòng bỏ qua.
            </div>

            <p>Trân trọng,<br><strong>Đội ngũ Lucky Hub</strong></p>
          </div>
          <div class="footer">
            <p><strong>Lucky Hub</strong> - Chuyên gia sức khỏe của bạn</p>
            <p style="margin-top: 15px; font-size: 12px; color: #9ca3af;">© 2026 Lucky Hub. Tất cả quyền được bảo lưu.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `Xin chào ${userName}!\n\nCảm ơn bạn đã đăng ký tài khoản Lucky Hub.\n\nThông tin tài khoản:\n- Tên đăng nhập: ${loginId}\n- Mật khẩu: ${password}\n- Trang chủ: ${homeUrl}\n\nVui lòng đăng nhập tại: ${loginUrl}\n\n🔒 Vui lòng bảo mật thông tin này.\n\nTrân trọng,\nĐội ngũ Lucky Hub`;

    return await this.sendEmail({
      to: email,
      subject: 'Đăng ký thành công - Lucky Hub',
      html,
      text
    });
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

// Create singleton instance
export const emailService = new EmailService();
export default emailService;
