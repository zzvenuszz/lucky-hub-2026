---
title: Lucky Hub 2026
emoji: 🚀
colorFrom: blue
colorTo: green
sdk: docker
app_file: Dockerfile
pinned: false
---

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/deadf569-6a8d-4c68-a9a7-e339eb5ce291

## Run Locally

**Prerequisites:** Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Cấu hình Magic Mirror

1. Đăng nhập Lucky Hub bằng tài khoản quản trị, mở **Cài đặt Hệ thống → CẤU HÌNH MAGIC MIRROR** và tạo token riêng cho từng thiết bị. Có thể đặt ngày hết hạn; để trống nếu token không hết hạn.
2. Sao chép token mới tạo và cấu hình cùng giá trị vào `apiToken` trong cấu hình của cả `MMM-LuckyHub-FaceSync` và `MMM-LuckyHub`. Không commit token vào Git; với server từ xa, chỉ kết nối qua HTTPS.
3. Token được lưu mã hóa trong database và xác thực bằng hash. Dùng **Copy token** để sao chép lại, **Chặn/Cho phép** để bật hoặc thu hồi quyền kết nối, hoặc sửa/xóa token trong trang quản trị. Token bị tắt hoặc hết hạn sẽ không được chấp nhận.
4. Server cần có `AI_ENCRYPTION_KEY` hợp lệ để lưu token mã hóa. Gemini API key không được gửi xuống thiết bị; lời chào được tạo qua server.

Ví dụ cấu hình trong `config.js` Magic Mirror (thay URL và token bằng giá trị của bạn):

```js
modules: [
  {
    module: "MMM-LuckyHub-FaceSync",
    config: {
      baseUrl: "https://your-lucky-hub-host",
      apiToken: "PASTE_TOKEN_HERE"
    }
  },
  {
    module: "MMM-LuckyHub",
    config: {
      baseUrl: "https://your-lucky-hub-host",
      apiToken: "PASTE_TOKEN_HERE"
    }
  }
]
```

Nếu nâng cấp từ cấu hình token cũ, hãy tạo token trong trang quản trị rồi cập nhật cấu hình của cả hai module trước khi kết nối lại.

## Cấu hình thông tin thương hiệu

Quản trị viên mở **Cài đặt Hệ thống → THÔNG TIN CƠ BẢN** để cập nhật slogan và hai dòng copyright. Logo được chọn, xem trước/cắt vuông trong trang này; khi lưu, ảnh được tải lên storage provider đang bật. Nếu có nhiều provider bật, provider có giá trị Priority nhỏ nhất được chọn.

Logo hỗ trợ ImgBB (API Key), Cloudinary (Cloud Name, API Key và API Secret) hoặc S3 (Access Key, Secret Key, Bucket và Region). Với S3, bucket cần có bucket policy cho phép đọc công khai đối với các object trong `branding/*` để trình duyệt hiển thị URL đã lưu. Các thông tin bí mật của storage được mã hóa bằng `AI_ENCRYPTION_KEY`.

Placeholder `<year>` trong mỗi dòng copyright được thay bằng năm hiện tại khi hiển thị. Ví dụ `© 2025-<year> Lucky Hub` sẽ hiển thị thành `© 2025- 2026 Lucky Hub` trong năm 2026.

# maping hiện tại:
# RENDER:
# ACC: huyhoan76
# Uptimerobot: huyhoan76
# https://lucky-hub-2026.onrender.com

# HUGGING FACE:
# Acc: luckyhubvn
# Uptimerobot: luckyhubvn
# https://luckyhubvn-lucky-hub-2026.hf.space
