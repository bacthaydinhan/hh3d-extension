// HH3D Vấn Đáp Helper - Content Script
class VanDapHelper {
    constructor() {
        this.isTestMode = this.detectTestMode();
        this.isActive = false;
        this.autoClick = false;
        this.currentQuestion = null;
        this.currentAnswer = null;
        this.questionCount = 0;
        this.maxQuestions = 5;
        this.observer = null;
        this.autoMode = false; // Chế độ tự động hoàn toàn
        this.autoClickDelay = 1000; // Delay trước khi click (ms)
        this.nextQuestionDelay = 1000; // Delay chờ câu hỏi tiếp theo sau khi click (ms) - UPDATED: giảm xuống 1s
        this.lastQuestionTime = 0; // Thời gian câu hỏi cuối
        this.questionCheckInterval = null; // Interval check câu hỏi
        this.lastQuestionHash = null; // Hash of last processed question to avoid duplicates
        this.processedQuestions = new Set(); // Set để track câu hỏi đã xử lý - ADDED
        this.isProcessing = false; // Flag để tránh xử lý đồng thời - ADDED
        
        this.log('info', `Initialized in ${this.isTestMode ? 'TEST' : 'PROD'} mode`);
        this.log('info', `URL: ${window.location.href}`);
        
        this.init();
    }

    /**
     * Logging helper with context prefix and level support.
     * @param {string} level - Log level (info, warn, error).
     * @param {string} message - Message to log.
     * @param {*} data - Optional data to include.
     */
    log(level, message, data = null) {
        const prefix = '[VanDap Helper]';
        const logMessage = `${prefix} ${message}`;
        
        switch (level) {
            case 'error':
                console.error(logMessage, data || '');
                break;
            case 'warn':
                console.warn(logMessage, data || '');
                break;
            default:
                console.log(logMessage, data || '');
        }
        
        // Send log to background for diagnostics
        try {
            chrome.runtime.sendMessage({
                action: 'logEvent',
                level,
                message,
                data,
                timestamp: Date.now()
            }).catch(() => {
                // Silent fail if background isn't available
            });
        } catch (e) {
            // Silent fail
        }
    }

    // Phát hiện chế độ test (file local) hoặc production
    detectTestMode() {
        const isTest = window.location.protocol === 'file:' || 
                       window.location.href.includes('mock-vandap.html');
        return isTest;
    }

    // Kiểm tra xem có phải trang vấn đáp không
    isVanDapPage() {
        const currentUrl = window.location.href;
        console.log('[VanDap Helper] Checking URL:', currentUrl);
        
        if (this.isTestMode) {
            return currentUrl.includes('mock-vandap.html') || currentUrl.includes('test-vandap.html');
        } else {
            // Kiểm tra nhiều pattern URL khác nhau
            const vanDapPatterns = [
                'hoathinh3d.mx/van-dap-tong-mon',
                'hoathinh3d.mx/van-dap',
                '/van-dap-tong-mon',
                '/van-dap'
            ];
            
            return vanDapPatterns.some(pattern => currentUrl.includes(pattern));
        }
    }

    // Khởi tạo
    init() {
        // Luôn luôn monitor URL changes, không chỉ trên trang vấn đáp
        this.startUrlMonitoring();
        
        if (!this.isVanDapPage()) {
            console.log('[VanDap Helper] Not on vấn đáp page, but monitoring URL changes');
            return;
        }

        console.log('[VanDap Helper] Initializing on vấn đáp page...');
        
        // Đợi DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    // Monitor URL changes cho SPA navigation
    startUrlMonitoring() {
        let currentUrl = window.location.href;
        
        // Override pushState và replaceState
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(...args) {
            originalPushState.apply(history, args);
            setTimeout(() => vanDapHelper.handleUrlChange(), 100);
        };
        
        history.replaceState = function(...args) {
            originalReplaceState.apply(history, args);
            setTimeout(() => vanDapHelper.handleUrlChange(), 100);
        };
        
        // Listen for popstate (back/forward buttons)
        window.addEventListener('popstate', () => {
            setTimeout(() => vanDapHelper.handleUrlChange(), 100);
        });
        
        // Polling fallback để catch mọi URL changes
        setInterval(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                this.handleUrlChange();
            }
        }, 1000);
        
