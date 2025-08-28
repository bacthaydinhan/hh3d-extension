# HH3D Extension Merge Plan

## Tổng quan
Merge hai extension hiện tại thành một extension tổng hợp tên `hh3d` với đầy đủ chức năng từ cả hai extension gốc.

## Extension hiện tại cần merge

### 1. hh3d-tele-diemdanh
- **Chức năng**: Tự động Tế Lễ và Điểm Danh
- **URLs**: 
  - Tế Lễ: `https://hoathinh3d.mx/danh-sach-thanh-vien-tong-mon?t=af075`
  - Điểm Danh: `https://hoathinh3d.mx/diem-danh?t=223e4`
- **Features**:
  - Popup với 2 nút: "TẾ LỄ" và "ĐIỂM DANH"
  - Tự động click nút trên webpage
  - Xử lý popup xác nhận (SweetAlert2)
  - Lưu trạng thái last clicked

### 2. hh3d-vandap
- **Chức năng**: Tự động giải Vấn Đáp
- **URLs**: `https://hoathinh3d.mx/van-dap-tong-mon*`
- **Features**:
  - AI phát hiện câu hỏi thông minh (multi-strategy detection)
  - Shadow DOM support và fuzzy matching
  - Auto-click với human-like behavior
  - Auto mode hoàn toàn qua 5 câu hỏi
  - Pin popup functionality
  - Real-time status tracking
  - Comprehensive logging

## Cấu trúc Extension mới: hh3d

```
hh3d/
├── manifest.json
├── README.md
├── background.js
├── popup.html
├── popup.js
├── popup.css
├── content-tele-diemdanh.js
├── content-vandap.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── sounds/
    └── notification.mp3 (optional)
```

## Manifest.json merge

```json
{
  "manifest_version": 3,
  "name": "HH3D Helper - All-in-One Extension",
  "version": "2.0.0",
  "description": "Extension tổng hợp hỗ trợ Tế Lễ, Điểm Danh và Vấn Đáp trên HoatHinh3D",
  
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },

  "background": {
    "service_worker": "background.js"
  },

  "permissions": [
    "tabs", 
    "scripting", 
    "webNavigation", 
    "storage",
    "activeTab"
  ],
  
  "host_permissions": ["https://hoathinh3d.mx/*"],

  "content_scripts": [
    {
      "matches": [
        "https://hoathinh3d.mx/danh-sach-thanh-vien-tong-mon*",
        "https://hoathinh3d.mx/diem-danh*"
      ],
      "js": ["content-tele-diemdanh.js"],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "https://hoathinh3d.mx/van-dap-tong-mon*"
      ],
      "js": ["content-vandap.js"],
      "run_at": "document_idle"
    }
  ],

  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

## Content Scripts Strategy

### 1. content-tele-diemdanh.js
- Giữ nguyên logic từ `hh3d-tele-diemdanh/src/content.js`
- Xử lý messages cho actions: `clickTeLeButton`, `clickDiemDanhButton`
- Chỉ hoạt động trên URLs tương ứng

### 2. content-vandap.js  
- Giữ nguyên toàn bộ logic từ `hh3d-vandap/content.js`
- Class `VanDapHelper` với đầy đủ tính năng AI detection
- Chỉ hoạt động trên van-dap URLs

## Popup Interface Design

### Layout cải tiến:
```
┌─────────────────────────────┐
│     🎯 HH3D HELPER         │
├─────────────────────────────┤
│ ⚡ HOẠT ĐỘNG HÀNG NGÀY      │
│ [  TẾ LỄ  ] [ĐIỂM DANH]    │
├─────────────────────────────┤
│ 🧠 VẤN ĐÁP THÔNG MINH      │
│ [Auto: ●] [Pin: ●] [Stop]  │
│ Câu hỏi: 2/5               │
│ Status: Đang tìm...        │
├─────────────────────────────┤
│ 📊 Kết quả: ✅ Thành công   │
└─────────────────────────────┘
```

### Sections:
1. **Hoạt động hàng ngày**: Tế Lễ + Điểm Danh buttons
2. **Vấn đáp thông minh**: Controls + real-time status
3. **Kết quả**: Unified result display

## Background.js merge

### Features tích hợp:
- Message routing dựa trên action type
- Tab management cho cả tính năng
- State persistence cho cả modules
- Error handling tổng hợp

### Message Actions:
- `openAndClick`: Tế Lễ workflow
- `checkInCurrentTab`: Điểm Danh workflow  
- `vandap_*`: Tất cả Vấn Đáp actions

## CSS/Styling merge

### Principles:
- Consistent color scheme và typography
- Responsive layout cho sections khác nhau
- Icons và visual feedback
- Animation transitions

### Color scheme:
- Primary: `#4CAF50` (green)
- Secondary: `#2196F3` (blue) 
- Warning: `#FF9800` (orange)
- Error: `#F44336` (red)
- Background: `#f8f9fa`

