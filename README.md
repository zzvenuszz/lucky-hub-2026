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

## Quản lý kho hàng và bán hàng

Lucky Hub có khu vực bán hàng với kho riêng cho từng người bán. Quản trị viên gán các quyền trong **Quản trị → Nhóm & phân quyền**:

| Quyền | Chức năng |
|---|---|
| `inventory:manage` | Quản lý kho riêng, nhập và điều chỉnh tồn, bán hàng, xem hoá đơn và báo cáo của mình |
| `pricelist:manage` | Tạo phiên bản bảng giá chung và đặt thời điểm bắt đầu áp dụng |
| `members:level:manage` | Cập nhật cấp độ hội viên trong các tuyến dưới được bảo trợ |

Ba quyền này độc lập. Có quyền quản lý kho không tự cấp quyền sửa bảng giá chung hoặc cấp độ hội viên. Người bán chỉ truy cập và thao tác trên kho của mình.

### Bắt đầu sử dụng

1. Quản trị viên cấp các quyền phù hợp qua nhóm phân quyền.
2. Hội viên cập nhật mã thẻ trong **Hồ sơ cá nhân**. Mã được chấp nhận theo dạng `VA12345678` hoặc `VNY1234567`; có thể nhập mã người bảo trợ tại cùng trang. Cấp độ chỉ được người có quyền quản lý cấp độ trong tuyến trên thay đổi.
3. Người bán mở **Quản lý hàng hoá**, tạo SKU, tên hàng, PV, ảnh và ngưỡng cảnh báo tồn (mặc định 5). Khi nhập hàng, ghi số lượng và giá vốn thực tế để hệ thống lưu thành lô.
4. Người có quyền `pricelist:manage` tạo bảng giá chung cho SKU với giá nhập tham chiếu và các mức **Giá 100%**, **Giá 25%**, **Giá 35%**, **Giá 42%**, **Giá 50%**. Đây là tên các mức giá; giá tiền được nhập trực tiếp. Mỗi lần cập nhật tạo phiên bản có thời gian hiệu lực, dùng cả khi ghi nhận giao dịch bán bổ sung trong quá khứ.
5. Tạo đơn cho hội viên, khách lẻ hoặc tên tuỳ chỉnh. Giá được gợi ý theo cấp hội viên và có thể điều chỉnh trên đơn. Có thể thêm ghi chú, xem lịch sử, đổi người mua có lưu dấu vết, huỷ đơn hoặc hoàn một phần/toàn bộ hàng với lý do.
6. Xem trước hoá đơn, xuất ảnh PNG hoặc in/lưu PDF. Người bán có thể lưu định dạng mặc định cùng tên cửa hàng, số điện thoại và địa chỉ. Kết nối máy in Bluetooth chưa thuộc giai đoạn này.

Hoá đơn có mã dạng `LK-DDMMYYYY-HHMM-XXXX`. Hoá đơn gốc và lịch sử chỉnh sửa/hoàn hàng được giữ lại; khi đổi người mua, báo cáo mua hàng và PV chuyển sang hội viên mới tại kỳ bán ban đầu, còn giá và PV đã ghi trên hoá đơn không đổi.

### Kiểm tra giao diện

Playwright chạy smoke test trên desktop Chromium và viewport điện thoại:

```bash
npm run test:e2e
```

Các luồng cần tài khoản được cấp quyền có thể bật bằng `E2E_EMAIL` và `E2E_PASSWORD`. Luồng tạo dữ liệu kiểm thử yêu cầu thêm `E2E_RUN_MUTATING=1` và tài khoản có cả `inventory:manage` lẫn `pricelist:manage`.

## Cấu hình Magic Mirror

1. Đăng nhập Lucky Hub bằng tài khoản quản trị, mở **Cài đặt Hệ thống → CẤU HÌNH MAGIC MIRROR** và tạo token riêng cho từng thiết bị. Có thể đặt ngày hết hạn; để trống nếu token không hết hạn.
2. Sao chép token mới tạo và cấu hình cùng giá trị vào `apiToken` trong cấu hình của cả `MMM-LuckyHub-FaceSync` và `MMM-LuckyHub`. Không commit token vào Git; với server từ xa, chỉ kết nối qua HTTPS.
3. Token được lưu mã hóa trong database và xác thực bằng hash cho cả API lẫn kết nối WebSocket của Magic Mirror. Hai module tự gửi token từ `apiToken` dưới dạng `Authorization: Bearer <token>`. Dùng **Copy token** để sao chép lại, **Chặn/Cho phép** để bật hoặc thu hồi quyền kết nối, hoặc sửa/xóa token trong trang quản trị. Token bị tắt hoặc hết hạn sẽ không được chấp nhận.
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
