# Kế hoạch: Quản lý kho hàng và bán hàng

**Trạng thái:** Đang chờ duyệt kế hoạch triển khai; các quyết định đã thống nhất được ghi dưới đây.  
**Phạm vi:** Ứng dụng Lucky Hub 2026 hiện tại (React/TypeScript, Express, MongoDB/Mongoose).

## 1. Kết quả cần đạt

Xây dựng một khu vực bán hàng để mỗi người có quyền quản lý hàng hoá tự quản lý kho và nhật ký bán hàng riêng. Bảng giá là dữ liệu dùng chung toàn hệ thống, chỉ người có quyền riêng để quản lý bảng giá mới được chỉnh sửa. Hệ thống nhận diện hội viên đã có thẻ bằng mã hội viên hợp lệ, chọn mức giá mặc định theo cấp độ, ghi nhận doanh số/PV, quản lý tồn kho và tạo hoá đơn có thể xem lại, sửa thông tin người mua và in/xuất.

## 2. Khảo sát hiện trạng

- Ứng dụng dùng React/TypeScript ở giao diện, Express và MongoDB/Mongoose ở backend; route API được đăng ký tập trung trong `server/index.ts`.
- Hệ thống phân quyền hiện lưu quyền trong `server/config/permissions.ts`, gán quyền qua nhóm và kiểm tra API bằng `authMiddleware` cùng `requirePermission`. Giao diện chính điều hướng qua `activeTab` trong `App.tsx` và menu trong `components/system/Layout.tsx`.
- Hồ sơ người dùng trong `server/models/User.ts`, `types.ts` và `components/profile/ProfileForm.tsx` hiện chưa có mã hội viên Herbalife hoặc cấp độ hội viên. Cần bổ sung trường mã và cấp độ, đồng thời xác thực mã ở backend.
- Chưa thấy mô hình, route hoặc màn hình sản phẩm, tồn kho, giá chung, bán hàng hay hoá đơn.
- Có dịch vụ upload ảnh dùng cấu hình lưu trữ hiện tại ở `server/services/storage/imageStorageService.ts`, có thể tái sử dụng cho ảnh hàng hoá.
- `package.json` hiện chưa có Playwright hoặc bộ kiểm thử giao diện. Kế hoạch sẽ bổ sung cấu hình và kiểm thử Playwright cho luồng chức năng mới.

## 3. Phân quyền và ranh giới dữ liệu

Đăng ký hai quyền độc lập vào danh sách quyền hiện tại, để quản trị viên có thể gán qua nhóm:

| Quyền | Khả năng |
|---|---|
| `inventory:manage` | Truy cập khu vực kho, tạo/cập nhật sản phẩm và tồn kho riêng, bán hàng, xem nhật ký/hoá đơn và báo cáo của chính người bán |
| `pricelist:manage` | Xem và điều chỉnh giá nhập tham chiếu cùng các mức giá bán chung toàn hệ thống |
| `members:level:manage` | Quản lý cấp độ hội viên trong phạm vi tuyến dưới được phép; backend bắt buộc kiểm tra cả quyền này lẫn quan hệ bảo trợ |

- `inventory:manage` không bao hàm `pricelist:manage` hoặc `members:level:manage`. Người chỉ có quyền kho không thể gọi API chỉnh bảng giá/cấp hội viên dù tự gửi request.
- Mọi bản ghi kho, giao dịch bán, hoá đơn, tuỳ chọn in và báo cáo cá nhân phải được truy vấn theo `ownerId` lấy từ phiên đăng nhập, không tin `ownerId` do client gửi. Không người bán nào được đọc hoặc sửa dữ liệu riêng của người bán khác.
- Giá là dữ liệu dùng chung, đọc được trong quy trình bán hàng của người có quyền kho; thao tác ghi chỉ dành cho `pricelist:manage`.
- Ẩn mục menu và màn hình nếu thiếu quyền phù hợp, đồng thời bảo vệ route/API ở backend. Giao diện không phải ranh giới bảo mật.
- Không thay đổi hay xoá endpoint hiện tại; bổ sung route mới và nối vào cơ chế phân quyền sẵn có.

## 4. Dữ liệu đề xuất

Tạo các model riêng trong `server/models/` và kiểu dữ liệu riêng trong `types.ts`:

1. **InventoryItem** — `ownerId`, `sku`, `name`, `imageUrl`, `pv`, `quantity`, thời gian tạo/cập nhật. SKU duy nhất trong kho của một người (`ownerId + sku`); cùng SKU có thể xuất hiện trong kho của nhiều người. Thông tin nhập hàng như giá nhập thực tế được giữ trong lô nhập hoặc sự kiện điều chỉnh để định giá tồn chính xác.
2. **SharedPriceList** — bảng giá chung có nhiều phiên bản; mỗi phiên bản lưu thời điểm bắt đầu và kết thúc hiệu lực, người cập nhật và các mức giá cho SKU (giá nhập tham chiếu, Giá 100%, Giá 25%, Giá 35%, Giá 42%, Giá 50%). Cập nhật giá tạo phiên bản mới, không ghi đè phiên bản cũ. Không cho hai phiên bản có khoảng hiệu lực chồng lấn. Tên mức giá là nhãn thương mại; giá tiền được cấu hình trực tiếp, không suy ra phần trăm giảm.
3. **InventoryLot / InventoryMovement** — mỗi lần nhập lưu số lượng và giá vốn thực tế tại thời điểm nhập, cùng phiên bản bảng giá áp dụng (nếu có). Lịch sử nhập, xuất, trả và điều chỉnh liên kết với lô; giá vốn lô không bị thay đổi khi bảng giá chung được cập nhật. Không cho phép tồn âm.
4. **Sale / Invoice** — người bán, người mua dạng `member` (liên kết User), `walk-in` hoặc `custom`, tên/định danh người mua tại thời điểm bán, dòng hàng, số lượng, đơn giá thực tế, mức giá áp dụng, phiên bản bảng giá có hiệu lực theo thời điểm bán, PV snapshot, tổng tiền, ghi chú, thời gian bán, số hoá đơn và trạng thái. Hoá đơn lưu snapshot tên/SKU/PV/đơn giá để lịch sử không đổi khi hồ sơ hoặc bảng giá thay đổi. Mã hoá đơn dự kiến `LK-DDMMYYYY-HHMM-XXXX`; `XXXX` được sinh ngẫu nhiên và phải được bảo vệ bằng unique index cùng cơ chế thử sinh lại khi va chạm.
5. **Sponsor relationship** — mã hội viên của người bảo trợ và liên kết tới tài khoản tương ứng. Một hội viên có tối đa một người bảo trợ trực tiếp, còn một người có thể bảo trợ nhiều hội viên. Quan hệ được truy vấn nhiều tầng để xác định tuyến trên; cần chống vòng lặp và không cho tự bảo trợ.
6. **SellerPrintPreference** — tuỳ chọn xuất hoá đơn theo người bán (PDF hoặc ảnh), được lưu theo tài khoản.
7. **SaleAdjustment / Return** — sự kiện huỷ hoặc hoàn hàng có liên kết hoá đơn gốc, lý do, số lượng trả theo dòng, thời gian và người thao tác. Giao dịch gốc không bị xoá; tồn được cộng lại theo đúng lô/giá vốn nếu còn xác định được.

Thống kê hội viên phải nhận diện mua hàng bằng `buyerUserId` khi chọn một user đã xác thực; khách lẻ và tên nhập tuỳ chỉnh không được tính vào số liệu của tài khoản hội viên. Mỗi dòng hàng lưu `pvAtSale`; tổng PV và tiền được tính nhất quán ở backend.

## 5. Hồ sơ hội viên, tuyến bảo trợ và quy tắc chọn giá

- Bổ sung `memberNumber`, `memberLevel` và `sponsorMemberNumber` vào hồ sơ/kiểu User. Mã hội viên và mã người bảo trợ phải được xác thực ở backend theo mẫu `VA` + 8 chữ số hoặc `VNY` + 7 chữ số (không phân biệt hoa thường, sau đó chuẩn hoá chữ hoa); không cho lưu mã sai định dạng hoặc trùng. Thành viên chưa có thẻ có thể để trống mã và chưa được gán cấp giá hội viên.
- Cấp độ do người có quyền quản lý cấp độ thành viên cập nhật. Người thao tác chỉ được đổi cấp của thành viên nằm trong tuyến dưới của mình; backend kiểm tra quyền và quan hệ tuyến trên ở mỗi yêu cầu. Thành viên trong tuyến trên không có quyền này không thể đổi cấp. Ghi nhật ký cấp cũ/mới, người đổi, thời gian và lý do.
- Cho phép nhập mã người bảo trợ khi cập nhật hồ sơ. Xác nhận mã tồn tại, không tự bảo trợ, không tạo chu trình trong cây; lưu liên kết ổn định tới tài khoản hội viên để đổi mã/ hồ sơ không làm mất lịch sử quan hệ. Thay đổi người bảo trợ cần ghi audit trail.
- Định nghĩa enum cấp độ rõ ràng và ánh xạ: khách hàng → Giá 100%; hội viên có thẻ → Giá 25%; Tư vấn viên cao cấp → Giá 35%; Nhà kiến tạo thành công → Giá 42%; Giám sát viên → Giá 50%. Các nhãn mô tả mức giá, không khẳng định mức giảm thực tế.
- Chỉ cho chọn cấp hội viên nếu có mã hợp lệ. Khi bán cho thành viên, backend lấy cấp độ hiện tại để đề xuất giá; người bán có quyền kho có thể chỉnh giá dòng hàng khi bán. Lưu cả mức giá mặc định lẫn giá thực tế đã chốt để kiểm toán.
- Chưa tích hợp hệ thống ngoài để xác minh tư cách Herbalife; cấp độ được quản lý bởi thành viên có quyền phù hợp trong tuyến trên. Cần chốt ai cấp quyền quản lý cấp độ và liệu người đó chỉ quản lý tuyến dưới của mình hay có phạm vi rộng hơn.