        console.log('[VanDap Helper] Started URL monitoring');
    }

    // Xử lý khi URL thay đổi
    handleUrlChange() {
        const wasVanDapPage = this.isActive;
        const isNowVanDapPage = this.isVanDapPage();
        
        console.log('[VanDap Helper] URL changed. Was vấn đáp:', wasVanDapPage, 'Now vấn đáp:', isNowVanDapPage);
        
        if (!wasVanDapPage && isNowVanDapPage) {
            // Vừa vào trang vấn đáp
            console.log('[VanDap Helper] Entered vấn đáp page, initializing...');
            this.setup();
        } else if (wasVanDapPage && !isNowVanDapPage) {
            // Vừa rời trang vấn đáp
            console.log('[VanDap Helper] Left vấn đáp page, cleaning up...');
            this.cleanup();
        } else if (isNowVanDapPage) {
            // Vẫn ở trang vấn đáp nhưng URL thay đổi (có thể là quiz mới)
            console.log('[VanDap Helper] Still on vấn đáp page, restarting...');
            this.restartQuiz();
        }
    }

    /**
     * Cleanup khi rời trang với reset memory
     */
    cleanup() {
        this.isActive = false;
        this.autoMode = false;
        this.autoClick = false;
        this.currentQuestion = null;
        this.currentAnswer = null;
        this.questionCount = 0;
        this.isProcessing = false;
        
        // Clear processed questions memory
        this.processedQuestions.clear();
        
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        if (this.questionCheckInterval) {
            clearInterval(this.questionCheckInterval);
            this.questionCheckInterval = null;
        }
        
        console.log('[VanDap Helper] Cleaned up');
    }

    // Thiết lập chính
    setup() {
        console.log('[VanDap Helper] Setting up...');
        
        // Đánh dấu đã active
        this.isActive = true;
        
        // Bắt đầu monitor
        this.startMonitoring();
        
        // Bắt đầu kiểm tra câu hỏi định kỳ
        this.startQuestionChecking();
        
        // Kiểm tra câu hỏi ban đầu với delay lớn hơn để DOM load xong
        setTimeout(() => {
            this.checkForNewQuestion();
        }, 2000);
    }

    // Bắt đầu kiểm tra câu hỏi định kỳ
    startQuestionChecking() {
        if (this.questionCheckInterval) {
            clearInterval(this.questionCheckInterval);
        }
        
        // Kiểm tra câu hỏi mỗi 500ms để phản hồi nhanh hơn
        this.questionCheckInterval = setInterval(() => {
            this.checkForNewQuestion();
        }, 500);
        
        console.log('[VanDap Helper] Started periodic question checking');
    }

    // Bắt đầu theo dõi thay đổi DOM
    startMonitoring() {
        if (this.observer) {
            this.observer.disconnect();
        }

        this.observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                    shouldCheck = true;
                }
            });
            
            if (shouldCheck) {
                setTimeout(() => {
                    this.checkForNewQuestion();
                }, 100);
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });

        console.log('[VanDap Helper] Started DOM monitoring');
    }

    // Phát hiện câu hỏi hiện tại
    detectCurrentQuestion() {
        let questionText = null;
        let foundElement = null;
        
        console.log('[VanDap Helper] Detecting question...');
        
        if (this.isTestMode) {
            // Test mode selectors
            const selectors = ['#question', 'h2', '.question'];
            
            for (let selector of selectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    questionText = element.textContent.trim();
                    foundElement = element;
                    console.log(`[VanDap Helper] Found question with selector "${selector}":`, questionText);
                    break;
                }
            }
        } else {
            // Production mode - thử nhiều selector khác nhau
            const selectors = [
                '#question',
                '.question-text',
                '.quiz-question',
                '.question',
                '[class*="question"]',
                '[id*="question"]',
                '[class*="quiz"]',
                '[id*="quiz"]',
                // Thêm các selector phổ biến khác
                '.content h2',
                '.content h3',
                '.quiz-content',
                '.question-content',
                '.quiz-title',
                // Generic selectors để tìm text có dấu ?
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'p', 'div', 'span',
                '.title', '.heading', '.text'
            ];
            
            for (let selector of selectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    
                    for (let element of elements) {
                        const text = element.textContent.trim();
                        // Kiểm tra text có chứa dấu ? và đủ dài để là câu hỏi
                        if (text && text.includes('?') && text.length > 10 && text.length < 500) {
                            questionText = text;
                            foundElement = element;
                            console.log(`[VanDap Helper] Found question with selector "${selector}":`, questionText);
                            break;
                        }
                    }
                    
                    if (questionText) break;
                } catch (error) {
                    console.log(`[VanDap Helper] Error with selector "${selector}":`, error);
                }
            }
        }
        
        // Debug: Log tất cả elements có chứa dấu ?
        if (!questionText) {
            console.log('[VanDap Helper] No question found, debugging...');
            const allElements = document.querySelectorAll('*');
            const elementsWithQuestion = Array.from(allElements)
                .filter(el => el.textContent.includes('?') && el.textContent.trim().length > 5)
                .slice(0, 10); // Chỉ log 10 elements đầu
                
            console.log('[VanDap Helper] Elements containing "?":', elementsWithQuestion.map(el => ({
                tag: el.tagName,
                class: el.className,
                id: el.id,
                text: el.textContent.trim().substring(0, 100)
            })));
        }
        
        return questionText;
    }

    // Tìm đáp án trong database
    findAnswer(question) {
        if (!question) return null;
        
        // Làm sạch text để so sánh tốt hơn
        const cleanQuestion = question.replace(/\s+/g, ' ').trim();
        
        // Tìm exact match trước
        let foundItem = questionData.find(item => 
            item.cau_hoi.replace(/\s+/g, ' ').trim() === cleanQuestion
        );
        
        // Nếu không tìm thấy exact match, tìm partial match
        if (!foundItem) {
            foundItem = questionData.find(item => {
                const cleanDbQuestion = item.cau_hoi.replace(/\s+/g, ' ').trim();
                return cleanDbQuestion.includes(cleanQuestion) || 
                       cleanQuestion.includes(cleanDbQuestion);
            });
        }
        
        return foundItem;
    }

    // Lấy danh sách options hiện tại
    getAvailableOptions() {
        let options = [];
        
        console.log('[VanDap Helper] Detecting options...');
        
        if (this.isTestMode) {
            // Test mode selectors
            const selectors = ['.option', 'button.option', '.quiz-option', 'button'];
            
            for (let selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    options = Array.from(elements)
                        .filter(el => el.textContent.trim().length > 0)
                        .map(el => ({
                            element: el,
                            text: el.textContent.trim()
                        }));
                    console.log(`[VanDap Helper] Found ${options.length} options with selector "${selector}"`);
                    break;
                }
            }
        } else {
            // Production mode - thử nhiều selector
            const selectors = [
                '.option',
                '.quiz-option',
                '.answer-option',
                '.choice',
                '.answer',
                'button[data-index]',
                'button[data-answer]',
                'button[data-option]',
                '[class*="option"]',
                '[class*="choice"]',
                '[class*="answer"]',
                '[id*="option"]',
                '[id*="choice"]',
                '[id*="answer"]',
                // Generic button selectors
                'button:not([class*="start"]):not([class*="submit"]):not([class*="next"])',
                '.quiz-container button',
                '.question-container button',
                '.answers button',
                '.choices button'
            ];
            
            for (let selector of selectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length >= 2) { // Ít nhất 2 options
                        const validOptions = Array.from(elements)
                            .filter(el => {
                                const text = el.textContent.trim();
                                return text.length > 0 && 
                                       text.length < 200 && // Không quá dài
                                       !text.toLowerCase().includes('start') &&
                                       !text.toLowerCase().includes('submit') &&
                                       !text.toLowerCase().includes('next');
                            })
                            .map(el => ({
                                element: el,
                                text: el.textContent.trim()
                            }));
                            
                        if (validOptions.length >= 2) {
                            options = validOptions;
                            console.log(`[VanDap Helper] Found ${options.length} options with selector "${selector}"`);
                            break;
                        }
                    }
                } catch (error) {
                    console.log(`[VanDap Helper] Error with options selector "${selector}":`, error);
                }
            }
        }
        
        // Debug: Nếu không tìm thấy options
        if (options.length === 0) {
            console.log('[VanDap Helper] No options found, debugging...');
            const allButtons = document.querySelectorAll('button');
            const allClickable = document.querySelectorAll('[onclick], .clickable, [role="button"]');
            
            console.log('[VanDap Helper] All buttons:', Array.from(allButtons).map(btn => ({
                tag: btn.tagName,
                class: btn.className,
                id: btn.id,
                text: btn.textContent.trim().substring(0, 50)
            })));
            
            console.log('[VanDap Helper] All clickable elements:', Array.from(allClickable).map(el => ({
                tag: el.tagName,
                class: el.className,
                id: el.id,
                text: el.textContent.trim().substring(0, 50)
            })));
        }
        
        console.log('[VanDap Helper] Final options:', options.map(o => o.text));
        return options;
    }

    // Tự động click đáp án
    autoClickAnswer(answer) {
        if (!answer || (!this.autoClick && !this.autoMode)) return false;
        
        const options = this.getAvailableOptions();
        console.log('[VanDap Helper] Available options:', options.map(o => o.text));
        console.log('[VanDap Helper] Looking for answer:', answer);
        
        // Tìm option chứa đáp án với nhiều strategy
        let targetOption = null;
        
        // Strategy 1: Exact match
        targetOption = options.find(option => {
            const optionText = option.text.toLowerCase().trim();
            const answerText = answer.toLowerCase().trim();
            return optionText === answerText;
        });
        
        // Strategy 2: Contains match
        if (!targetOption) {
            targetOption = options.find(option => {
                const optionText = option.text.toLowerCase().trim();
                const answerText = answer.toLowerCase().trim();
                return optionText.includes(answerText) || answerText.includes(optionText);
            });
        }
        
        // Strategy 3: Fuzzy match (remove special characters)
        if (!targetOption) {
            const cleanAnswer = answer.toLowerCase().replace(/[^\w\s]/g, '').trim();
            targetOption = options.find(option => {
                const cleanOption = option.text.toLowerCase().replace(/[^\w\s]/g, '').trim();
                return cleanOption.includes(cleanAnswer) || cleanAnswer.includes(cleanOption);
            });
        }
        
        // Strategy 4: Word-by-word match
        if (!targetOption) {
            const answerWords = answer.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            targetOption = options.find(option => {
                const optionWords = option.text.toLowerCase().split(/\s+/);
                return answerWords.some(word => optionWords.some(optWord => 
                    optWord.includes(word) || word.includes(optWord)
                ));
            });
        }
        
        if (targetOption) {
            console.log('[VanDap Helper] Auto-clicking answer:', targetOption.text);
            
            // Thử nhiều cách click
            try {
                // Method 1: Regular click
                targetOption.element.click();
                
                // Method 2: Dispatch click event
                setTimeout(() => {
                    const clickEvent = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true
                    });
                    targetOption.element.dispatchEvent(clickEvent);
                }, 100);
                
                // Method 3: Focus and trigger
                setTimeout(() => {
                    targetOption.element.focus();
                    if (targetOption.element.onclick) {
                        targetOption.element.onclick();
                    }
                }, 200);
                
                return true;
            } catch (error) {
                console.error('[VanDap Helper] Error clicking answer:', error);
                return false;
            }
        } else {
            console.log('[VanDap Helper] Could not find matching option for answer:', answer);
            console.log('[VanDap Helper] Available options for comparison:');
            options.forEach((opt, index) => {
                console.log(`  ${index + 1}. "${opt.text}"`);
            });
            return false;
        }
    }

    /**
     * Kiểm tra câu hỏi mới với logic tránh duplicate và limit 5 câu
     */
    checkForNewQuestion() {
        // Kiểm tra xem đã đủ 5 câu hỏi chưa
        if (this.questionCount >= this.maxQuestions) {
            this.log('info', `Đã hoàn thành ${this.maxQuestions} câu hỏi. Dừng auto mode.`);
            this.stopAutoMode();
            return;
        }

        // Kiểm tra xem đang xử lý câu hỏi không
        if (this.isProcessing) {
            return;
        }

        const currentQuestion = this.detectCurrentQuestion();
        
        if (!currentQuestion) {
            return; // Không phát hiện được câu hỏi
        }

        // Tạo hash để so sánh câu hỏi
        const questionHash = this.createQuestionHash(currentQuestion);
        
        // Kiểm tra câu hỏi đã được xử lý chưa
        if (this.processedQuestions.has(questionHash)) {
            return; // Câu hỏi đã được xử lý rồi
        }

        // Kiểm tra nếu giống câu hỏi hiện tại
        if (currentQuestion === this.currentQuestion) {
            return; // Vẫn là câu hỏi cũ
        }
        
        this.log('info', `New question detected (${this.questionCount + 1}/${this.maxQuestions}):`, currentQuestion);
        
        // Đánh dấu đang xử lý
        this.isProcessing = true;
        
        // Cập nhật thông tin câu hỏi
        this.currentQuestion = currentQuestion;
        this.questionCount++;
        this.lastQuestionTime = Date.now();
        
        // Thêm vào set câu hỏi đã xử lý
        this.processedQuestions.add(questionHash);
        
        // Tìm đáp án
        const answerData = this.findAnswer(currentQuestion);
        this.currentAnswer = answerData ? answerData.dap_an : null;
        
        this.log('info', 'Found answer:', this.currentAnswer);
        
        // Gửi update lên popup
        this.sendUpdateToPopup();
        
        // Auto-click nếu ở chế độ auto mode
        if (this.currentAnswer && this.autoMode) {
            setTimeout(() => {
                const success = this.autoClickAnswer(this.currentAnswer);
                if (success) {
                    this.log('info', `Auto-clicked answer: ${this.currentAnswer}`);
                    
                    // Đợi 1s sau khi click để load câu hỏi tiếp theo
                    setTimeout(() => {
                        this.isProcessing = false; // Cho phép xử lý câu hỏi tiếp theo
                        this.log('info', 'Ready for next question after 1s delay');
                        
                        // Nếu đã đủ 5 câu thì dừng
                        if (this.questionCount >= this.maxQuestions) {
                            this.log('info', 'Quiz completed! Stopping auto mode.');
                            this.stopAutoMode();
                        }
                    }, this.nextQuestionDelay); // 1s delay
                } else {
                    this.isProcessing = false;
                    this.log('warn', 'Failed to auto-click answer');
                }
            }, this.autoClickDelay); // Delay trước khi click
        } else {
            this.isProcessing = false; // Không auto-click thì cho phép xử lý tiếp
        }
    }

    /**
     * Tạo hash cho câu hỏi để so sánh
     * @param {string} question - Câu hỏi cần hash
     * @returns {string} Hash của câu hỏi
     */
    createQuestionHash(question) {
        const cleanQuestion = question.trim().toLowerCase();
        let hash = 0;
        for (let i = 0; i < cleanQuestion.length; i++) {
            const char = cleanQuestion.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Làm mới để detect lại tab hiện tại
     */
    refreshCurrentPage() {
        this.log('info', 'Refreshing current page detection...');
        
        // Force check lại page hiện tại
        this.isProcessing = false;
        
        // Kiểm tra ngay lập tức
        this.checkForNewQuestion();
        
        this.log('info', 'Page refresh completed');
    }

    // Chờ câu hỏi tiếp theo trong chế độ auto
    waitForNextQuestion() {
        console.log('[VanDap Helper] Waiting for next question...');
        
        // Reset câu hỏi hiện tại để có thể detect câu mới
        setTimeout(() => {
            this.currentQuestion = null;
            this.currentAnswer = null;
        }, this.nextQuestionDelay);
    }

    // Gửi update lên popup
    sendUpdateToPopup() {
        const data = {
            action: 'questionUpdate',
            question: this.currentQuestion,
            answer: this.currentAnswer,
            questionCount: this.questionCount,
            maxQuestions: this.maxQuestions,
            isVanDapPage: this.isVanDapPage(),
            availableOptions: this.getAvailableOptions().map(o => o.text)
        };
        
        // Gửi message đến popup nếu đang mở
        chrome.runtime.sendMessage(data).catch(() => {
            // Popup có thể chưa mở, không cần xử lý lỗi
        });
    }

    // REMOVED: setAutoClick method - không còn cần thiết

    /**
     * Kích hoạt/tắt chế độ auto hoàn toàn
     * @param {boolean} enabled - Bật/tắt auto mode
     */
    setAutoMode(enabled) {
        this.autoMode = enabled;
        this.log('info', 'Auto mode:', enabled ? 'ENABLED' : 'DISABLED');
        
        if (enabled) {
            // Reset trạng thái để bắt đầu fresh
            this.isProcessing = false;
            
            // Bắt đầu kiểm tra câu hỏi
            setTimeout(() => {
                this.checkForNewQuestion();
            }, 1000);
        } else {
            // Dừng auto mode
            this.isProcessing = false;
        }
    }

    /**
     * Manually click answer
     */
    clickAnswerManually() {
        if (this.currentAnswer) {
            return this.autoClickAnswer(this.currentAnswer);
        }
        return false;
    }

    // Dừng tất cả hoạt động tự động
    stopAutoMode() {
        this.autoMode = false;
        this.autoClick = false;
        console.log('[VanDap Helper] All automation stopped');
    }

    /**
     * Khởi động lại từ đầu với việc reset bộ nhớ hoàn toàn
     */
    restartQuiz() {
        this.log('info', 'Restarting quiz - clearing all memory...');
        
        // Reset tất cả thông tin
        this.questionCount = 0;
        this.currentQuestion = null;
        this.currentAnswer = null;
        this.lastQuestionTime = 0;
        this.isProcessing = false;
        
        // IMPORTANT: Clear processed questions memory
        this.processedQuestions.clear();
        
        this.log('info', 'Quiz restarted - memory cleared');
        
        // Gửi update lên popup
        this.sendUpdateToPopup();
        
        // Kiểm tra câu hỏi ngay lập tức nếu ở chế độ auto
        if (this.autoMode) {
            setTimeout(() => {
                this.checkForNewQuestion();
            }, 1000);
        }
    }

    // Get current state
    getCurrentState() {
        return {
            isVanDapPage: this.isVanDapPage(),
            question: this.currentQuestion,
            answer: this.currentAnswer,
            questionCount: this.questionCount,
            maxQuestions: this.maxQuestions,
            autoMode: this.autoMode,
            availableOptions: this.getAvailableOptions().map(o => o.text),
            isProcessing: this.isProcessing, // ADDED: để hiển thị trạng thái processing
            processedCount: this.processedQuestions.size // ADDED: số câu đã xử lý
        };
    }

    // Debug method để test extension
    debugExtension() {
        console.log('=== VanDap Extension Debug ===');
        console.log('URL:', window.location.href);
        console.log('Is VanDap Page:', this.isVanDapPage());
        console.log('Is Test Mode:', this.isTestMode);
        console.log('Is Active:', this.isActive);
        console.log('Current Question:', this.currentQuestion);
        console.log('Current Answer:', this.currentAnswer);
        console.log('Auto Mode:', this.autoMode);
        console.log('Is Processing:', this.isProcessing);
        console.log('Processed Questions:', this.processedQuestions.size);
        
        // Test question detection
        const detectedQuestion = this.detectCurrentQuestion();
        console.log('Detected Question:', detectedQuestion);
        
        // Test options detection
        const options = this.getAvailableOptions();
        console.log('Available Options:', options);
        
        // Test answer finding
        if (detectedQuestion) {
            const answerData = this.findAnswer(detectedQuestion);
            console.log('Found Answer Data:', answerData);
        }
        
        console.log('=== End Debug ===');
        
        return {
            url: window.location.href,
            isVanDapPage: this.isVanDapPage(),
            isTestMode: this.isTestMode,
            isActive: this.isActive,
            detectedQuestion,
            options: options.map(o => o.text),
            currentState: this.getCurrentState()
        };
    }
}

// Dữ liệu câu hỏi và đáp án (giữ nguyên từ file cũ)
const questionData = [
    {
        "stt": 2,
        "cau_hoi": "Ai là huynh đệ và cũng là người thầy mà Vương Lâm trong Tiên Nghịch kính trọng nhất ?",
        "dap_an": "Tư Đồ Nam"
    },
    {
        "stt": 3,
        "cau_hoi": "Ai là mẹ của Đường Tam?",
        "dap_an": "A Ngân"
    },
    {
        "stt": 4,
        "cau_hoi": "Ai là người đứng đầu Vũ Hồn Điện?",
        "dap_an": "Bỉ Bỉ Đông"
    },
    {
        "stt": 5,
        "cau_hoi": "Ai là nhân vật chính trong bộ phim hoạt hình trung quốc Thần Mộ ?",
        "dap_an": "Thần Nam"
    },
    {
        "stt": 6,
        "cau_hoi": "Bách Lý Đông Quân là nhân vật trong bộ hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Thiếu Niên Bạch Mã Tuý Xuân Phong"
    },
    {
        "stt": 7,
        "cau_hoi": "Bạch Nguyệt Khôi là tên nhân vật chính trong bộ phim hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Linh Lung"
    },
    {
        "stt": 8,
        "cau_hoi": "Bạch Tiểu Thuần là nhân vật chính trong bộ hoạt hình trung quốc nào ?",
        "dap_an": "Nhất Niệm Vĩnh Hằng"
    },
    {
        "stt": 9,
        "cau_hoi": "Bạch Tiểu Thuần trong Nhất Niệm Vĩnh Hằng luôn được ai âm thầm giúp đỡ ?",
        "dap_an": "Đỗ Lăng Phỉ"
    },
    {
        "stt": 10,
        "cau_hoi": "Bộ phim nào sau đây thuộc tiểu thuyết của tác giả Thiên Tằm Thổ Đậu",
        "dap_an": "Tất cả đáp án trên\n(ĐCT, VĐCK, ĐPTK)"
    },
    {
        "stt": 11,
        "cau_hoi": "Các cấp bậc nào sau đây thuộc phim Đấu Phá Thương Khung ?",
        "dap_an": "Đấu Tông"
    },
    {
        "stt": 12,
        "cau_hoi": "Cháu dượng của Bạch Tiểu Thuần trong Nhất Niệm Vĩnh Hằng là ai ?",
        "dap_an": "Tống Khuyết"
    },
    {
        "stt": 13,
        "cau_hoi": "Chủ nhân đời trước của Vẫn Lạc Tâm Viêm trong Đấu Phá Thương Khung là ai ?",
        "dap_an": "Diệu Thiên Hỏa"
    },
    {
        "stt": 14,
        "cau_hoi": "Công pháp gì giúp Tiêu Viêm trong Đấu Phá Thương Khung hấp thụ nhiều loại dị hỏa ?",
        "dap_an": "Phần Quyết"
    },
    {
        "stt": 15,
        "cau_hoi": "Công pháp nào sau đây là của Hàn Lập trong Phàm Nhân Tu Tiên ?",
        "dap_an": "Tất cả đáp án trên (MVQ, TXC, TNKQ)"
    },
    {
        "stt": 16,
        "cau_hoi": "Cơ Tử Nguyệt là nhân vật trong các bộ hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Già Thiên"
    },
    {
        "stt": 17,
        "cau_hoi": "Dạ Táng còn là biệt danh của ai trong Nhất Niệm Vĩnh Hằng ?",
        "dap_an": "Bạch Tiểu Thuần"
    },
    {
        "stt": 18,
        "cau_hoi": "Danh xưng Tàn Thi Bại Thuế là của nhân vật nào trong Hoạ Giang Hồ Chi Bất Lương Nhân ?",
        "dap_an": "Hàng Thần"
    },
    {
        "stt": 19,
        "cau_hoi": "Diễm Linh Cơ là nhân vật trong phim hoạt hình trung quốc nào ?",
        "dap_an": "Thiên Hành Cửu Ca"
    },
    {
        "stt": 20,
        "cau_hoi": "Diệp Phàm là nhân vật chính trong bộ hoạt hình trung quốc nào ?",
        "dap_an": "Già Thiên"
    },
    {
        "stt": 21,
        "cau_hoi": "Diệp Thần trong Tiên Võ Đế Tôn gia nhập Tông Môn nào đầu tiên ?",
        "dap_an": "Chính Dương Tông"
    },
    {
        "stt": 22,
        "cau_hoi": "Dược Trần trong Đấu Phá Thương Khung đã từng bị đồ đệ nào phản bội ?",
        "dap_an": "Hàn Phong"
    },
    {
        "stt": 23,
        "cau_hoi": "Đại ca của Tiêu Viêm trong Đấu Phá Thương Khung tên gì ?",
        "dap_an": "Tiêu Đỉnh"
    },
    {
        "stt": 24,
        "cau_hoi": "Đàm Vân là nhân vật chính trong bộ phim hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Nghịch Thiên Chí Tôn"
    },
    {
        "stt": 25,
        "cau_hoi": "Đạo lữ của Hàn Lập là ai ?",
        "dap_an": "Nam Cung Uyển"
    },
    {
        "stt": 26,
        "cau_hoi": "Đâu là nhân vật chính trong phim Bách Luyện Thành Thần ?",
        "dap_an": "La Chinh"
    },
    {
        "stt": 27,
        "cau_hoi": "Đâu là Thái Cổ Thập Hung trong phim Thế Giới Hoàn Mỹ ?",
        "dap_an": "Tất cả đáp án trên\n(ĐTT, CU, CL)"
    },
    {
        "stt": 28,
        "cau_hoi": "Đâu là tuyệt kỹ số 1 Hạo Thiên Tông mà Đường Hạo dạy cho con trai trong Đấu La Đại Lục ?",
        "dap_an": "Đại Tu Di Chùy"
    },
    {
        "stt": 29,
        "cau_hoi": "Đấu Sát Toàn Viên Kiếm là một kỹ năng trong bộ phim hoạt hình trung quốc nào ?",
        "dap_an": "Thần Ấn Vương Toạ"
    },
    {
        "stt": 30,
        "cau_hoi": "Độc Cô Bác trong Đấu La Đại Lục có vũ hồn gì ?",
        "dap_an": "Bích Lân Xà"
    },
    {
        "stt": 31,
        "cau_hoi": "Em trai ruột của Thạch Hạo trong Thế Giới Hoàn Mỹ là ai ?",
        "dap_an": "Tần Hạo"
    },
    {
        "stt": 32,
        "cau_hoi": "Hàn Lập sở hữu những vật phẩm nào dưới đây ?",
        "dap_an": "Thanh Trúc Phong Vân Kiếm"
    },
    {
        "stt": 33,
        "cau_hoi": "Hàn Lập trong Phàm Nhân Tu Tiên đến Thất Huyền Môn bái ai làm thầy ?",
        "dap_an": "Mặc Đại Phu"
    },
    {
        "stt": 34,
        "cau_hoi": "Hàn Lâp trong Phàm Nhân Tu Tiên gia nhập môn phái nào đầu tiên ?",
        "dap_an": "Thất Huyền Môn"
    },
    {
        "stt": 35,
        "cau_hoi": "Hàn Lập trong Phàm Nhân Tu Tiên từng cứu ai mà bị hấp thụ tu vi giảm xuống Luyện Khí Kỳ ?",
        "dap_an": "Nam Cung Uyển"
    },
    {
        "stt": 36,
        "cau_hoi": "Hoang Thiên Đế là nhân vật chính trong bộ phim hoạt hình trung quốc nổi tiếng nào ?",
        "dap_an": "Thế Giới Hoàn Mỹ"
    },
    {
        "stt": 37,
        "cau_hoi": "Hoắc Vũ Hạo là hậu nhân của ai trong Sử Lai Khắc ?",
        "dap_an": "Đái Mộc Bạch"
    },
    {
        "stt": 38,
        "cau_hoi": "Hồn hoàn màu nào mạnh nhất?",
        "dap_an": "Đỏ"
    },
    {
        "stt": 39,
        "cau_hoi": "Huân Nhi là công chúa của bộ tộc nào?",
        "dap_an": "Cổ Tộc"
    },
    {
        "stt": 40,
        "cau_hoi": "Khi ở Già Nam Học Viện, Tiêu Viêm thu phục được loại dị hỏa nào ?",
        "dap_an": "Vẫn Lạc Tâm Viêm"
    },
    {
        "stt": 41,
        "cau_hoi": "Kính Huyền trong Quyến Tư Lượng là hậu duệ của tộc nào ?",
        "dap_an": "Thần Tộc"
    },
    {
        "stt": 42,
        "cau_hoi": "Lạc Ly trong Đại Chúa Tể là nhân vật trong Tộc nào ?",
        "dap_an": "Lạc Thần Tộc"
    },
    {
        "stt": 43,
        "cau_hoi": "Lâm Động trong Vũ Động Càn Khôn học được Linh Võ Học nào khi vào bia cổ Đại Hoang ?",
        "dap_an": "Đại Hoang Tù Thiên Chỉ"
    },
    {
        "stt": 44,
        "cau_hoi": "Lâm Động trong Vũ Động Càn Khôn luyện hóa Tổ Phù nào đầu tiên ?",
        "dap_an": "Thôn Phệ Tổ Phù"
    },
    {
        "stt": 45,
        "cau_hoi": "Lâm Động trong Vũ Động Càn Khôn sử dụng vũ khí loại nào sau đây ?",
        "dap_an": "Thương"
    },
    {
        "stt": 46,
        "cau_hoi": "Lâm Phong là nhân vật trong bộ hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Vạn Giới Độc Tôn"
    },
    {
        "stt": 47,
        "cau_hoi": "Lâm Thất Dạ là nhân vật trong bộ phim hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Trảm Thần"
    },
    {
        "stt": 48,
        "cau_hoi": "Lâm Thất Dạ trong Trảm Thần sở hữu sức mạnh của vị thần nào ?",
        "dap_an": "Thiên Sứ"
    },
    {
        "stt": 49,
        "cau_hoi": "Long Tuyền Kiếm xuất hiện trong bộ phim hoạt hình nào dưới đây ?",
        "dap_an": "Họa Giang Hồ Chi Bất Lương Nhân"
    },
    {
        "stt": 50,
        "cau_hoi": "Lục Tuyết Kỳ trong Tru Tiên thuộc Phong nào trong Thanh Vân Môn?",
        "dap_an": "Tiểu Trúc Phong"
    },
    {
        "stt": 51,
        "cau_hoi": "Lý Tinh Vân trong Họa Giang Hồ Chi Bất Lương Nhân sử dụng vũ khí nào sau đây ?",
        "dap_an": "Long Tuyền Kiếm"
    },
    {
        "stt": 52,
        "cau_hoi": "Lý Trường Thọ trong Sư Huynh A Sư Huynh xuyên không về Hồng Hoang bái sư ở đâu ?",
        "dap_an": "Độ Tiên Môn"
    },
    {
        "stt": 53,
        "cau_hoi": "Man Hồ Tử trong phim \"Phàm Nhân Tu Tiên\" tu luyện công pháp nào?",
        "dap_an": "Thác Thiên Ma Công"
    },
    {
        "stt": 54,
        "cau_hoi": "Mẫu thân của La Phong trong Thôn Phệ Tinh Không tên là gì ?",
        "dap_an": "Cung Tâm Lan"
    },
    {
        "stt": 55,
        "cau_hoi": "Mẹ của Mạnh Xuyên trong Thương Nguyên Đồ tên là gì ?",
        "dap_an": "Bạch Niệm Vân"
    },
    {
        "stt": 56,
        "cau_hoi": "Mẹ của Tần Trần là ai ?",
        "dap_an": "Tần Nguyệt Trì"
    },
    {
        "stt": 57,
        "cau_hoi": "Mẹ của Thạch Hạo trong Thế Giới Hoàn Mỹ tên là gì",
        "dap_an": "Tần Di Ninh"
    },
    {
        "stt": 58,
        "cau_hoi": "Mối tình đầu của Diệp Thần trong Tiên Võ Đế Tôn là ai ?",
        "dap_an": "Cơ Ngưng Sương"
    },
    {
        "stt": 59,
        "cau_hoi": "Mục đích tu luyện của Vương Lâm trong Tiên Nghịch theo diễn biến phim hiện tại là gì ?",
        "dap_an": "Báo Thù"
    },
    {
        "stt": 60,
        "cau_hoi": "Mục Trần trong Đại Chúa Tể liên kết Huyết Mạch với ?",
        "dap_an": "Cửu U Tước"
    },
    {
        "stt": 61,
        "cau_hoi": "Mục Vân là nhân vật trong bộ hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Vô Thượng Thần Đế"
    },
    {
        "stt": 62,
        "cau_hoi": "Nam chính trong bộ hoạt hình trung quốc Ám Hà Truyện là ai ?",
        "dap_an": "Tô Mộ Vũ"
    },
    {
        "stt": 63,
        "cau_hoi": "Nam chính trong bộ Quyến Tư Lượng là ai ?",
        "dap_an": "Kính Huyền"
    },
    {
        "stt": 64,
        "cau_hoi": "Nghịch Hà Tông là Tông Môn trong bộ hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Nhất Niệm Vĩnh Hằng"
    },
    {
        "stt": 65,
        "cau_hoi": "Nghịch Thiên Nhi Hành là một nhân vật trong bộ phim hh3d nào sau đây ?",
        "dap_an": "Vũ Canh Kỷ"
    },
    {
        "stt": 66,
        "cau_hoi": "Ngụy Anh (Ngụy Vô Tiện) là nhân vật trong bộ hhtq nào sau đây ?",
        "dap_an": "Ma Đạo Tổ Sư"
    },
    {
        "stt": 67,
        "cau_hoi": "Người bạn thuở nhỏ của Trương Tiểu Phàm trong Tru Tiên là ai ?",
        "dap_an": "Lâm Kinh Vũ"
    },
    {
        "stt": 68,
        "cau_hoi": "Nhân vật Bách Lý Đồ Minh xuất hiện trong phim hoạt hình nào dưới đây ?",
        "dap_an": "Trảm Thần Chi Phàm Trần Thần Vực"
    },
    {
        "stt": 69,
        "cau_hoi": "Nhân vật chính của \"Thần Ấn Vương Tọa\" là ai?",
        "dap_an": "Long Hạo Thần"
    },
    {
        "stt": 70,
        "cau_hoi": "Nhân vật chính của Đấu La Đại Lục là ai?",
        "dap_an": "Đường Tam"
    },
    {
        "stt": 71,
        "cau_hoi": "Nhân vật chính Lý Trường Thọ trong Sư Huynh A Sư Huynh đã tỏ tình với ai ?",
        "dap_an": "Vân Tiêu"
    },
    {
        "stt": 72,
        "cau_hoi": "Nhân vật chính trong Thương Nguyên đồ là ai ?",
        "dap_an": "Mạnh Xuyên"
    },
    {
        "stt": 73,
        "cau_hoi": "Nhân vật chính trong Yêu Thần Ký tên là gì ?",
        "dap_an": "Nhiếp Ly"
    },
    {
        "stt": 74,
        "cau_hoi": "Nhân vật nào luôn bất bại trong phim Hoạt Hình Trung Quốc, được ví như One-Punch Man ?",
        "dap_an": "Từ Dương"
    },
    {
        "stt": 75,
        "cau_hoi": "Nhân vật nào sau đây được mệnh danh là Vua Lỳ Đòn trong Đấu Phá Thương Khung ?",
        "dap_an": "Phượng Thanh Nhi"
    },
    {
        "stt": 76,
        "cau_hoi": "Nhị ca của Tiêu Viêm trong Đấu Phá Thương Khung tên gì ?",
        "dap_an": "Tiêu Lệ"
    },
    {
        "stt": 77,
        "cau_hoi": "Nhiếp Phong là nhân vật chính trong phim hoạt hình trung quốc nào ?",
        "dap_an": "Chân Võ Đỉnh Phong"
    },
    {
        "stt": 78,
        "cau_hoi": "Ninh Diêu là một nhân vật trong bộ phim hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Kiếm Lai"
    },
    {
        "stt": 79,
        "cau_hoi": "Nữ chính cũng là vợ Đông Bá Tuyết Ưng trong Tuyết Ưng Lĩnh Chủ là ai sau đây ?",
        "dap_an": "Dư Tĩnh Thu"
    },
    {
        "stt": 80,
        "cau_hoi": "Nữ chính trong bộ Quyến Tư Lượng là ai ?",
        "dap_an": "Đồ Lệ"
    },
    {
        "stt": 81,
        "cau_hoi": "Ông nội của Lâm Động trong Vũ Động Càn Khôn là ai ?",
        "dap_an": "Lâm Chấn Thiên"
    },
    {
        "stt": 82,
        "cau_hoi": "Phụ Thân của Lâm Động trong Vũ Động Càn Khôn là ai ?",
        "dap_an": "Lâm Khiếu"
    },
    {
        "stt": 83,
        "cau_hoi": "Phương Hàn là nhân vật trong bộ hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Vĩnh Sinh"
    },
    {
        "stt": 84,
        "cau_hoi": "Phương Hàn trong Vĩnh Sinh nhận được Giao Phục Hoàng Tuyền Đồ từ ai ?",
        "dap_an": "Bạch Hải Thiện"
    },
    {
        "stt": 85,
        "cau_hoi": "Phương Hàn trong Vĩnh Sinh xuất thân là gì ở nhà họ Phương ?",
        "dap_an": "Nô Bộc"
    },
    {
        "stt": 86,
        "cau_hoi": "Phượng Thanh Nhi trong Đấu Phá Thương Khung thuộc chủng tộc nào ?",
        "dap_an": "Thiên Yêu Hoàng Tộc"
    },
    {
        "stt": 87,
        "cau_hoi": "Số hiệu vị thần của main trong Trảm Thần: Phàm Trần Thần Vực là số mấy ?",
        "dap_an": "003"
    },
    {
        "stt": 88,
        "cau_hoi": "Sử Lai Khắc Thất Quái đã từng đến nơi nào để luyện tập?",
        "dap_an": "Hải Thần Đảo"
    },
    {
        "stt": 89,
        "cau_hoi": "Sư mẫu của Bạch Tiểu Thuần trong Nhất Niệm Vĩnh Hằng là ai ?",
        "dap_an": "Hứa Mị Nương"
    },
    {
        "stt": 90,
        "cau_hoi": "Sư phụ của Bạch Tiểu Thuần trong Nhất Niệm Vĩnh Hằng là ai ?",
        "dap_an": "Lý Thanh Hậu"
    },
    {
        "stt": 91,
        "cau_hoi": "Sư phụ của Lý Trường Thọ là ai ?",
        "dap_an": "Tề Nguyên"
    },
    {
        "stt": 92,
        "cau_hoi": "Sư phụ mà Diệp Thần yêu trong Tiên Võ Đế Tôn là ai ?",
        "dap_an": "Sở Huyên Nhi"
    },
    {
        "stt": 93,
        "cau_hoi": "Sư Phụ thứ 2 của Lý Trường Thọ trong phim",
        "dap_an": "Thái Thanh Thánh Nhân"
    },
    {
        "stt": 94,
        "cau_hoi": "Tại sao Đường Tam bị Đường Môn truy sát ở tập đầu phim Đấu La Đại Lục ?",
        "dap_an": "Học trộm tuyệt học bổn môn"
    },
    {
        "stt": 95,
        "cau_hoi": "Tần Vũ trong Tinh Thần Biến được tặng pháp bảo siêu cấp vip pro nào để tu luyện nhanh chóng ?",
        "dap_an": "Khương Lan Tháp"
    },
    {
        "stt": 96,
        "cau_hoi": "Tần Vũ trong Tinh Thần Biến khiếm khuyết đan điền nhờ đâu mới có thể tu luyện ?",
        "dap_an": "Lưu Tinh Lệ"
    },
    {
        "stt": 97,
        "cau_hoi": "Thánh nữ nào trong Già Thiên bị nhân vật chính Diệp Phàm lấy mất cái áo lót ?",
        "dap_an": "Diêu Hi"
    },
    {
        "stt": 98,
        "cau_hoi": "Thần Thông Bí Cảnh xuất hiện trong bộ phim hoạt hình nào dưới đây ?",
        "dap_an": "Vĩnh Sinh"
    },
    {
        "stt": 99,
        "cau_hoi": "Thần vị mà Đường Tam đạt được là gì?",
        "dap_an": "Hải Thần và Tu La Thần"
    },
    {
        "stt": 100,
        "cau_hoi": "Thế lực nào là đối thủ lớn nhất của Tiêu Viêm trong Đấu Phá Thương Khung?",
        "dap_an": "Hồn Điện"
    },
    {
        "stt": 101,
        "cau_hoi": "Thú cưng Thôn Thôn trong Nguyên Tôn sinh ra có sức mạnh ngang cảnh giới nào ?",
        "dap_an": "Thái Sơ Cảnh"
    },
    {
        "stt": 102,
        "cau_hoi": "Tiêu Khinh Tuyết xuất hiện trong bộ hoạt hình nào dưới đây ?",
        "dap_an": "Tuyệt Thế Chiến Hồn"
    },
    {
        "stt": 103,
        "cau_hoi": "Tiêu Viêm đã lập nên thế lực nào khi ở Học Viện Già Nam ?",
        "dap_an": "Bàn Môn"
    },
    {
        "stt": 104,
        "cau_hoi": "Tiêu Viêm trong Đấu Phá Thương Khung đã Hẹn Ước 3 Năm với ai ?",
        "dap_an": "Nạp Lan Yên Nhiên"
    },
    {
        "stt": 105,
        "cau_hoi": "Tiêu Viêm trong Đấu Phá Thương Khung sử dụng loại vũ khí nào sau đây ?",
        "dap_an": "Thước"
    },
    {
        "stt": 106,
        "cau_hoi": "Tiêu Viêm trong Đấu Phá Thương Khung thuộc gia tộc nào?",
        "dap_an": "Tiêu Gia"
    },
    {
        "stt": 107,
        "cau_hoi": "Tình đầu của Diệp Phàm trong Già Thiên là ai ?",
        "dap_an": "Lý Tiểu Mạn"
    },
    {
        "stt": 108,
        "cau_hoi": "Trần Bình An là nam chính trong bộ phim hoạt hình trung quốc nào ?",
        "dap_an": "Kiếm Lai"
    },
    {
        "stt": 109,
        "cau_hoi": "Triệu Ngọc Chân là nhân vật trong bộ hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Thiếu Niên Bạch Mã Túy Xuân Phong"
    },
    {
        "stt": 110,
        "cau_hoi": "Trong bộ Đấu Phá Thương Khung, Tiêu Viêm tìm đến ai để cứu Dược Lão ?",
        "dap_an": "Phong Tôn Giả"
    },
    {
        "stt": 111,
        "cau_hoi": "Trong bộ Tiên Nghịch, nhân vật chính Vương Lâm khi ở quê nhà còn có tên khác là gì ?",
        "dap_an": "Thiết Trụ"
    },
    {
        "stt": 112,
        "cau_hoi": "Trong Đấu La Đại Lục, Đường Hạo là gì của Đường Tam?",
        "dap_an": "Cha"
    },
    {
        "stt": 113,
        "cau_hoi": "Trong Già Thiên, thể chất Diệp Phàm là thể chất gì ?",
        "dap_an": "Hoang Cổ Thánh Thể"
    },
    {
        "stt": 114,
        "cau_hoi": "Trong Phàm Nhân Tu Tiên ai bị luyện thành khôi lỗi Khúc Hồn ?",
        "dap_an": "Trương Thiết"
    },
    {
        "stt": 115,
        "cau_hoi": "Trong phim Tiên Nghịch, Vương Lâm vô tình có được pháp bảo nghịch thiên nào ?",
        "dap_an": "Thiên Nghịch Châu"
    },
    {
        "stt": 116,
        "cau_hoi": "Trong Tiên Nghịch, Vương Lâm nhận được truyền thừa gì ở Cổ Thần Chi Địa ?",
        "dap_an": "Ký Ức"
    },
    {
        "stt": 117,
        "cau_hoi": "Trong Tru Tiên, Điền Bất Dịch là thủ tọa của Phong nào?",
        "dap_an": "Đại Trúc Phong"
    },
    {
        "stt": 118,
        "cau_hoi": "Trong Vĩnh Sinh - Phương Hàn hẹn ước 10 năm cùng với ai ?",
        "dap_an": "Hoa Thiên Đô"
    },
    {
        "stt": 119,
        "cau_hoi": "Trước khi đến Linh Khê Tông, Bạch Tiểu Thuần trong Nhất Niệm Vĩnh Hằng ở đâu ?",
        "dap_an": "Mạo Nhi Sơn Thôn"
    },
    {
        "stt": 120,
        "cau_hoi": "Trương Tiểu Phàm trong phim Tru Tiên còn có tên gọi là ?",
        "dap_an": "Quỷ Lệ"
    },
    {
        "stt": 121,
        "cau_hoi": "Trương Tiểu Phàm trong Tru Tiên từng được nhận vào môn phái nào?",
        "dap_an": "Thanh Vân Môn"
    },
    {
        "stt": 122,
        "cau_hoi": "Tử Nghiên trong Đấu Phá Thương Khung thuộc chủng tộc nào ?",
        "dap_an": "Thái Hư Cổ Long"
    },
    {
        "stt": 123,
        "cau_hoi": "Vân Triệt là tên nhân vật chính trong bộ phim hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Nghịch Thiên Tà Thần"
    },
    {
        "stt": 124,
        "cau_hoi": "Vũ Canh là nhân vật trong bộ hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Vũ Canh Kỷ"
    },
    {
        "stt": 125,
        "cau_hoi": "Vũ hồn của Chu Trúc Thanh là gì?",
        "dap_an": "U Minh Linh Miêu"
    },
    {
        "stt": 126,
        "cau_hoi": "Vũ hồn của Đới Mộc Bạch là gì?",
        "dap_an": "Bạch Hổ"
    },
    {
        "stt": 127,
        "cau_hoi": "Vũ hồn của Mã Hồng Tuấn là gì?",
        "dap_an": "Hỏa Phượng Hoàng"
    },
    {
        "stt": 128,
        "cau_hoi": "Vũ hồn của Tiểu Vũ là gì?",
        "dap_an": "Nhu Cốt Thỏ"
    },
    {
        "stt": 129,
        "cau_hoi": "Vũ hồn thứ hai của Đường Tam là gì?",
        "dap_an": "Hạo Thiên Chùy"
    },
    {
        "stt": 130,
        "cau_hoi": "Vũ khí của Đàm Vân trong Nghịch Thiên Chí Tôn là gì ?",
        "dap_an": "Hồng Mông Thần Kiếm"
    },
    {
        "stt": 131,
        "cau_hoi": "Vũ khí mà Tiêu Viêm trong Đấu Phá Thương Khung luôn mang bên mình có tên gọi là gì ?",
        "dap_an": "Huyền Trọng Xích"
    },
    {
        "stt": 132,
        "cau_hoi": "Vương Lâm trong phim Tiên Nghịch dựa vào gì để vô địch cùng cảnh giới ?",
        "dap_an": "Cực Cảnh"
    },
    {
        "stt": 133,
        "cau_hoi": "Y Lai Khắc Tư là một nhân vật trong bộ phim hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Cả 1 và 2 (ĐLĐL2, TÂVT)"
    },
    {
        "stt": 134,
        "cau_hoi": "Ai là người thầy của Đường Tam?",
        "dap_an": "Đại Sư"
    },
    {
        "stt": 135,
        "cau_hoi": "Thiên Hoả Tôn Giả trong Đấu Phá Thương Khung dùng thi thể của ai để hồi sinh ?",
        "dap_an": "Vân Sơn"
    },
    {
        "stt": 136,
        "cau_hoi": "Lâm Thất Dạ là nhân vật trong bộ hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Trảm Thần"
    },
    {
        "stt": 137,
        "cau_hoi": "Ám tinh giới được xuất hiện trong bộ phim hoạt hình nào dưới đây ?",
        "dap_an": "Tinh Thần Biến"
    },
    {
        "stt": 138,
        "cau_hoi": "Tỉnh Cửu là nhân vật chính trong bộ phim hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Đại Đạo Triều Thiên"
    },
    {
        "stt": 139,
        "cau_hoi": "Lý Tinh Vân là một nhân vật trong bộ phim hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Họa Giang Hồ Chi Bất Lương Nhân"
    },
    {
        "stt": 140,
        "cau_hoi": "Tần Mục là nhân vật chính trong bộ phim hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Mục Thần Ký"
    },
    {
        "stt": 141,
        "cau_hoi": "Tiêu Thần là nhân vật chính trong bộ phim hoạt hình Trung Quốc nào sau đây ?",
        "dap_an": "Trường Sinh Giới"
    },
    {
        "stt": 142,
        "cau_hoi": "Tần Nam là nhân vật chính trong bộ hoạt hình trung quốc nào sau đây ?",
        "dap_an": "Tuyệt Thế Chiến Hồn"
    },
    {
        "stt": 143,
        "cau_hoi": "Test",
        "dap_an": "Test"
    },
    {
        "stt": 144,
        "cau_hoi": "Mục đích chính tu luyện của Tần Vũ trong Tinh Thần Biến là gì ??",
        "dap_an": "Vì muốn được cưới Khương Lập"
    },
    {
        "stt": 145,
        "cau_hoi": "Khô Lâu Đà Chủ xuất hiện trong bộ phim hoạt hình nào dưới đây ?",
        "dap_an": "Võ Thần Chúa Tể"
    },
    {
        "stt": 146,
        "cau_hoi": "Nhân vật chính trong Man Hoang Tiên Giới là ai ?",
        "dap_an": "Lục Hàng Chi"
    },
    {
        "stt": 147,
        "cau_hoi": "Mục đích tu luyện của Tần Vũ trong Tinh Thần Biến là gì?",
        "dap_an": "Vì muốn được cưới Khương Lập"
    },
    {
        "stt": 148,
        "cau_hoi": "Nhân vật chính trong Quân Tử Vô Tật là ai?",
        "dap_an": "Dao Cơ"
    },
    {
        "stt": 149,
        "cau_hoi": "Nhân vật chính trong Đấu Chiến Thiên Hạ là ai?",
        "dap_an": "Đại Phong"
    },
    {
        "stt": 150,
        "cau_hoi": "Nhân vật chính trong Ta Có Thể Giác Ngộ Vô Hạn là ai?",
        "dap_an": "Tiêu Vân"
    },
    {
        "stt": 151,
        "cau_hoi": "xxxx",
        "dap_an": "xx"
    },
    {
        "stt": 152,
        "cau_hoi": "Tại sao Hàn Lập khi gặp Phong Hi không chạy mà ở lại giúp đỡ chế tạo Phong Lôi Sí ?",
        "dap_an": "Vì đánh không lại"
    },
    {
        "stt": 153,
        "cau_hoi": "Nhân vật chính trong Quân Tử Vô Tật là ai ?",
        "dap_an": "Dao Cơ"
    },
    {
        "stt": 154,
        "cau_hoi": "Vô Tâm trong phim Thiếu Niên Ca Hành còn có tên gọi khác là gì ?",
        "dap_an": "Diệp An Thế"
    },
    {
        "stt": 155,
        "cau_hoi": "Trong Phim Na Tra: Ma Đồng Náo Hải, Cha của Ngao Bính tên là ?",
        "dap_an": "Ngao Quảng"
    },
    {
        "stt": 156,
        "cau_hoi": "Cô Kiếm Tiên trong phim Thiếu Niên Ca Hành là ai ?",
        "dap_an": "Lạc Thanh Dương"
    },
    {
        "stt": 157,
        "cau_hoi": "Nam chính trong phim Ta Là Đại Thần Tiên là ?",
        "dap_an": "Thời Giang"
    },
    {
        "stt": 158,
        "cau_hoi": "Trong phim Đại Đạo Triều Thiên, Tỉnh Cửu đã cùng thư đồng đến đâu tu luyện ?",
        "dap_an": "Thanh Sơn Tông"
    },
    {
        "stt": 159,
        "cau_hoi": "Nam chính trong phim Sơn Hà Kiếm Tâm là ai ?",
        "dap_an": "Yến Vô Sư"
    },
    {
        "stt": 160,
        "cau_hoi": "Thê tử của Điền Bất Dịch trong Tru Tiên là ai ?",
        "dap_an": "Tô Như"
    },
    {
        "stt": 161,
        "cau_hoi": "Nam chính của phim Đô Thị Có Y Tiên là ?",
        "dap_an": "Diệp Bất Phàm"
    },
    {
        "stt": 162,
        "cau_hoi": "Thế giới trong Mục Thần Ký chia thành mấy đại vực chính ?",
        "dap_an": "9"
    },
    {
        "stt": 163,
        "cau_hoi": "Cổ Hà trong Đấu Phá Thương Khung lúc xuất hiện ở Vân Lam Tông là luyện dược sư mấy phẩm ?",
        "dap_an": "Lục Phẩm"
    },
    {
        "stt": 164,
        "cau_hoi": "Vương Lâm trong Tiên Nghịch ở đâu có Tiên Ngọc đột phá Anh Biến ?",
        "dap_an": "Đi cướp (Chỉ là bằng hữu cho mượn tiên ngọc thôi:P)"
    },
    {
        "stt": 165,
        "cau_hoi": "Nhân Vật chính trong phim Trấn Hồn Nhai là ?",
        "dap_an": "Hạ Linh"
    },
    {
        "stt": 166,
        "cau_hoi": "Chu Tước Thánh Sứ trong Tru Tiên Là Ai ?",
        "dap_an": "U Cơ"
    },
    {
        "stt": 167,
        "cau_hoi": "Bạch Nguyệt Khôi còn có tên gọi khác là gì ?",
        "dap_an": "Bà Chủ Bạch (A.K.A Bạch Lão Bản)"
    },
    {
        "stt": 168,
        "cau_hoi": "Lâm Thất Dạ trong phim Trảm Thần gặp phải biến cố gì ?",
        "dap_an": "Bị mù (nhìn lên trời thấy vì tinh tú rồi bị chột)"
    },
    {
        "stt": 169,
        "cau_hoi": "ID game Diệp Tu sử dụng trong phim Toàn Chức Cao Thủ ?",
        "dap_an": "Cả 1 và 2 (Thách đấu phá đảo rank đồng đoàn)"
    },
    {
        "stt": 170,
        "cau_hoi": "Trong Kiếm Lai, Khi Man Châu Động Thiên đứng trước nguy cơ bị hủy diệt, là ai đã đứng ra bảo vệ người dân trong trấn ?",
        "dap_an": "Tề Tĩnh Xuân (Xuân phong đắc ý)"
    },
    {
        "stt": 171,
        "cau_hoi": "Nhân vật chính trong Ta Có Thể Giác Ngộ Vô Hạn là ai ?",
        "dap_an": "Tiêu Vân (Truyện tranh hay hơn)"
    },
    {
        "stt": 172,
        "cau_hoi": "Nhân vật chính trong phim Tần Thời Minh Nguyệt ?",
        "dap_an": "Kinh Thiên Minh (phim cổ)"
    },
    {
        "stt": 173,
        "cau_hoi": "Tư Mã Ý trong phim Hỏa Phụng Liêu Nguyên có tên tự là gì ?",
        "dap_an": "Trọng Đạt"
    },
    {
        "stt": 174,
        "cau_hoi": "Dương Khai trong Võ Luyện Đỉnh Phong song tu với ai đầu tiên ?",
        "dap_an": "Tô Nhan (em này được yêu nhất,lên map lại đi tìm :D)"
    },
    {
        "stt": 175,
        "cau_hoi": "Ai là chủ nhân của Thôn Thôn trong Nguyên Tôn ?",
        "dap_an": "Yêu Yêu"
    },
    {
        "stt": 176,
        "cau_hoi": "Trong phim Đại Đạo Triều Thiên, Triệu Lạp Nguyệt đến từ phong nào ?",
        "dap_an": "Thần Mạt Phong (Nữ như nam )"
    },
    {
        "stt": 177,
        "cau_hoi": "Nhân vật chính Duy ngã độc thần",
        "dap_an": "Ninh Thần (tên phim củ chuối)"
    },
    {
        "stt": 178,
        "cau_hoi": "Mục Thần Ký được chuyển thể từ tiểu thuyết của tác giả nào?",
        "dap_an": "Trạch trư/thạch thư"
    },
    {
        "stt": 179,
        "cau_hoi": "Tần Mục trong Mục Thần Ký lớn lên ở đâu ?",
        "dap_an": "Tàn Lão Thôn (Toàn người què)"
    },
    {
        "stt": 180,
        "cau_hoi": "Nhân vật chính trong phim Toàn Chức cao thủ là ai?",
        "dap_an": "Diệp Tu (Nhất Diệp Chi Thu)"
    },
    {
        "stt": 181,
        "cau_hoi": "Ai là sư phụ của Diệp Phàm trong Già Thiên?",
        "dap_an": "Lý Nhược Ngu (Tên 3 chấm...)"
    },
    {
        "stt": 182,
        "cau_hoi": "Sở Phong trong Tu La Võ Thần có Huyết Mạch gì ?",
        "dap_an": "Thiên Lôi (chưa thấy phần mới)"
    },
    {
        "stt": 183,
        "cau_hoi": "Trong Na Tra: Ma Đồng Giáng Thế, Na Tra được sinh ra từ gì?",
        "dap_an": "Ma Hoàn (Hot hit phòng vé,nhưng mà xem lậu)"
    },
    {
        "stt": 184,
        "cau_hoi": "Bộ phim Thiên Bảo Phục Yêu Lục lấy bối cảnh thời kỳ nào??",
        "dap_an": "Đường"
    },
    {
        "stt": 185,
        "cau_hoi": "Trong phim Đại Đạo Triều Thiên, Tỉnh Cửu đã thu nhận ai làm thư đồng?",
        "dap_an": "Lưu Thập Tuế (họ liễu chứ nhể)"
    },
    {
        "stt": 186,
        "cau_hoi": "Nhân vật chính trong phim Vạn Giới Tiên Tung là ai ?",
        "dap_an": "Diệp Tinh Vân"
    },
    {
        "stt": 187,
        "cau_hoi": "1 Trong 2 Admin của website HoatHinh3D là ai ? (Biệt danh chính xác ở web) ?",
        "dap_an": "Từ Dương"
    },
    {
        "stt": 188,
        "cau_hoi": "Lý Hàn Y trong phim Thiếu Niên Ca Hành sử dụng vũ khí gì ?",
        "dap_an": "Cả 1 và 2"
    },
    {
        "stt": 189,
        "cau_hoi": "Trong các bộ phim sau, bộ nào nhân vật chính có hệ thống ?",
        "dap_an": "Ta Có Thể Giác Ngộ Vô Hạn"
    },
    {
        "stt": 190,
        "cau_hoi": "Tam Thánh Niết là biệt danh của ai trong Họa Giang Hồ Chi Bất Lương Nhân ?",
        "dap_an": "Lý Tinh Vân"
    },
    {
        "stt": 191,
        "cau_hoi": "Sư tỷ của Nguyên Dao trong Phàm Nhân Tu Tiên tên là gì ?",
        "dap_an": "Nghiên Lệ"
    },
    {
        "stt": 192,
        "cau_hoi": "Phong Hi trong Phàm Nhân Tu Tiên là yêu thú nào ?",
        "dap_an": "Liệt phong  thú"
    },
    {
        "stt": 193,
        "cau_hoi": "Trong phim Vạn Cổ Tối Cường Tông, Quân Thường Tiếu chiêu mộ ai làm đệ từ đầu tiên ?",
        "dap_an": "Lục Thiên Thiên"
    },
    {
        "stt": 194,
        "cau_hoi": "Liễu Thất Nguyệt trong Thương Nguyên Đồ sử dụng vũ khí gì ?",
        "dap_an": "Cung"
    },
    {
        "stt": 195,
        "cau_hoi": "Nhân vật chính trong phim Sư Huynh A Sư Huynh là ai ?",
        "dap_an": "Lý Trường Thọ"
    },
    {
        "stt": 196,
        "cau_hoi": "Ai sau đây làm lễ cưới với Lý Mộ Uyển trong Tiên Nghịch thì bị anh Lâm giết ?",
        "dap_an": "Tôn Chấn Vỹ.   (Thực ra là Tôn Trấn Vĩ nhưng đáp án vậy đó :v)"
    },
    {
        "stt": 197,
        "cau_hoi": "Ôn Thiên Nhân trong Phàm Nhân Tu Tiên tu luyện công pháp gì ?",
        "dap_an": "Lục Cực Chân Ma Công"
    },
    {
        "stt": 198,
        "cau_hoi": "Phong Hi trong Phàm Nhân Tu Tiên là yêu thú cấp mấy ?",
        "dap_an": "9"
    },
    {
        "stt": 199,
        "cau_hoi": "Trong Đấu Phá Thương Khung, Tiêu Viêm hơn Cổ Hà ở điểm gì ?",
        "dap_an": "Dị Hỏa"
    },
    {
        "stt": 200,
        "cau_hoi": "Phong Hi trong Phàm Nhân Tu Tiên vì sao được gọi là Đại Thiện Nhân ?",
        "dap_an": "Cả 1 và 2"
    },
    {
        "stt": 201,
        "cau_hoi": "Trong Đấu Phá Thương Khung,khi Vân Lam Tông giải tán thì Vân Vận đã gia nhập tông phái nào ?",
        "dap_an": "Hoa Tông"
    },
    {
        "stt": 202,
        "cau_hoi": "Gia gia Thạch Hạo trong phim Thế Giới Hoàn Mỹ tên gì ?",
        "dap_an": "Thạch Trung Thiên"
    },
    {
        "stt": 203,
        "cau_hoi": "Con gái của quỷ vương trong Tru Tiên tên là gì?",
        "dap_an": "Bích Dao"
    }
];

// Khởi tạo VanDapHelper
let vanDapHelper = null;

// Khởi tạo khi DOM ready
function initVanDapHelper() {
    if (!vanDapHelper) {
        vanDapHelper = new VanDapHelper();
        // Expose globally để debug
        window.vanDapHelper = vanDapHelper;
        console.log('[VanDap Helper] Extension available globally as window.vanDapHelper');
        console.log('[VanDap Helper] Use vanDapHelper.debugExtension() to debug');
    }
}

// Khởi tạo ngay lập tức hoặc đợi DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVanDapHelper);
} else {
    initVanDapHelper();
}

