# Zoom -> Zalo Auto Scheduler (Chrome Extension)


Extension hẹn giờ tự động:
1. Tự động kết thúc cuộc họp Zoom (nếu có cuộc họp đang hoạt động).
2. Tự động tìm/mở tab Zalo Web (`chat.zalo.me`).
3. Chạy hàng chờ gửi tin nhắn cá nhân hóa và quản lý phản hồi tự động.

## Tải nhanh bản ZIP

Tải source tại [tại đây](https://codeload.github.com/Huynd2097/Zoom_Zalo/zip/refs/heads/main).

Sau khi tải:
1. Giải nén file ZIP.
2. Bạn sẽ có thư mục dạng `Zoom_Zalo-main`.
3. Dùng chính thư mục này để nạp extension (`Load unpacked`).

## Cài đặt (Load unpacked)

1. Mở Chrome và vào `chrome://extensions`.
2. Bật `Developer mode` ở góc trên cùng bên phải.
3. Chọn `Load unpacked`.
4. Trỏ đến thư mục đã giải nén (ví dụ: `Zoom_Zalo-main`).
5. Pin extension lên thanh công cụ (tuỳ chọn).

> [!WARNING]
> **Cảnh báo chọn nhầm thư mục:**
> - Không chọn thư mục ngoài cùng chỉ chứa thư mục con.
> - Không chọn file `.zip`.
> - Hãy chọn đúng thư mục có file `manifest.json` nằm trực tiếp bên trong.
> - Nếu Chrome báo lỗi `Manifest file is missing or unreadable`, hãy kiểm tra lại cấu trúc thư mục đã chọn.

---

## 1. Giao diện Hợp nhất Z-Campaigner AI (main-page)
 
Giao diện quản lý chính nằm ở đường dẫn `main-page/main.html`, được thiết kế theo bố cục 3 cột tinh gọn cho phần Chọn & Soạn thảo, chia làm hai Tab chính:
 
### Tab 1: Chiến dịch gửi tin (Campaigns)
*   **Bố cục 3 cột Chọn & Soạn thảo tối ưu:**
    *   **Cột 1 (Danh sách nhận tin):** Cho phép tìm kiếm nhanh liên hệ (realtime, gõ đến đâu lọc luôn), lọc theo nhãn (tag), chọn nhanh các liên hệ bằng checkbox.
    *   **Cột 2 (Danh bạ đã chọn gửi tin):** Hiển thị danh sách các liên hệ được tích chọn để gửi tin nhắn, cho phép quản lý nhanh (bỏ chọn từng liên hệ hoặc bỏ chọn tất cả).
    *   **Cột 3 (Soạn thảo tin nhắn):**
        *   Hỗ trợ thu gọn/mở rộng (Collapse) toàn bộ Khung Thiết lập Chiến dịch (gồm 3 cột Chọn, Nhận và Soạn thảo) bằng nút bấm to rõ bên ngoài để tối ưu không gian quan sát hàng chờ.
        *   Hỗ trợ cá nhân hóa tin nhắn: `{n}` để chèn tên gọi, `{a}` để tự động chèn xưng hô (Anh/Chị/Em...).
        *   Hẹn giờ gửi tin linh hoạt hoặc gửi ngay.
        *   Chế độ "Chờ phản hồi" (Wait Reply) bằng nút gạt (toggle) để tự động thu thập tin nhắn phản hồi của khách hàng.
*   **Trợ lý kịch bản AI & Autocomplete (Gemini API):**
    *   Tự động hoàn thành (Autocomplete) tin nhắn.
    *   Viết lại tin nhắn theo các tone giọng khác nhau (Trang trọng, Thân thiện, Thuyết phục, v.v.).
    *   Tạo kịch bản chiến dịch dựa trên prompt mục tiêu của người dùng.
*   **Bảng Hàng chờ gửi tin:**
    *   Hiển thị danh sách các tin nhắn đang chờ gửi, trạng thái hiện tại (Chờ gửi, Đang theo dõi, Hoàn tất, Lỗi).
    *   Hỗ trợ sửa trực tiếp nội dung tin nhắn, số điện thoại, ZID hoặc hẹn giờ gửi ngay trên bảng.
    *   Tất cả checkbox hiển thị trên bảng được chuẩn hóa thành màu xanh lá (emerald-600) chuyên nghiệp.
    *   Hàng lỗi luôn hiển thị lên đầu bảng để dễ xử lý.
    *   Phản hồi khách hàng hiển thị mỗi tin 1 dòng riêng biệt (thay vì nối bằng dấu `;`).
    *   Xuất Excel báo cáo chiến dịch nhanh gọn.
    *   Tính năng Tổng hợp phản hồi trực quan của khách hàng.
    *   **Undo 10 giây:** Hành động xoá tin nhắn/danh bạ có popup hoàn tác trong 10 giây trước khi xoá thật.
    *   **Deduplicate zid:** Khi load hàng chờ lần đầu, tự động loại bỏ dòng trùng zid (giữ pending/wait_reply, mới nhất).
 
### Tab 2: Quản lý danh bạ & Gắn thẻ (Contacts)
*   **Đồng bộ danh bạ:** Tự động thu thập liên hệ từ sidebar Zalo đang hiển thị.
*   **Tìm kiếm realtime:** Ô tìm kiếm danh bạ lọc kết quả ngay khi gõ, không cần ấn Enter.
*   **AI Chuẩn hóa danh bạ:** Tự động đề xuất xưng hô, phân tích tên gọi từ tên thô của Zalo bằng Gemini AI.
*   **Gắn tag hàng loạt có hỗ trợ Collapse:** Cho phép gắn tag hàng loạt cho các số điện thoại, có nút thu gọn/mở rộng (Collapse) bên ngoài to rõ ràng để tiết kiệm diện tích. Đổi màu nhãn đại diện tập trung qua màu chữ trực quan và nút đổi màu.
*   **Xoá liên hệ:** Hỗ trợ xoá từng liên hệ với undo 10 giây.
*   **Sửa tag trực tiếp:** Khi sửa/xoá tag inline, tag được cập nhật đúng (cho phép xoá về trống).

---

## 2. Cách dùng Chiến dịch gửi tin tự động

1. Mở sẵn tab Zalo Web (`https://chat.zalo.me`).
2. Mở giao diện Dashboard của Extension (click biểu tượng extension -> bấm nút truy cập Dashboard).
3. Tại **Tab 2: Danh bạ**, bấm **Đồng bộ** để nạp danh sách liên hệ Zalo của bạn.
4. Tại **Tab 1: Chiến dịch**:
   - Chọn các liên hệ muốn gửi tin nhắn ở danh sách bên trái.
   - Nhập nội dung tin nhắn thô ở ô soạn thảo (sử dụng `{n}` và `{a}`).
   - Cài đặt thời gian hẹn giờ (nếu cần gửi trễ) và tích chọn **Chờ phản hồi** nếu muốn theo dõi khách trả lời.
   - Bấm **Đẩy danh sách đã chọn vào Hàng Chờ gửi**.
5. Bấm **Bắt đầu gửi** để chạy Worker.
   - Extension sẽ tự động đính kèm debugger, mở từng cuộc chat, verify đúng người nhận, gõ nội dung cá nhân hóa và bấm gửi.

---

## 3. Cấu trúc Thư mục Dự án

*   `manifest.json`: File cấu hình Extension MV3.
*   `background.js` & `background/`: Chứa service worker chạy ngầm, quản lý hàng chờ (`queue.js`), worker gửi tin (`worker.js`), lưu trữ danh bạ (`contacts.js`), và đăng ký sự kiện (`events.js`).
*   `content-scripts/`: Scripts chạy trực tiếp trên trang Zoom và Zalo để theo dõi và tương tác DOM.
*   `main-page/`: Giao diện Z-Campaigner AI chính.
    *   `main.html`: Giao diện chính sử dụng cấu trúc components.
    *   `main.css`: Chứa định nghĩa phong cách CSS tùy chỉnh.
    *   `main.js`: File điều phối cũ chuyển tiếp sang mô-đun mới.
    *   `components/`: Chứa các thành phần HTML riêng lẻ (`nav.html`, `campaign-tab.html`, `contacts-tab.html`, `modal-summary.html`, `modal-normalizer.html`, `modal-add-contact.html`, `toast.html`).
    *   `js/`: Chứa mã nguồn mô-đun hóa:
        *   `state.js`: Trạng thái toàn cục và cấu hình.
        *   `utils.js`: Các hàm tiện ích dùng chung.
        *   `contacts.js`: Logic Danh bạ và thẻ gắn Tag.
        *   `queue.js`: Logic hàng chờ và kiểm soát trạng thái gửi.
        *   `ai.js`: Tương tác với Gemini API.
        *   `import.js`: Nhập danh sách Excel/CSV.
        *   `modals.js`: Quản lý các popup modal và slide-out drawer.
        *   `init.js`: Điểm khởi động ứng dụng và liên kết sự kiện DOM.
*   `popup/`: Giao diện popup nhỏ khi click vào icon extension.
*   `vendor/`: Thư viện ngoài (Tailwind CSS, SheetJS, Lucide).

---

## 4. Ghi chú Bảo trì & Phát triển

*   **Luồng gửi tin bằng CDP (Chrome DevTools Protocol):** Extension sử dụng CDP debugger của Chrome để giả lập gõ chữ và click nút gửi trên Zalo. Không được mở Chrome DevTools ở tab Zalo khi worker đang chạy để tránh lỗi `Another debugger is already attached`. Để chống quét spam của Zalo, worker tự động áp dụng delay ngẫu nhiên **2-4 giây** giữa các lần gửi thông thường, và nghỉ ngơi ngẫu nhiên **10-15 giây** sau mỗi 10 tin gửi thành công.
*   **Tránh lệch ZID:** Hệ thống luôn đợi tiêu đề Zalo chat khớp với tên người nhận trước khi lấy ZID và ghi nhận mapping. Dữ liệu hệ thống lỗi (ví dụ: liên hệ bị map nhầm vào "My Documents") sẽ tự động được dọn dẹp sạch bằng cơ chế tự sửa lỗi (self-healing) mỗi khi danh bạ được tải.
*   **Đồng bộ tên hiển thị:** Khi mở chat hoặc đồng bộ, nếu tên hiển thị thực tế trên Zalo của người dùng thay đổi, hệ thống sẽ tự động cập nhật lại vào `zaloContactMap` để đảm bảo cá nhân hóa `{n}` luôn chính xác.
*   **Gửi hình ảnh tự động không qua Clipboard Windows:** Hệ thống hỗ trợ gửi ảnh tự động qua Zalo Web bằng cơ chế giả lập sự kiện `paste` trực tiếp trên DOM (Fake Paste Event) kết hợp giải mã Base64 sang Blob thủ công, tránh ghi đè clipboard hệ thống của Windows và không bị chặn bởi Content Security Policy (CSP). Code xử lý được tích hợp trực tiếp trong `content-scripts/zalo-content.js` (nhận sự kiện `ZALO_PASTE_IMAGE`) và `background/zalo-actions.js` (`pasteAndSendImageZalo`).

---

## License

Dự án được phân phối theo giấy phép MIT. Bạn có thể sử dụng và sửa đổi tùy ý cho mục đích cá nhân hoặc cộng đồng.
