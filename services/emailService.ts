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

  /**
   * Gửi email qua Brevo API (primary)
   */
  private async sendViaBrevo(options: EmailOptions): Promise<SendResult> {
    if (!this.brevoApiKey || this.brevoApiKey === 'your-brevo-api-key-here') {
      return { success: false, provider: 'brevo', error: 'API key not configured' };
    }

    try {
      console.log('[EMAIL-SERVICE] Sending via Brevo...');

      const response = await fetch(API_BREVO, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': this.brevoApiKey,
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

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[EMAIL-SERVICE] Brevo API error:', { status: response.status, body: errorBody });
        return { success: false, provider: 'brevo', error: `HTTP ${response.status}: ${errorBody}` };
      }

      const result = await response.json();
      console.log('[EMAIL-SERVICE] Brevo sent successfully:', { messageId: result.messageId });
      return { success: true, provider: 'brevo' };
    } catch (error: any) {
      console.error('[EMAIL-SERVICE] Brevo send failed:', error.message);
      return { success: false, provider: 'brevo', error: error.message };
    }
  }

  /**
   * Gửi email qua SendGrid API (fallback)
   */
  private async sendViaSendGrid(options: EmailOptions): Promise<SendResult> {
    if (!this.sgApiKey || this.sgApiKey === 'your-sendgrid-api-key-here') {
      return { success: false, provider: 'sendgrid', error: 'API key not configured' };
    }

    try {
      console.log('[EMAIL-SERVICE] Sending via SendGrid (fallback)...');

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

      await sgMail.send(msg);

      console.log('[EMAIL-SERVICE] SendGrid sent successfully');
      return { success: true, provider: 'sendgrid' };
    } catch (error: any) {
      console.error('[EMAIL-SERVICE] SendGrid error:', {
        message: error.message,
        code: error.code,
        response: error.response?.body
      });
      return { success: false, provider: 'sendgrid', error: error.message };
    }
  }

  /**
   * Send email - thử Brevo trước, fallback SendGrid nếu lỗi
   */
  public async sendEmail(options: EmailOptions): Promise<boolean> {
    console.log('[EMAIL-SERVICE] sendEmail called with:', { to: options.to, subject: options.subject });

    // 1. Thử Brevo trước
    const brevoResult = await this.sendViaBrevo(options);
    if (brevoResult.success) {
      logger.info('Email', `Sent via Brevo to ${options.to}`);
      return true;
    }

    console.log('[EMAIL-SERVICE] Brevo failed, trying SendGrid fallback...', brevoResult.error);

    // 2. Fallback sang SendGrid
    const sgResult = await this.sendViaSendGrid(options);
    if (sgResult.success) {
      logger.info('Email', `Sent via SendGrid (fallback) to ${options.to}`);
      return true;
    }

    // 3. Cả 2 đều fail
    console.error('[EMAIL-SERVICE] Both providers failed:', { brevo: brevoResult.error, sendgrid: sgResult.error });
    logger.error('Email', `Both providers failed for ${options.to}. Brevo: ${brevoResult.error}. SendGrid: ${sgResult.error}`);
    return false;
  }

  /**
   * Send password reset email
   */
  public async sendPasswordResetEmail(email: string, resetToken: string, userName: string): Promise<boolean> {
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

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

// Create singleton instance
export const emailService = new EmailService();
export default emailService;