// Lắng nghe message từ popup với improved error handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (vanDapHelper) {
            vanDapHelper.log('info', 'Received message:', request);
        } else {
            console.log('[VanDap Helper] Received message:', request);
        }
        
        if (!vanDapHelper) {
            sendResponse({ success: false, error: 'VanDapHelper not initialized' });
            return;
        }
        
        switch (request.action) {
            case 'getState':
                sendResponse(vanDapHelper.getCurrentState());
                return; // sync response
                
            // REMOVED: setAutoClick action - không còn cần thiết
                
            case 'setAutoMode':
                vanDapHelper.setAutoMode(!!request.enabled);
                sendResponse({ success: true });
                return;
                
            case 'clickAnswer':
                const clicked = vanDapHelper.clickAnswerManually();
                sendResponse({ success: !!clicked });
                return;
                
            case 'refreshQuestion':
                vanDapHelper.refreshCurrentPage(); // UPDATED: sử dụng method mới
                sendResponse({ success: true });
                return;
                
            case 'restartQuiz':
                vanDapHelper.restartQuiz();
                sendResponse({ success: true });
                return;
                
            case 'stopAutoMode':
                vanDapHelper.stopAutoMode();
                sendResponse({ success: true });
                return;
                
            case 'debugExtension':
                const debugInfo = vanDapHelper.debugExtension();
                sendResponse(debugInfo);
                return;
                
            case 'scanPage':
                // Legacy support - deprecated
                const pageContent = document.body.textContent;
                const results = [];
                
                questionData.forEach(item => {
                    if (pageContent.includes(item.cau_hoi)) {
                        results.push(item);
                    }
                });
                
                sendResponse({ results: results });
                return;
                
            default:
                sendResponse({ success: false, error: 'Unknown action' });
                return;
        }
    } catch (e) {
        if (vanDapHelper) {
            vanDapHelper.log('error', 'onMessage error:', e);
        } else {
            console.error('[VanDap Helper] onMessage error:', e);
        }
        sendResponse({ success: false, error: String(e) });
    }
    // no async work -> do not return true
});