## State Management

### Chrome Storage structure:
```javascript
{
  // Tế Lễ - Điểm Danh state
  "lastTeLeClick": timestamp,
  "lastDiemDanhClick": timestamp,
  
  // Vấn Đáp state  
  "vandap_pinned": boolean,
  "vandap_autoMode": boolean,
  "vandap_settings": {
    autoClickDelay: number,
    nextQuestionDelay: number
  }
}
```

## Error Handling & Logging

### Unified logging system:
- Prefix theo module: `[TeLe]`, `[DiemDanh]`, `[VanDap]`
- Log levels: `info`, `warn`, `error`
- Centralized error reporting

### User feedback:
- Toast notifications cho actions
- Real-time status updates
- Clear error messages

## Testing Strategy

### Test scenarios:
1. **Tế Lễ flow**: Navigate → Click → Confirm popup
2. **Điểm Danh flow**: Navigate → Click → Handle results  
3. **Vấn Đáp flow**: Question detection → Answer selection → Auto mode
4. **State persistence**: Reload popup, reopen browser
5. **Error scenarios**: Network issues, missing elements

### Mock testing:
- Giữ nguyên mock files từ cả hai extension
- Tạo unified mock page để test cả tính năng

## Migration & Backward Compatibility

### Từ extension cũ:
- Import settings từ chrome.storage của extension cũ
- Migration script cho format mới
- Graceful fallback cho missing data

### Version strategy:
- Major version 2.0.0 cho merged extension
- Semantic versioning cho updates

## Performance Considerations

### Optimization:
- Lazy loading content scripts theo URL match
- Minimize background script footprint
- Efficient DOM observation với IntersectionObserver
- Debounced state updates

### Memory management:
- Cleanup intervals và observers
- Avoid memory leaks trong content scripts
- Efficient message passing

## Security & Privacy

### Permissions:
- Minimum required permissions
- Host permissions chỉ cho hoathinh3d.mx
- No external API calls

### Data handling:
- Local storage only
- No sensitive data transmission
- Clear data retention policy

## Deployment Plan

### Phase 1: Core merge
1. Tạo base structure
2. Merge manifest và background
3. Basic popup với cả sections

### Phase 2: Content scripts integration  
1. Adapt content-tele-diemdanh.js
2. Adapt content-vandap.js  
3. Test message routing

### Phase 3: UI/UX polish
1. Unified popup design
2. Consistent styling
3. Enhanced user feedback

### Phase 4: Testing & optimization
1. Comprehensive testing
2. Performance optimization
3. Documentation update

## Success Criteria

### Functional requirements:
- ✅ Tế Lễ automation works as before
- ✅ Điểm Danh automation works as before  
- ✅ Vấn Đáp AI detection works as before
- ✅ All advanced features preserved
- ✅ No performance degradation

### User experience:
- ✅ Single extension installation
- ✅ Intuitive unified interface  
- ✅ Clear status feedback
- ✅ Maintained muscle memory for existing users

### Technical requirements:
- ✅ Clean code organization
- ✅ Maintainable architecture
- ✅ Comprehensive error handling
- ✅ Good performance metrics

## Risks & Mitigation

### Potential issues:
1. **URL conflicts**: Different content scripts cho cùng domain
   - **Mitigation**: Specific URL patterns, script isolation
   
2. **State conflicts**: Cả modules cùng dùng storage
   - **Mitigation**: Namespaced storage keys
   
3. **Performance**: Nhiều content scripts loaded
   - **Mitigation**: Conditional loading, cleanup logic
   
4. **User confusion**: Interface mới
   - **Mitigation**: Gradual migration, clear documentation

### Rollback plan:
- Giữ nguyên extension cũ trong dev mode
- Feature flags để disable modules
- Quick revert mechanism

---

## Kết luận

Merge plan này đảm bảo:
- **Không mất chức năng** từ cả hai extension gốc
- **Cải thiện UX** với interface tổng hợp
- **Maintainable architecture** cho future updates
- **Clear migration path** cho users hiện tại

Extension `hh3d` sẽ trở thành solution all-in-one cho tất cả automation needs trên HoatHinh3D.
