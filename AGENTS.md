# Lucky Hub 2026 - AI Agent Development Guide

**Ngôn ngữ: Tiếng Việt | Phiên bản: 1.0**

## 📋 Nguyên tắc chung khi làm việc với Dự án

### ✅ PHẢI tuân theo
1. **Luôn trả lời bằng tiếng Việt** - Tất cả thảo luận, phân tích và giải thích
2. **Phân tích nguyên nhân trước khi sửa** - Luôn giải thích vấn đề, nguyên nhân và hướng giải quyết
3. **Xin xác nhận trước khi thay đổi code** - Không tự ý sửa mà phải chờ phê duyệt từ người dùng
4. **Kiểm tra code trước & sau khi sửa** - Đảm bảo tính toàn vẹn code, không có regression
5. **Chỉ làm công việc được yêu cầu** - Không tự ý thêm/bớt chức năng ngoài yêu cầu
6. **Tạo logs cho các chức năng** - Tiện theo dõi hoạt động của hệ thống

### ❌ KHÔNG được phép
- ❌ Xóa hoặc thay đổi endpoint hiện tại
- ❌ Thay đổi chức năng hoặc logic không liên quan đến yêu cầu
- ❌ Sửa giao diện/UI mà không được yêu cầu
- ❌ Tự ý thêm chức năng mới ngoài phạm vi yêu cầu
- ❌ Chỉnh sửa những file không liên quan

---

## 🏗️ Kiến trúc & Tổ chức File

### Cấu trúc hiện tại (Feature-based)
```
lucky-hub-2026/
├── components/
│   ├── auth/              (Login, Register)
│   ├── dashboard/         (Dashboard, MetricForm, TrendChart)
│   ├── admin/             (AdminPanel, AITraining, UserManagement)
│   ├── chat/              (ChatSystem, ChatWindow, ContactList)
│   ├── newsfeed/          (NewsFeed, PostCreator, PostItem)
│   ├── profile/           (Profile, AvatarEditor)
│   └── system/            (Layout, BadgeDisplay, SystemLog)
├── services/              (database.ts, gemini.ts)
├── utils/                 (formatters.ts, helpers)
├── types.ts               (Enums, Interfaces)
└── server.ts              (Express backend)
```

### 📌 Quy tắc tổ chức file mới
1. **Luôn tạo file phụ riêng biệt** cho từng chức năng
2. **Đặt tên file theo chức năng** (ví dụ: `UserService.ts`, `LoggerUtil.ts`)
3. **Tạo thư mục con** để chứa các file con (ví dụ: `admin/services/`, `dashboard/hooks/`)
4. **Include/import file phụ** vào file chính để tiện phát triển theo kiểu module
5. **Không modify những file khác** khi chỉnh sửa chức năng

Ví dụ:
```
components/dashboard/
├── Dashboard.tsx        (file chính, import các component phụ)
├── components/
│   ├── StatCards.tsx
│   └── TrendChart.tsx
├── hooks/
│   ├── useDashboardData.ts
│   └── useMetricCalculation.ts
└── utils/
    └── dashboardHelpers.ts
```

---

## ⚛️ Quy ước Code React & TypeScript

### Component Pattern
```typescript
import React, { memo } from 'react';

interface Props {
  // Props definition
}

const MyComponent: React.FC<Props> = memo(({ prop1, prop2 }) => {
  // Component implementation
  return <div>{prop1}</div>;
});

MyComponent.displayName = 'MyComponent'; // For debugging

export default MyComponent;
```

**Yêu cầu:**
- ✅ Sử dụng `React.memo()` cho các component phụ để tránh re-render không cần thiết
- ✅ Đặt `displayName` cho components (giúp debug dễ dàng hơn)
- ✅ Sử dụng TypeScript interface cho Props
- ✅ Destructure props trong parameter

### State Management
- Sử dụng React Hooks: `useState`, `useCallback`, `useEffect`, `useMemo`
- Tránh inline function trong render (sử dụng `useCallback`)
- Cleanup effect dependencies đúng cách

### Type Safety
- **LƯU Ý**: Project dùng `strict: false` trong tsconfig.json
- Vẫn phải tạo interface/type cho tất cả Props, return values
- Không lạm dụng `any`, dùng `unknown` nếu cần

---

## 🔍 Logging & Monitoring

### Tiêu chuẩn Logging
Tất cả chức năng phải có logs để theo dõi:

```typescript
// Ở đầu hàm
console.log(`[FeatureName] Action started:`, { userId, action });

// Khi thành công
console.log(`[FeatureName] Action completed:`, { result });

// Khi có lỗi
console.error(`[FeatureName] Error in action:`, error);

// Gợi ý: Custom log với timestamp
window.debugLog?.(`[FeatureName] Info:`, data);
```

### Format tên function log
`[ModuleName] Operation: Detail`

Ví dụ:
- `[UserAuth] Login: user@example.com logged in`
- `[Dashboard] Fetch metrics: 5 metrics retrieved`
- `[AdminPanel] CreateUser: Email already exists`

---

## 📊 Performance Optimization

### Bắt buộc áp dụng

1. **React.memo cho component phụ**
   ```typescript
   export default memo(MySubComponent);
   ```

