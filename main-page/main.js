/**
 * @file main.js
 * @description File main.js gốc đã được cấu trúc lại và chia nhỏ thành các mô-đun chức năng riêng biệt trong thư mục js/.
 * 
 * Chi tiết các mô-đun thay thế:
 * - js/state.js: Quản lý biến trạng thái toàn cục và hằng số cấu hình.
 * - js/utils.js: Chứa các hàm tiện ích dùng chung (hiển thị thông báo, định dạng ngày tháng...).
 * - js/contacts.js: Điều khiển và tương tác với Danh bạ, hiển thị danh sách liên hệ, gắn tag.
 * - js/queue.js: Quản lý hàng chờ gửi tin nhắn, cập nhật dòng dữ liệu và trạng thái gửi.
 * - js/ai.js: Logic tương tác với Gemini AI (viết tiếp, đổi tone giọng, đề xuất kịch bản và chuẩn hóa danh bạ).
 * - js/import.js: Logic xử lý nạp danh sách gửi tin hàng loạt từ Excel/CSV.
 * - js/modals.js: Điều khiển bật/tắt các Modal, Slide-out Drawer trợ lý và hiệu ứng giao diện.
 * - js/init.js: Điểm khởi chạy của ứng dụng, nạp động các component HTML và liên kết sự kiện DOM.
 */
