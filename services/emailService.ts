/**
 * Email Service for Lucky Hub
 * Handles sending emails for password reset, notifications, etc.
 */

import nodemailer from 'nodemailer';
import { logger } from './logger.ts';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Create transporter with Gmail SMTP
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || process.env.SMTP_USER || 'luckysystem2026@gmail.com',
        pass: process.env.EMAIL_APP_PASSWORD || process.env.SMTP_PASS || 'your-app-password-here'
      }
    });

    // Verify connection
    this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      logger.info('Email', 'SMTP connection verified successfully');
    } catch (error) {
      logger.error('Email', `SMTP connection failed: ${error}`);
    }
  }

  /**
   * Send email
   */
  public async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const mailOptions = {
        from: `"Lucky Hub" <${process.env.EMAIL_USER || 'luckysystem2026@gmail.com'}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html)
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Email', `Email sent successfully to ${options.to}: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error('Email', `Failed to send email to ${options.to}: ${error}`);
      return false;
    }
  }

  /**
   * Send password reset email
   */
  public async sendPasswordResetEmail(email: string, resetToken: string, userName: string): Promise<boolean> {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    const html = `
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
              <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Lucky Hub của mình. Để đặt lại mật khẩu, vui lòng nhấp vào nút bên dưới:</p>
            </div>

            <div style="text-align: center;">
              <a href="${resetUrl}" class="reset-button">ĐẶT LẠI MẬT KHẨU</a>
            </div>

            <div class="warning">
              <div class="warning-title">⚠️ Lưu ý quan trọng</div>
              <div class="warning-text">
                • Liên kết này sẽ hết hạn sau 1 giờ<br>
                • Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này<br>
                • Liên kết chỉ có thể sử dụng một lần
              </div>
            </div>

            <div class="security-note">
              <div class="security-note-title">🔒 Thông tin bảo mật</div>
              <div class="security-note-text">
                • Lucky Hub cam kết bảo vệ thông tin cá nhân của bạn<br>
                • Mật khẩu mới sẽ được mã hóa an toàn<br>
                • Chúng tôi không bao giờ yêu cầu mật khẩu qua email
              </div>
            </div>

            <p>Nếu nút trên không hoạt động, bạn có thể sao chép và dán liên kết sau vào trình duyệt:</p>
            <p style="word-break: break-all; background-color: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">${resetUrl}</p>

            <p>Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với đội ngũ hỗ trợ của chúng tôi.</p>

            <p>Trân trọng,<br><strong>Đội ngũ Lucky Hub</strong></p>
          </div>

          <div class="footer">
            <p><strong>Lucky Hub</strong> - Chuyên gia sức khỏe của bạn</p>
            <div class="footer-links">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}">Website</a> |
              <a href="mailto:support@luckyhub.com">Hỗ trợ</a> |
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/privacy">Bảo mật</a>
            </div>
            <p style="margin-top: 15px; font-size: 12px; color: #9ca3af;">
              © 2026 Lucky Hub. Tất cả quyền được bảo lưu.<br>
              Email này được gửi tự động, vui lòng không trả lời.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Xin chào ${userName}!

      Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Lucky Hub.

      Để đặt lại mật khẩu, vui lòng truy cập liên kết sau trong vòng 1 giờ:
      ${resetUrl}

      Lưu ý:
      - Liên kết này sẽ hết hạn sau 1 giờ
      - Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này
      - Liên kết chỉ có thể sử dụng một lần

      Nếu bạn có câu hỏi, vui lòng liên hệ đội ngũ hỗ trợ.

      Trân trọng,
      Đội ngũ Lucky Hub
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Đặt lại mật khẩu - Lucky Hub',
      html,
      text
    });
  }

  /**
   * Send welcome email for new users
   */
  public async sendWelcomeEmail(email: string, userName: string): Promise<boolean> {
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;

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

  /**
   * Strip HTML tags for text version
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

// Create singleton instance
export const emailService = new EmailService();
export default emailService;
