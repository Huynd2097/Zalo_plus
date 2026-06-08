# Zalo Campaigner (Chrome Extension)

Công cụ tự động hóa gửi tin nhắn Zalo hàng loạt, quản lý chiến dịch và đồng bộ danh bạ thông minh.

## Tính năng chính

1. **Quản lý Danh bạ & Gắn thẻ:** Đồng bộ liên hệ tự động từ Zalo Web, tìm kiếm thời gian thực, và phân loại khách hàng bằng hệ thống Tag màu sắc trực quan.
2. **Chiến dịch Gửi tin Tự động:** Lên lịch hoặc gửi ngay tin nhắn cá nhân hóa hàng loạt (hỗ trợ tự động chèn Tên và Xưng hô).
3. **Theo dõi Phản hồi:** Chế độ theo dõi tự động thu thập và tổng hợp tin nhắn trả lời của khách hàng ngay trên bảng thống kê.
4. **Đồng bộ Google Sheets:** Tích hợp nhập/xuất và đồng bộ dữ liệu chiến dịch trực tiếp với Google Sheets.
5. **An toàn & Chống Spam:** Giả lập thao tác gõ và gửi phím như người dùng thực tế với thời gian chờ ngẫu nhiên.

## Lưu ý quan trọng khi sử dụng

*   **Không mở F12 (DevTools) ở tab Zalo:** Công cụ sử dụng cơ chế giả lập phím ảo. Việc mở DevTools ở tab Zalo sẽ làm lỗi quá trình gửi tin (`Another debugger is already attached`).
*   **Chống Spam tự động:** Quá trình gửi tin sẽ tự động giãn cách 2-4 giây mỗi tin, và nghỉ 10-15 giây sau mỗi 10 tin để đảm bảo an toàn cho tài khoản.

## Hướng dẫn Cài đặt

1. Truy cập trang dự án để tải mã nguồn file ZIP về máy tính và giải nén.
2. Mở Chrome và vào địa chỉ `chrome://extensions`.
3. Bật **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên cùng bên phải.
4. Bấm **Load unpacked** (Tải tiện ích đã giải nén).
5. Chọn thư mục bạn vừa giải nén (Lưu ý: Chọn đúng thư mục có chứa trực tiếp file `manifest.json` bên trong).
6. Ghim tiện ích (Pin) lên thanh công cụ để truy cập nhanh giao diện Quản lý (Dashboard).

---

## Giấy phép (License)

Dự án được phân phối theo giấy phép MIT. Bạn có thể sử dụng và sửa đổi tùy ý cho mục đích cá nhân.
