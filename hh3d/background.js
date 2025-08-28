// HH3D Helper - Unified Background Script
console.log('[HH3D Background] Service worker started');

// ========== HELPER FUNCTIONS ==========
function waitForTabCompleted(tabId, expectedUrlPrefix, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        cleanup();
        reject(new Error("Timeout chờ trang tải xong"));
      }
    }, timeoutMs);

    function onCompleted(details) {
      if (details.tabId === tabId && details.url && details.url.startsWith(expectedUrlPrefix)) {
        done = true;
        cleanup();
        resolve();
      }
    }
    function cleanup() {
      try { chrome.webNavigation.onCompleted.removeListener(onCompleted); } catch {}
      clearTimeout(timer);
    }

    chrome.webNavigation.onCompleted.addListener(onCompleted);
  });
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("Không tìm thấy tab đang hoạt động");
  return tab.id;
}

// ========== STATE MANAGEMENT ==========
let lastClickedStatus = "";

// ========== INSTALLATION HANDLER ==========
chrome.runtime.onInstalled.addListener(() => {
    console.log('[HH3D Background] HH3D Helper installed successfully');
});

// ========== AUTO POPUP FOR VAN DAP ==========
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Xử lý cả khi trang load xong và khi URL thay đổi
    if (!tab.url || (changeInfo.status !== 'complete' && !changeInfo.url)) {
        return;
    }

    // Kiểm tra xem có phải trang vấn đáp không
    const isVanDapPage = tab.url.includes('hoathinh3d.mx/van-dap-tong-mon') || 
                         tab.url.includes('mock-vandap.html');
    
    if (isVanDapPage) {
        console.log('[HH3D Background] Detected vấn đáp page:', tab.url);
        
        try {
            // Đợi một chút để content script load xong
            setTimeout(async () => {
                try {
                    // Tự động mở popup
                    await chrome.action.openPopup();
                    console.log('[HH3D Background] Auto-opened popup for vấn đáp page');
                } catch (error) {
                    console.warn('[HH3D Background] openPopup may require user gesture. Showing badge.');
                    // Fallback: show badge to indicate extension is ready
                    chrome.action.setBadgeText({ text: '!', tabId: tabId });
                    chrome.action.setBadgeBackgroundColor({ color: '#FF6B6B' });
                    console.log('[HH3D Background] Set badge as fallback');
                }
            }, 1000);
            
        } catch (error) {
            console.error('[HH3D Background] Error in auto-popup setup:', error);
        }
    }
});

// Lắng nghe khi user navigate đến tab đã có sẵn
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        
        // Kiểm tra xem có phải trang vấn đáp không
        const isVanDapPage = tab.url && (
            tab.url.includes('hoathinh3d.mx/van-dap-tong-mon') || 
            tab.url.includes('mock-vandap.html')
        );
        
        if (isVanDapPage) {
            console.log('[HH3D Background] Activated vấn đáp tab:', tab.url);
            
            // Đợi một chút rồi mở popup
            setTimeout(async () => {
                try {
                    await chrome.action.openPopup();
                    console.log('[HH3D Background] Auto-opened popup for activated vấn đáp tab');
                } catch (error) {
                    console.warn('[HH3D Background] Could not auto-open popup (user gesture required)');
                    // Show badge as indicator
                    chrome.action.setBadgeText({ text: '!', tabId: activeInfo.tabId });
                    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
                }
            }, 500);
        }
    } catch (error) {
        console.error('[HH3D Background] Error handling tab activation:', error);
    }
});

// ========== MESSAGE LISTENER ==========
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[HH3D Background] Received message:', request);
    
    // Check if this is an action that needs async handling
    const asyncActions = ["openAndClick", "checkInCurrentTab", "openPopup"];
    const needsAsync = asyncActions.includes(request.action);
    
    if (needsAsync) {
        // Handle async actions
        (async () => {
            try {
                // ========== TẾ LỄ & ĐIỂM DANH ACTIONS ==========
                if (request.action === "openAndClick") {
                    // TẾ LỄ flow
                    const url = request.url;
                    const tab = await chrome.tabs.create({ url });
                    await waitForTabCompleted(tab.id, url, 30000);
                    const res = await chrome.tabs.sendMessage(tab.id, { action: "clickTeLeButton" });
                    lastClickedStatus = res?.status || "unknown";
                    sendResponse({ ok: true, ...res });

                } else if (request.action === "checkInCurrentTab") {
                    // ĐIỂM DANH flow
                    const url = request.url;
                    const tabId = await getActiveTabId();
                    
                    // Navigate to điểm danh page
                    await chrome.tabs.update(tabId, { url });
                    await waitForTabCompleted(tabId, url, 30000);
                    
                    const res = await chrome.tabs.sendMessage(tabId, { action: "clickDiemDanhButton" });
                    lastClickedStatus = res?.status || "unknown";
                    sendResponse({ ok: true, ...res });

                } else if (request.action === 'openPopup') {
                    try {
                        await chrome.action.openPopup();
                        sendResponse({ success: true });
                    } catch (error) {
                        console.error('[HH3D Background] Error opening popup:', error);
                        sendResponse({ success: false, error: error.message });
                    }
                }

            } catch (error) {
                console.error('[HH3D Background] Error processing message:', error);
                sendResponse({ 
                    ok: false, 
                    success: false,
                    error: error?.message || String(error) 
                });
            }
        })();
        
        return true; // Indicates async response
    } else {
        // Handle sync actions immediately
        try {
            if (request.action === 'logEvent') {
                console.log('[HH3D Background] Event logged:', request.data);
                sendResponse({ success: true });
                
            } else {
                console.warn('[HH3D Background] Unknown action:', request.action);
                sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('[HH3D Background] Error processing sync message:', error);
            sendResponse({ 
                success: false,
                error: error?.message || String(error) 
            });
        }
        
        return false; // Sync response, no need to keep channel open
    }
});