2. **useCallback cho event handlers**
   ```typescript
   const handleClick = useCallback(() => {
     // logic
   }, [dependency]);
   ```

3. **useMemo cho expensive computation**
   ```typescript
   const result = useMemo(() => complexCalculation(), [deps]);
   ```

4. **Lazy loading cho component nặng**
   ```typescript
   const AdminPanel = lazy(() => import('./admin/AdminPanel'));
   ```

### Giám sát hiệu năng
- Tránh re-render không cần thiết (dùng React DevTools Profiler)
- Kiểm tra API timeout 15s (trong code hiện tại)
- Monitor WebSocket broadcast performance

---

## 🛠️ API & Backend

### Endpoint Safety
**KHÔNG được xóa hoặc thay đổi endpoint hiện tại:**
- ✅ Thêm endpoint mới nếu cần
- ✅ Cố gắng tái sử dụng endpoint hiện tại
- ❌ Xóa, rename, hoặc thay đổi logic endpoint

### API Call Pattern
```typescript
// Có timeout 15s
const response = await fetch('/api/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
  signal: AbortSignal.timeout(15000),
});

// Luôn log
console.log('[APICall] Request to /api/endpoint:', { data });
console.log('[APICall] Response:', response);
```

### Error Handling
```typescript
try {
  const result = await apiCall();
  console.log('[FeatureName] Success:', result);
  return result;
} catch (error) {
  console.error('[FeatureName] Error:', error);
  // Graceful fallback
  return defaultValue;
}
```

---

## ✋ Workflow khi sửa code

### 1️⃣ Khi nhận yêu cầu
- 📖 Đọc kỹ yêu cầu
- 🔍 Phân tích nguyên nhân (nếu là bug)
- 📋 Liệt kê hướng giải quyết
- ❓ **Chờ xác nhận từ người dùng**

### 2️⃣ Trước khi code
- 📁 Kiểm tra file hiện tại
- 📝 Xác định file nào cần sửa, file nào cần tạo
- ⚖️ Cân nhắc: chỉnh sửa hiện tại hay refactor?

### 3️⃣ Khi code
- ✅ Code chỉ những gì được yêu cầu
- ✅ Thêm logs/monitoring
- ✅ Áp dụng React.memo, useCallback nếu phù hợp
- ❌ Không xóa endpoint, không thay đổi logic không liên quan

### 4️⃣ Sau khi code
- 🔎 **Kiểm tra code trước sửa** (backup logic)
- 🔎 **Kiểm tra code sau sửa** (xác nhận không có regression)
- 📊 Kiểm tra log output
- ✅ Xác nhận tất cả test case đều pass

---

## 🎯 Gợi ý & Tối ưu (Chỉ gợi ý, không tự ý sửa)

### Hãy gợi ý khi phát hiện:
1. ⚠️ **Thiếu endpoint** - Endpoint cần thiết cho chức năng không tồn tại
2. ⚠️ **Lỗi có thể xảy ra** - Race condition, null check, error boundary
3. ⚠️ **Tối ưu hóa** - Caching, lazy loading, performance bottleneck
4. ⚠️ **Security issue** - Input validation, XSS, injection
5. ⚠️ **Code smell** - Duplicate code, dead code, complex function

**Format gợi ý:**
```
🔹 GỢI Ý: [Category]
Vấn đề: Mô tả vấn đề
Nguyên nhân: Tại sao là vấn đề
Tác động: Nếu không fix sẽ như nào
Giải pháp: Cách fix (không tự ý fix)
```

---

## 🚀 Build & Deploy

### Cách chạy
```bash
npm install          # Cài dependencies
npm run dev          # Dev mode (tsx watch)
npm start            # Production (node run.js)
npm run lint         # TypeScript check
```

### Environment
- **Dev**: Port 3000, host 0.0.0.0
- **Prod**: Node environment
- **API Key**: GEMINI_API_KEY trong .env.local

### Key Technologies
| Công nghệ | Phiên bản | Mục đích |
|-----------|---------|---------|
| React | 18 | Frontend framework |
| TypeScript | 5.9 | Type safety |
| Vite | latest | Build tool |
| Express | 4.19 | Backend server |
| Mongoose | 8.10 | MongoDB driver |
| WebSocket | 8.19 | Real-time updates |
| Gemini AI | 1.37 | AI integration |

---

## 📝 Checklist trước khi submit PR/Change

- [ ] Code chỉ làm những gì được yêu cầu
- [ ] Không xóa endpoint, không đổi logic không liên quan
- [ ] Đã thêm logs cho chức năng mới
- [ ] Áp dụng React.memo cho component phụ
- [ ] Kiểm tra code trước & sau (không có regression)
- [ ] TypeScript pass (`npm run lint`)
- [ ] Tạo file phụ riêng (không để tất cả trong 1 file)
- [ ] Đặt tên file theo chức năng
- [ ] Có displayName cho React component
- [ ] Error handling + graceful fallback

---

## 🔗 Liên kết Tài liệu

- [README.md](./README.md) - Getting started
- [types.ts](./types.ts) - Type definitions & enums
- [services/database.ts](./services/database.ts) - Database methods
- [services/gemini.ts](./services/gemini.ts) - AI integration

---

**Cuối cùng: Luôn ưu tiên chất lượng code và tính ổn định của hệ thống!** ✨
