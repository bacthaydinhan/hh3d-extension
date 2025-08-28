# 🎯 HH3D Helper - All-in-One Extension

Extension Chrome Manifest V3 tổng hợp tất cả tính năng hỗ trợ trên HoatHinh3D: Tế Lễ, Điểm Danh và Vấn Đáp thông minh.

## ✨ Tính năng hoàn thiện

### ⚡ Hoạt động hàng ngày
- **Tế Lễ tự động**: Tự động mở trang và click nút Tế Lễ
- **Điểm Danh tự động**: Tự động mở trang và click nút Điểm Danh  
- **SweetAlert2 support**: Xử lý popup xác nhận tự động
- **Error handling**: Báo lỗi chi tiết nếu không tìm thấy nút

### 🧠 Vấn đáp thông minh
- **AI phát hiện câu hỏi**: Multi-strategy detection với fuzzy matching
- **Shadow DOM support**: Traversal Shadow DOM để tìm câu hỏi ẩn
- **Auto-click thông minh**: Human-like behavior với randomized delays
- **Auto mode**: Chế độ tự động hoàn toàn qua 5 câu hỏi
- **Real-time monitoring**: Live status updates và progress tracking
- **Pin popup**: Ghim popup để không tự đóng khi auto-click

### 🎛️ Interface thống nhất
- **3-section layout**: Hoạt động hàng ngày, Vấn đáp, Kết quả
- **Real-time status**: Hiển thị trạng thái và tiến độ live
- **Toggle controls**: Auto mode và Pin mode
- **Responsive design**: Tối ưu cho popup extension
- **Visual feedback**: Icons, colors và animations

## 🚀 Cài đặt

### 1. Load Extension vào Chrome

1. Mở Chrome và vào `chrome://extensions/`
2. Bật **Developer mode** (toggle góc phải trên)
3. Click **Load unpacked**
4. Chọn thư mục `hh3d`
5. Extension sẽ xuất hiện với icon 🎯

### 2. Cách sử dụng

#### ⚡ **Hoạt động hàng ngày**
1. Click icon extension trong toolbar
2. Section "HOẠT ĐỘNG HÀNG NGÀY":
   - **TẾ LỄ**: Tự động mở trang và thực hiện Tế Lễ
   - **ĐIỂM DANH**: Tự động mở trang và thực hiện Điểm Danh

#### 🧠 **Vấn đáp thông minh**
1. Vào trang: `https://hoathinh3d.mx/van-dap-tong-mon?t=xxxxx`
2. Popup sẽ **tự động hiện** khi vào trang
3. Section "VẤN ĐÁP THÔNG MINH":
   - **Auto toggle**: Bật/tắt chế độ tự động
   - **Pin toggle**: Ghim popup để không tự đóng
   - **STOP button**: Dừng auto mode bất cứ lúc nào
4. Nhấn **"BẮT ĐẦU VẤN ĐÁP"** trên website
5. Extension sẽ tự động phát hiện và trả lời

## 📁 Cấu trúc Extension

```
hh3d/
├── manifest.json              # Extension configuration
├── background.js              # Unified background script
├── popup.html                 # 3-section popup interface
├── popup.js                   # Unified popup logic
├── popup.css                  # Modern styling
├── content-tele-diemdanh.js   # Tế Lễ & Điểm Danh automation
├── content-vandap.js          # Vấn Đáp AI detection
├── icons/                     # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md                  # This file
```

## 🔧 Kiến trúc kỹ thuật

### Content Scripts Strategy
- **content-tele-diemdanh.js**: Xử lý URLs `danh-sach-thanh-vien-tong-mon` và `diem-danh`
- **content-vandap.js**: Xử lý URLs `van-dap-tong-mon` với AI detection
- **Isolated execution**: Mỗi content script chỉ chạy trên URLs tương ứng

### Message Routing
- **TẾ LỄ flow**: `openAndClick` → navigate → `clickTeLeButton` → confirm popup
- **ĐIỂM DANH flow**: `checkInCurrentTab` → navigate → `clickDiemDanhButton`
- **VẤN ĐÁP flow**: `vandap_*` actions cho AI detection và auto mode

### State Management
```javascript
{
  // Tế Lễ - Điểm Danh state
  "lastTeLeClick": timestamp,
  "lastDiemDanhClick": timestamp,
  
  // Vấn Đáp state  
  "pinned": boolean,
  "autoMode": boolean
}
```