## 6. API và quy tắc nghiệp vụ

Tạo route module riêng (ví dụ `server/routes/inventory.routes.ts`) và đăng ký trong `server/index.ts`. Mọi API kho/bán dùng xác thực và `requirePermission` tương ứng.

- Kho: liệt kê, tạo, sửa, ngừng kinh doanh mặt hàng; nhập kho, điều chỉnh tồn có lý do; lọc/tìm kiếm theo SKU và tên. Không xoá cứng mặt hàng đã phát sinh giao dịch.
- Bảng giá: đọc phiên bản có hiệu lực; người có `pricelist:manage` tạo phiên bản mới với `effectiveFrom` và thời điểm kết thúc phiên bản trước. Bán hàng nhập bổ sung ngày/giờ quá khứ sẽ chọn đúng phiên bản giá có hiệu lực lúc giao dịch, nhưng phải tuân thủ quyền và audit trail cho việc backdate. Kiểm tra không cho chồng thời gian hiệu lực.
- Bán hàng: tra cứu thành viên trong danh sách được phép xem, hoặc chọn khách lẻ/nhập tên; xác thực tồn kho, phiên bản giá theo thời gian bán, PV, buyer và tổng tiền ở server; ghi sale, snapshot hoá đơn và movement trong transaction MongoDB nếu deployment hỗ trợ. Nếu không hỗ trợ transaction, thiết kế thao tác bù/đảm bảo không trừ kho một phần. Ghi chú được lưu trên hoá đơn.
- Huỷ/hoàn: từ lịch sử bán hoặc lịch sử mua của hội viên, người có quyền thao tác huỷ đơn hoặc trả toàn bộ/một phần hàng; nhập lý do trả. Lưu sự kiện mới, không xoá hoá đơn gốc; cập nhật trạng thái hiển thị (đã huỷ/hoàn một phần/đã hoàn) và cộng lại đúng số lượng vào kho người bán. Chốt chính sách hoàn tiền riêng nếu chức năng thanh toán nằm ngoài phạm vi.
- Lịch sử: phân trang/lọc theo ngày, người mua, SKU; xem/xuất lại hoá đơn; chuyển liên kết người mua theo quyền kho và ghi buyer trước/sau vào audit trail. Khi chuyển sang hội viên đúng, cập nhật báo cáo mua hàng/PV của hội viên ở kỳ bán ban đầu; giữ nguyên giá và PV trên hoá đơn đã chốt.
- Báo cáo: tổng số lượng tồn, giá trị tồn theo giá nhập thực tế/lô và giá nhập tham chiếu; giá trị ước tính bán ra theo từng mức; lượng đã bán/PV theo tháng, quý, năm cho từng hội viên và từng người bán.
- Tất cả ghi nhận quan trọng có log theo chuẩn dự án, gồm người thao tác, phạm vi, kết quả và lỗi, không ghi thông tin nhạy cảm không cần thiết.

## 7. Giao diện

Tạo khu vực module hoá dưới `components/inventory/`:

- **Tổng quan:** thẻ chỉ số tồn kho, giá trị nhập/bán ước tính, cảnh báo sắp hết/hết hàng và biểu đồ bán hàng/PV theo khoảng thời gian.
- **Kho hàng:** danh sách có tìm kiếm/lọc, trạng thái tồn, form thêm/sửa SKU, tên, ảnh, PV và số lượng; thao tác nhập/điều chỉnh tồn có lịch sử.
- **Bảng giá:** chỉ xuất hiện với `pricelist:manage`; bảng SKU và sáu loại giá, lịch sử phiên bản cùng ngày giờ hiệu lực. Người có mỗi quyền kho chỉ thấy giá dùng để bán.
- **Tạo đơn:** chọn thành viên hoặc khách lẻ/tên tuỳ chỉnh; giỏ hàng; tự gợi ý mức giá theo cấp và thời gian giao dịch; cho sửa đơn giá; hiển thị PV và tồn dự kiến; ghi chú; xác nhận trước khi trừ tồn. Cho nhập ngày bán quá khứ với xác nhận và log.
- **Lịch sử bán:** lọc thời gian/người mua, xem chi tiết và hoá đơn; sửa người mua theo chính sách được chốt; huỷ/hoàn hàng có lý do, giữ lịch sử đầy đủ.
- **Báo cáo hội viên:** chọn tháng/quý/năm hoặc khoảng ngày, xem số lượng, doanh thu và PV; không lộ giao dịch của kho khác. Giao dịch hoàn/huỷ cần được trừ khỏi tổng theo chính sách báo cáo đã chốt.
- Bố cục responsive cho desktop/điện thoại, thao लक्ष्य cảm ứng phù hợp, bảng chuyển thành danh sách/thẻ trên màn nhỏ, trạng thái tải/rỗng/lỗi rõ ràng.
- Thêm mục điều hướng ở `Layout.tsx` và render module trong `App.tsx`, chỉ khi có `inventory:manage`.

## 8. Hoá đơn và in

- Tạo mẫu hoá đơn riêng có preview và cấu hình người bán: thông tin cửa hàng/người bán, mã `LK-DDMMYYYY-HHMM-XXXX`, ngày giờ, người mua, dòng hàng, mức giá/đơn giá, tổng tiền, PV và ghi chú.
- Giai đoạn đầu hỗ trợ xuất PDF và ảnh hoá đơn (PNG/JPEG); nhớ lựa chọn định dạng theo từng tài khoản người bán. Bluetooth được để ở giai đoạn sau.
- Lịch sử bán cho phép mở lại đúng snapshot đã bán và in/xuất lại. Việc sửa người mua cập nhật hoá đơn theo quy tắc nghiệp vụ nhưng giữ dấu vết thay đổi.
- In Bluetooth chưa nằm trong giai đoạn đầu; sẽ khảo sát thiết bị và nền tảng mục tiêu ở giai đoạn riêng trước khi triển khai.

## 9. Kiểm thử và nghiệm thu

- Kiểm thử API/phân quyền: người không quyền bị từ chối; người có `inventory:manage` chỉ đọc/ghi dữ liệu kho của mình; quyền này không sửa được bảng giá; chỉ `pricelist:manage` được cập nhật giá.
- Kiểm thử quy tắc hội viên: mã VA/VNY hợp lệ, mã sai/trùng, chống chu trình bảo trợ, quyền đổi cấp trong tuyến trên, chọn từng cấp và giá mặc định, chỉnh đơn giá, PV snapshot.
- Kiểm thử bảng giá lịch sử: phiên bản không chồng lấn, giao dịch backdate dùng đúng giá có hiệu lực; giá vốn nhập theo lô giữ nguyên sau các lần sửa bảng giá.
- Kiểm thử bán hàng: khách thành viên, khách lẻ, tên tuỳ chỉnh; tồn không âm; tổng tiền/PV đúng; cập nhật người mua để lại dấu vết; tồn và hoá đơn nhất quán khi lỗi; mã hoá đơn không trùng.
- Kiểm thử huỷ/hoàn một phần và toàn phần: lý do được lưu, lịch sử không bị xoá, số tồn trả về đúng kho và báo cáo điều chỉnh đúng.
- Kiểm thử báo cáo tháng/quý/năm, phân cách kho giữa hai người và định giá tồn theo giá nhập.
- Cài Playwright và cấu hình E2E phù hợp dự án; chạy trên viewport desktop và mobile. Các kịch bản trọng tâm: quyền menu, tạo mặt hàng/nhập kho, sửa bảng giá với đúng quyền, bán và xem hoá đơn, cập nhật người mua, xuất/in preview.
- Kiểm tra TypeScript bằng `npm run lint`; chạy các kịch bản Playwright đã thống nhất. Không triển khai production trong phạm vi kế hoạch.

## 10. Trình tự triển khai đề xuất

