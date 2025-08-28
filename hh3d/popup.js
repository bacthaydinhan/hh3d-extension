// HH3D Helper - Unified Popup Script
class HH3DPopup {
    constructor() {
        this.currentState = null;
        this.updateInterval = null;
        this.isPinned = false;
        this.isAutoMode = false;
        this.init();
    }

    init() {
        console.log('[HH3D Popup] Initializing unified popup...');
        this.loadPersistedState();
        this.setupEventListeners();
        this.setupMessageListener();
        this.checkCurrentPage();
        this.startPeriodicUpdate();
        this.requestStateUpdate();
    }

    // ========== MESSAGE LISTENER ==========
    setupMessageListener() {
        // Listen for VanDap state updates
        chrome.runtime.onMessage.addListener((message) => {
            if (message.action === 'vandap_stateUpdate') {
                this.updateVanDapUI(message.state);
            }
        });
    }

    // ========== STATE MANAGEMENT ==========
    loadPersistedState() {
        try {
            chrome.storage.local.get(['pinned', 'autoMode'], (result) => {
                if (result.pinned) {
                    this.togglePin(true);
                }
                if (result.autoMode) {
                    this.toggleAutoMode(true);
                }
            });
        } catch (e) {
            console.warn('[HH3D Popup] Could not load persisted state:', e);
        }
    }

    // ========== EVENT LISTENERS ==========
    setupEventListeners() {
        // ===== TẾ LỄ & ĐIỂM DANH =====
        const teLeBtn = document.getElementById("te-le-button");
        if (teLeBtn) {
            teLeBtn.addEventListener("click", async () => {
                await this.handleTeLe();
            });
        }

        const diemDanhBtn = document.getElementById("diem-danh-button");
        if (diemDanhBtn) {
            diemDanhBtn.addEventListener("click", async () => {
                await this.handleDiemDanh();
            });
        }

        // ===== VẤN ĐÁP CONTROLS =====
        const autoToggle = document.getElementById('auto-toggle');
        if (autoToggle) {
            autoToggle.addEventListener('change', (e) => {
                this.toggleAutoMode(e.target.checked);
            });
        }

        const pinToggle = document.getElementById('pin-toggle');
        if (pinToggle) {
            pinToggle.addEventListener('change', (e) => {
                this.togglePin(e.target.checked);
            });
        }

        const stopButton = document.getElementById('stop-button');
        if (stopButton) {
            stopButton.addEventListener('click', () => {
                this.stopVanDap();
            });
        }
    }

    // ========== TẾ LỄ & ĐIỂM DANH HANDLERS ==========
    async handleTeLe() {
        const url = "https://hoathinh3d.mx/danh-sach-thanh-vien-tong-mon?t=af075";
        this.setResult("Đang xử lý Tế Lễ...", "warning");
        
        try {
            const res = await chrome.runtime.sendMessage({ action: "openAndClick", url });
            if (res?.ok) {
                this.setResult(res.message || "✅ Đã Tế Lễ thành công", "success");
            } else {
                this.setResult(res?.error || "❌ Lỗi không xác định", "error");
            }
        } catch (e) {
            this.setResult("❌ " + (e?.message || String(e)), "error");
        }
    }

    async handleDiemDanh() {
        const url = "https://hoathinh3d.mx/diem-danh?t=223e4";
        this.setResult("Đang xử lý Điểm Danh...", "warning");
        
        try {
            const res = await chrome.runtime.sendMessage({ action: "checkInCurrentTab", url });
            if (res?.ok) {
                this.setResult(res.message || "✅ Đã Điểm Danh thành công", "success");
            } else {
                this.setResult(res?.error || "❌ Lỗi không xác định", "error");
            }
        } catch (e) {
            this.setResult("❌ " + (e?.message || String(e)), "error");
        }
    }

    // ========== VẤN ĐÁP HANDLERS ==========
    toggleAutoMode(enabled = null) {
        if (enabled === null) {
            this.isAutoMode = !this.isAutoMode;
        } else {
            this.isAutoMode = enabled;
        }

        const autoToggle = document.getElementById('auto-toggle');
        if (autoToggle) {
            autoToggle.checked = this.isAutoMode;
        }

        // Save to storage
        chrome.storage.local.set({ autoMode: this.isAutoMode });

        // Send message to content script
        this.sendMessageToCurrentTab({
            action: 'vandap_toggleAuto',
            enabled: this.isAutoMode
        });

        console.log('[HH3D Popup] Auto mode:', this.isAutoMode ? 'ENABLED' : 'DISABLED');
    }