## 🎨 UI/UX Features

### Color Scheme
- **Primary**: `#4CAF50` (green) - Success actions
- **Secondary**: `#2196F3` (blue) - Info và VanDap  
- **Warning**: `#FF9800` (orange) - Processing states
- **Error**: `#F44336` (red) - Error states

### Responsive Layout
- **Header**: Branding với version info
- **Daily section**: 2-button layout cho Tế Lễ/Điểm Danh
- **VanDap section**: Controls + status + question display
- **Result section**: Unified feedback area

### Interactive Elements
- **Toggle switches**: Modern slider design
- **Hover effects**: Button animations
- **Status indicators**: Real-time visual feedback
- **Pulsing animations**: For active states

## 🔍 Testing

### Test URLs
- **Tế Lễ**: `https://hoathinh3d.mx/danh-sach-thanh-vien-tong-mon?t=af075`
- **Điểm Danh**: `https://hoathinh3d.mx/diem-danh?t=223e4`
- **Vấn Đáp**: `https://hoathinh3d.mx/van-dap-tong-mon?t=xxxxx`

### Test Scenarios
1. ✅ **Tế Lễ flow**: Click button → New tab → Auto click → Confirm
2. ✅ **Điểm Danh flow**: Click button → Navigate → Auto click
3. ✅ **VanDap AI**: Question detection → Answer finding → Auto click
4. ✅ **Auto mode**: 5 questions automation
5. ✅ **Pin mode**: Popup stays open during auto-click
6. ✅ **State persistence**: Settings saved across sessions

## 🚀 Migration từ Extensions cũ

### Từ hh3d-tele-diemdanh
- ✅ Giữ nguyên hoàn toàn logic Tế Lễ/Điểm Danh
- ✅ Same URLs và message actions
- ✅ Same error handling

### Từ hh3d-vandap  
- ✅ Giữ nguyên hoàn toàn VanDapHelper class
- ✅ Same AI detection algorithms
- ✅ Same auto mode functionality
- ✅ Import pin state từ storage

## ⚡ Performance

### Optimizations
- **Lazy loading**: Content scripts chỉ load khi cần
- **Efficient DOM observation**: IntersectionObserver cho VanDap
- **Debounced updates**: 1-second intervals cho status updates
- **Memory cleanup**: Proper interval clearing và event removal

### Resource Usage
- **Background script**: Minimal footprint, message routing only
- **Content scripts**: Isolated execution, no conflicts
- **Storage**: Local storage only, no external APIs

## 🛡️ Security & Privacy

### Permissions
- **tabs**: Tab management cho navigation
- **scripting**: Content script injection
- **webNavigation**: Tab completion detection  
- **storage**: Local settings persistence
- **activeTab**: Current tab access

### Privacy
- ✅ **Local only**: Không có external API calls
- ✅ **No tracking**: Không collect user data
- ✅ **Host-restricted**: Chỉ hoạt động trên hoathinh3d.mx

## 📊 Version History

### v2.0.0 (Current)
- 🎯 **Merged extension**: Tổng hợp từ hh3d-tele-diemdanh + hh3d-vandap
- 🎨 **Unified UI**: 3-section popup interface
- ⚡ **Enhanced UX**: Real-time status, better feedback
- 🔧 **Improved architecture**: Cleaner code organization

### Migration từ v1.x
- **hh3d-tele-diemdanh v1.2.0** → HH3D Helper v2.0.0
- **hh3d-vandap v1.0** → HH3D Helper v2.0.0

## 🤝 Contributing

### Development Setup
1. Clone repository
2. Load unpacked extension for testing
3. Make changes
4. Test on all target URLs
5. Submit PR

### Code Style
- ES6+ JavaScript
- Consistent logging với prefixes
- Error handling cho all async operations
- Comments cho complex logic

## 📝 License

MIT License - See original extensions for details.

---

## 🎯 Kết luận

**HH3D Helper v2.0.0** là extension all-in-one hoàn hảo cho users HoatHinh3D:

- ✅ **Đầy đủ tính năng**: Tế Lễ + Điểm Danh + Vấn Đáp
- ✅ **Dễ sử dụng**: Single extension, unified interface  
- ✅ **Hiệu quả cao**: AI detection, auto mode, human-like behavior
- ✅ **Stable & Safe**: Comprehensive error handling, local storage only

**Upgrade ngay** để có trải nghiệm HoatHinh3D automation tối ưu nhất! 🚀