1. **Chốt nghiệp vụ còn mở:** ai được cấp quyền quản lý cấp độ; ngưỡng cảnh báo hết hàng; chính sách backdate; cách sửa người mua và ảnh hưởng đến báo cáo; chính sách hoàn tiền; yêu cầu Bluetooth tương lai.
2. **Nền tảng dữ liệu và quyền:** model, index, quyền mới, validation, API bảng giá/kho và cách ghi log.
3. **Hồ sơ hội viên:** trường mã/cấp độ, xác thực server, cập nhật kiểu frontend.
4. **Nghiệp vụ nhập và bán:** inventory movements, giao dịch nguyên tử, buyer types, snapshot hoá đơn và lịch sử.
5. **Báo cáo:** thống kê tồn, định giá và PV/doanh số theo kỳ.
6. **Giao diện responsive:** dashboard, kho, giá, bán hàng, lịch sử, báo cáo.
7. **Hoá đơn và tuỳ chọn xuất:** preview, PDF, ảnh, lưu tuỳ chọn theo người bán; Bluetooth thực hiện ở giai đoạn sau.
8. **Playwright và nghiệm thu:** E2E desktop/mobile, kiểm thử phân quyền/riêng tư dữ liệu, TypeScript và rà soát thay đổi.

## 11. Tiêu chí hoàn tất

- Người không có quyền kho không thấy module và không truy cập được API kho; dữ liệu giữa hai chủ kho được cô lập.
- Quyền quản lý kho, quản lý bảng giá và quản lý cấp độ thành viên được tách riêng; cấp độ chỉ được sửa trong tuyến dưới mà người thao tác có quyền quản lý.
- Bảng giá dùng chung có thời gian hiệu lực; giao dịch backdate chọn đúng phiên bản giá; giá vốn từng lần nhập giữ theo thời điểm nhập.
- Mã hội viên và người bảo trợ được xác thực, quan hệ nhiều tầng không tạo chu trình; giá mặc định đúng cấp, đơn giá có thể chỉnh và PV/doanh số được lưu theo giao dịch.
- Có nhập/điều chỉnh kho, cảnh báo tồn, định giá tồn, bán hàng, huỷ/hoàn hàng, nhật ký, báo cáo theo kỳ và sửa người mua có audit trail.
- Hoá đơn có mã duy nhất, preview, PDF và ảnh; lựa chọn định dạng được lưu theo người bán.
- Giao diện dùng được trên desktop/mobile; các kịch bản Playwright và kiểm tra TypeScript đạt.

## 12. Quyết định đã thống nhất và câu hỏi còn mở

### Đã thống nhất

- Cấp độ do thành viên có quyền quản lý riêng cập nhật; chỉ người có quyền ở tuyến trên mới được đổi cấp cho tuyến dưới. Quan hệ bảo trợ hỗ trợ nhiều tầng và nhập bằng mã người giới thiệu.
- Giá vốn được lưu ở mỗi lần nhập theo thời điểm nhập. Bảng giá chung lưu phiên bản cũ và khoảng thời gian hiệu lực; bán backdate chọn bảng giá áp dụng tại thời điểm đó.
- Có huỷ đơn và hoàn hàng từ lịch sử; không xoá giao dịch gốc, lưu trạng thái và lý do trả. Đơn bán có ghi chú.
- Mã hoá đơn theo dạng `LK-DDMMYYYY-HHMM-XXXX`, cần bảo đảm duy nhất ở tầng dữ liệu.
- Giai đoạn đầu xuất PDF và ảnh; Bluetooth làm sau.
- Tra cứu hội viên dùng API riêng chỉ trả dữ liệu cần cho bán hàng.
- Sửa người mua đã chốt theo phương án chuyển liên kết: cập nhật báo cáo mua hàng/PV cho hội viên đúng tại kỳ bán ban đầu, không đổi giá/PV của hoá đơn; lưu người mua cũ/mới, người sửa và thời điểm sửa. Điều chỉnh tiền/PV (nếu cần) phải là giao dịch riêng.

### Các thông số còn lại cần chốt

1. Ai được cấp quyền quản lý cấp độ thành viên và người đó được phép quản lý mọi tuyến dưới hay chỉ tuyến dưới trực tiếp?
2. Ngưỡng cảnh báo sắp hết hàng mặc định là bao nhiêu; có tuỳ chỉnh theo mặt hàng không?
3. Có cho backdate bất kỳ ngày nào không, hay cần giới hạn (ví dụ trong kỳ hiện tại) và quyền riêng?
4. Khi huỷ/hoàn, hệ thống chỉ cập nhật trạng thái/tồn kho/PV hay cần theo dõi cả số tiền đã hoàn? Thanh toán hiện tại nằm ngoài yêu cầu ban đầu.
5. In Bluetooth sẽ được khảo sát riêng khi chốt model máy in và điện thoại mục tiêu.