    togglePin(enabled = null) {
        if (enabled === null) {
            this.isPinned = !this.isPinned;
        } else {
            this.isPinned = enabled;
        }

        const pinToggle = document.getElementById('pin-toggle');
        if (pinToggle) {
            pinToggle.checked = this.isPinned;
        }

        // Save to storage
        chrome.storage.local.set({ pinned: this.isPinned });

        // Apply pin behavior
        if (this.isPinned) {
            // Prevent popup from closing on outside clicks
            document.addEventListener('click', this.preventClose, true);
        } else {
            document.removeEventListener('click', this.preventClose, true);
        }

        console.log('[HH3D Popup] Pin mode:', this.isPinned ? 'ENABLED' : 'DISABLED');
    }

    preventClose(e) {
        e.stopPropagation();
    }

    stopVanDap() {
        this.sendMessageToCurrentTab({
            action: 'vandap_stop'
        });
        this.setResult("⏹️ Đã dừng Vấn Đáp", "warning");
    }

    // ========== UTILITY METHODS ==========
    async sendMessageToCurrentTab(message) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id && tab.url) {
                // Only send to relevant pages
                const isRelevantPage = tab.url.includes('hoathinh3d.mx') || 
                                     tab.url.includes('mock-vandap.html') ||
                                     tab.url.includes('test.html');
                
                if (isRelevantPage) {
                    await chrome.tabs.sendMessage(tab.id, message);
                    console.log('[HH3D Popup] Message sent to tab:', message.action);
                } else {
                    console.log('[HH3D Popup] Skipping message to non-relevant page:', tab.url);
                }
            }
        } catch (e) {
            // This is expected for pages without content scripts
            console.log('[HH3D Popup] No content script available on current page');
        }
    }

    checkCurrentPage() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.url) {
                const url = tabs[0].url;
                const isVanDapPage = url.includes('van-dap-tong-mon') || url.includes('mock-vandap.html');
                
                // Show/hide VanDap section based on current page
                const vandapSection = document.querySelector('.vandap-section');
                if (vandapSection) {
                    vandapSection.style.display = isVanDapPage ? 'block' : 'none';
                }

                if (isVanDapPage) {
                    this.setResult("🧠 Sẵn sàng cho Vấn Đáp", "success");
                } else {
                    this.setResult("⚡ Sẵn sàng hoạt động", "success");
                }
            }
        });
    }

    startPeriodicUpdate() {
        // Only update on VanDap pages
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.url) {
                const isVanDapPage = tabs[0].url.includes('van-dap-tong-mon') || 
                                   tabs[0].url.includes('mock-vandap.html');
                
                if (isVanDapPage) {
                    this.updateInterval = setInterval(() => {
                        this.requestStateUpdate();
                    }, 1000);
                }
            }
        });
    }

    requestStateUpdate() {
        // Check if we're on a VanDap page before requesting
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.url) {
                const isVanDapPage = tabs[0].url.includes('van-dap-tong-mon') || 
                                   tabs[0].url.includes('mock-vandap.html');
                
                if (isVanDapPage) {
                    this.sendMessageToCurrentTab({
                        action: 'vandap_getState'
                    });
                }
            }
        });
    }

    updateVanDapUI(state) {
        if (!state) return;

        // Update question counter
        const questionCounter = document.getElementById('question-counter');
        if (questionCounter) {
            questionCounter.textContent = `${state.questionCount || 0}/5`;
        }

        // Update status
        const statusText = document.getElementById('status-text');
        if (statusText) {
            statusText.textContent = state.status || 'Chờ khởi động...';
        }

        // Update current question
        const questionDisplay = document.querySelector('.question-display .question-text');
        const answerDisplay = document.querySelector('.question-display .answer-text');
        
        if (questionDisplay) {
            questionDisplay.textContent = state.currentQuestion || 'Chưa có câu hỏi';
        }
        
        if (answerDisplay) {
            answerDisplay.textContent = state.currentAnswer || 'Chưa có đáp án';
        }

        // Update result based on VanDap state
        if (state.status && state.status !== 'Chờ khởi động...') {
            this.setResult(`🧠 ${state.status}`, "success");
        }
    }

    setResult(message, type = "success") {
        const resultEl = document.getElementById("result-message");
        if (resultEl) {
            resultEl.textContent = message;
            resultEl.className = `result-message ${type}`;
        }
    }

    // ========== CLEANUP ==========
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        document.removeEventListener('click', this.preventClose, true);
    }
}

// Initialize popup when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    window.hh3dPopup = new HH3DPopup();
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (window.hh3dPopup) {
        window.hh3dPopup.destroy();
    }
});
