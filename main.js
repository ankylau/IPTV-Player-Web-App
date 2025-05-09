        // Define an array to store all playlist items
        let playlistItems = [];
        let player;
        let hls;
        let recentPlayed = [];
        let currentPlayingItem = null;

        // 添加加载状态跟踪
        let isLoading = false;

        // 添加错误重试计数器
        let errorRetryCount = 0;

        // 添加播放状态跟踪
        let isPlaying = false;

        // 添加错误处理防抖
        function debounceErrorMessage(message, isPlayerError, delay = 100) {
            clearTimeout(window.errorMessageTimeout);
            window.errorMessageTimeout = setTimeout(() => {
                showErrorMessage(message, isPlayerError);
            }, delay);
        }

        // 添加检查链接格式的函数
        function isValidStreamUrl(url) {
            // 移除URL中的查询参数
            const baseUrl = url.split('?')[0].toLowerCase();
            // 检查是否是M3U8链接（包括带查询参数的）
            if (url.toLowerCase().includes('.m3u8')) {
                return true;
            }
            // 检查是否是M3U链接
            if (baseUrl.endsWith('.m3u')) {
                return true;
            }
            return false;
        }

        document.addEventListener("DOMContentLoaded", function() {
            const videoPlayer = document.getElementById("videoPlayer");
            const playlist = document.getElementById("playlist");
            const playlistItemsContainer = document.getElementById("playlistItemsContainer");
            const loadM3UButton = document.getElementById("loadM3U");
            const m3uURLInput = document.getElementById("m3uURL");
            const billedMsgElement = document.getElementById("billedMsg");
            const searchInput = document.getElementById("searchInput");
            const channelPlaceholder = document.getElementById("channel-placeholder");
            const recentPlayedSection = document.getElementById("recentPlayedSection");
            const recentPlayedList = document.getElementById("recentPlayedList");

            // 修改URL参数处理逻辑
            const urlParams = new URLSearchParams(window.location.search);
            const urlParam = urlParams.get('url');
            
            if (urlParam) {
                document.getElementById('welcomeSection').classList.add('d-none');
                const decodedUrl = decodeURIComponent(urlParam);
                m3uURLInput.value = decodedUrl;
                setTimeout(() => loadM3UButton.click(), 500);
            } else {
                // 从localStorage加载上次的URL
                const savedPlaylistURL = localStorage.getItem("m3uPlaylistURL");
                if (savedPlaylistURL) {
                    document.getElementById('welcomeSection').classList.add('d-none');
                    m3uURLInput.value = savedPlaylistURL;
                    setTimeout(() => loadM3UButton.click(), 500);
                }
            }

            // Load recent played
            loadRecentPlayed();

            // 初始化 Plyr 播放器
            player = new Plyr(videoPlayer, {
                controls: [
                    'play-large',
                    'play',
                    'progress',
                    'current-time',
                    'mute',
                    'volume',
                    'pip',
                    'settings',
                    'airplay',
                    'fullscreen'
                ],
                settings: [
                    'captions',
                    'quality',
                    'speed',
                    'loop'
                ]
            });


            // 创建 HLS 实例
            if (Hls.isSupported()) {
                hls = new Hls({
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60
                });
            }

            // 初始状态隐藏播放器和播放器容器
            videoPlayer.style.display = 'none';
            document.getElementById('videoInfo').classList.add('d-none');
            document.querySelector('.player-container').classList.add('d-none');

            loadM3UButton.addEventListener("click", async () => {
                try {
                    loadM3UButton.disabled = true;
                    const m3uURL = m3uURLInput.value;
                    
                    // 检查链接格式
                    if (!isValidStreamUrl(m3uURL)) {
                        throw new Error('Only supports M3U and M3U8 format links');
                    }
                    
                    // 隐藏欢迎区块
                    document.getElementById('welcomeSection').classList.add('d-none');
                    
                    // 修改判断逻辑：检查URL是否为M3U8流
                    const isM3U8Stream = m3uURL.toLowerCase().includes('.m3u8');
                    
                    if (isM3U8Stream) {
                        // 直接播放M3U8链接
                        const directPlayItem = {
                            tvgName: 'M3U8 PLAYER',
                            source: m3uURL,
                            groupTitle: m3uURL
                        };
                        
                        // 显示播放器和相关元素
                        const videoInfo = document.getElementById('videoInfo');
                        const videoTitle = videoInfo.querySelector('.video-title');
                        const videoCategory = videoInfo.querySelector('.video-category');
                        
                        videoTitle.textContent = '直接播放流';
                        videoCategory.textContent = m3uURL;
                        videoInfo.classList.remove('d-none');
                        
                        document.querySelector('.player-container').classList.remove('d-none');
                        document.getElementById('videoPlayer').style.display = 'block';
                        
                        // 清除现有播放列表
                        clearPlaylist();
                        document.getElementById("channel-placeholder").textContent = "直接播放模式";
                        document.getElementById("channel-placeholder").classList.remove("d-none");
                        
                        // 播放视频
                        await playVideo(directPlayItem);
                        return;
                    }

                    // 如果不是M3U8链接，继续原来的M3U解析逻辑
                    const loadingProgress = document.getElementById('loadingProgress');
                    const progressBar = loadingProgress.querySelector('.progress-bar');
                    loadingProgress.classList.remove('d-none');
                    progressBar.style.width = '0%';
                    progressBar.textContent = 'Connecting...';

                    localStorage.setItem("m3uPlaylistURL", m3uURL);

                    // 使用 fetch 并监听进度
                    const response = await fetch(m3uURL);
                    const reader = response.body.getReader();
                    const contentLength = +response.headers.get('Content-Length');

                    let receivedLength = 0;
                    let chunks = [];
                    while(true) {
                        const {done, value} = await reader.read();
                        
                        if (done) break;
                        
                        chunks.push(value);
                        receivedLength += value.length;
                        
                        // 计算进度
                        const progress = contentLength ? 
                            Math.round((receivedLength / contentLength) * 100) : 
                            'Loading...';
                        
                        progressBar.style.width = `${progress}%`;
                        loadingProgress.querySelector('.progress-text').textContent = 
                            typeof progress === 'number' ? `${progress}%` : progress;
                    }

                    // 合并数据
                    const chunksAll = new Uint8Array(receivedLength);
                    let position = 0;
                    for(let chunk of chunks) {
                        chunksAll.set(chunk, position);
                        position += chunk.length;
                    }
                    
                    // 转换为文本
                    const data = new TextDecoder("utf-8").decode(chunksAll);
                    
                    // 清除现有内容
                    // videoPlayer.innerHTML = '';
                    clearPlaylist();

                    progressBar.style.width = '100%';
                    loadingProgress.querySelector('.progress-text').textContent = 'Processing playlist...';

                    // 解析和渲染新的播放列表
                    const parsedPlaylist = parseM3U(data);
                    playlistItems = parsedPlaylist.items;

                    // 渲染播放列表
                    renderPlaylist(playlistItems);

                    // 更新频道占位符显示状态
                    if (document.getElementsByClassName('channel').length > 0) {
                        channelPlaceholder.classList.add("d-none");
                    } else {
                        channelPlaceholder.classList.remove("d-none");
                    }

                    // 更新账单信息显示
                    if (parsedPlaylist.billedMsg) {
                        billedMsgElement.textContent = parsedPlaylist.billedMsg;
                        billedMsgElement.classList.remove("d-none");
                    } else {
                        billedMsgElement.classList.add("d-none");
                    }

                } catch (error) {
                    // 如果加载失败，显示欢迎区块
                    document.getElementById('welcomeSection').classList.remove('d-none');
                    console.error("Error loading the M3U file:", error);
                    // 显示错误信息给用户
                    const errorMessage = document.getElementById('errorMessage');
                    errorMessage.textContent = `Loading failed: ${error.message}`;
                    errorMessage.classList.remove('d-none');
                    
                    // 3秒后移除错误信息
                    setTimeout(() => {
                        errorMessage.classList.add('d-none');
                    }, 3000);
                } finally {
                    loadM3UButton.disabled = false;
                    loadM3UButton.textContent = 'Go';
                    loadingProgress.classList.add('d-none');
                }
            });

            // Search input event listener
            searchInput.addEventListener("input", () => {
                const searchText = searchInput.value.trim().toLowerCase();

                if (!searchText) {
                    // 如果搜索框为空，显示原始列表
                    clearPlaylist(false);
                    renderPlaylist(playlistItems);
                    channelPlaceholder.classList.add("d-none");
                    return;
                }

                // 只保留有匹配结果的分类
                const filteredItems = playlistItems
                    .map(({category, channels}) => ({
                        category,
                        channels: channels.filter(item => 
                            item && item.tvgName && 
                            item.tvgName.toLowerCase().includes(searchText.toLowerCase())
                        )
                    }))
                    // 完全过滤掉没有结果的分类
                    .filter(({channels}) => channels.length > 0);

                // 重新渲染过滤后的列表
                clearPlaylist(false);
                
                if (filteredItems.length > 0) {
                    renderPlaylist(filteredItems);
                    channelPlaceholder.classList.add("d-none");

                    // 自动展开所有分类
                    document.querySelectorAll('.channels-container').forEach(container => {
                        container.classList.add('show');
                    });
                    document.querySelectorAll('.category-icon').forEach(icon => {
                        icon.classList.remove('fa-chevron-right');
                        icon.classList.add('fa-chevron-down');
                    });
                } else {
                    channelPlaceholder.textContent = "No channel found";
                    channelPlaceholder.classList.remove("d-none");
                }
            });

            // 为输入框添加回车键处理
            m3uURLInput.addEventListener("keypress", function(event) {
                if (event.key === "Enter") {
                    event.preventDefault(); // 阻止默认的回车行为
                    document.getElementById("loadM3U").click(); // 触发加载按钮点击
                }
            });

            // 为搜索框添加回车键处理
            searchInput.addEventListener("keypress", function(event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    // 触发搜索
                    const searchEvent = new Event('input', {
                        bubbles: true,
                        cancelable: true,
                    });
                    searchInput.dispatchEvent(searchEvent);
                }
            });
        });

        // Function to render the playlist
        function renderPlaylist(items, target = playlistItemsContainer, isRecentPlayed = false) {
            const fragment = document.createDocumentFragment();
            
            // 如果是最近播放的列表，使用不同的渲染逻辑
            if (isRecentPlayed) {
                items.forEach((item, index) => {
                    const channelItem = document.createElement("div");
                    channelItem.className = "recent-channel me-3 text-center";

                    // 创建图片容器
                    const imageContainer = document.createElement("div");
                    imageContainer.className = "recent-channel-image mb-2";

                    if (item.tvgLogo) {
                        const logoImage = document.createElement("img");
                        logoImage.src = item.tvgLogo;
                        logoImage.className = "img-fluid";
                        imageContainer.appendChild(logoImage);
                    } else {
                        // 如果没有图片，显示默认图标
                        imageContainer.innerHTML = '<i class="fas fa-tv fa-2x"></i>';
                    }
                    
                    // 创建标题元素
                    const titleElement = document.createElement("div");
                    titleElement.className = "recent-channel-title";
                    titleElement.textContent = item.tvgName || `Stream ${index + 1}`;

                    channelItem.appendChild(imageContainer);
                    channelItem.appendChild(titleElement);

                    channelItem.addEventListener("click", async () => {
                        clearErrorMessage();
                        try {
                            await playVideo(item);
                        } catch (error) {
                            console.error('Error in renderPlaylist:', error);
                            showErrorMessage(error.message || '播放出错，请稍后重试', true);
                            videoPlayer.classList.add("d-none");
                        }
                    });

                    fragment.appendChild(channelItem);
                });
            } else {
                items.forEach(({category, channels, hidden}) => {
                    // 创建分类容器
                    const categoryContainer = document.createElement("div");
                    categoryContainer.className = "category-container mb-3";
                    if (hidden) {
                        categoryContainer.style.display = 'none';
                    }
                    
                    // 创建分类标题
                    const categoryHeader = document.createElement("div");
                    categoryHeader.className = "category-header d-flex align-items-center p-2 bg-light rounded";
                    categoryHeader.innerHTML = `
                        <i class="fas fa-chevron-right me-2 category-icon"></i>
                        <span class="category-title">${category}</span>
                        <span class="ms-2 badge bg-secondary">${channels.length}</span>
                    `;
                    
                    // 创建频道列表容器
                    const channelsContainer = document.createElement("div");
                    channelsContainer.className = "channels-container collapse";
                    
                    // 为分类标题添加点击事件
                    categoryHeader.addEventListener("click", () => {
                        categoryHeader.querySelector('.category-icon').classList.toggle('fa-chevron-down');
                        categoryHeader.querySelector('.category-icon').classList.toggle('fa-chevron-right');
                        channelsContainer.classList.toggle('show');
                    });
                    
                    // 渲染频道列表
                    channels.forEach((item, index) => {
                        const channelItem = createChannelElement(item);

                        channelsContainer.appendChild(channelItem);
                    });

                    categoryContainer.appendChild(categoryHeader);
                    categoryContainer.appendChild(channelsContainer);
                    fragment.appendChild(categoryContainer);
                });
            }

            target.appendChild(fragment);

            // 在渲染完成后初始化懒加载
            setTimeout(() => {
                initializeLazyLoading();
            }, 0);
        }

        function createChannelElement(item) {
            const channelDiv = document.createElement("div");
            channelDiv.className = "channel";

            // 创建图片元素
            const logoImage = document.createElement("img");
            const defaultImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjMwIiBoZWlnaHQ9IjMwIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGFsaWdubWVudC1iYXNlbGluZT0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZpbGw9IiM5OTkiPlRWPC90ZXh0Pjwvc3ZnPg==';
            
            // 设置懒加载属性
            logoImage.loading = "lazy"; // 原生懒加载
            logoImage.src = defaultImage; // 默认图片
            if (item.tvgLogo) {
                logoImage.dataset.src = item.tvgLogo; // 将实际图片URL存储在data-src属性中
            }
            logoImage.className = "channel-logo";
            
            // 错误处理
            logoImage.onerror = () => { 
                logoImage.src = defaultImage;
            };

            channelDiv.appendChild(logoImage);

            // 添加频道名称
            const nameSpan = document.createElement("span");
            nameSpan.textContent = item.tvgName;
            channelDiv.appendChild(nameSpan);

            channelDiv.addEventListener("click", () => {
                clearErrorMessage();
                playVideo(item);
            });

            return channelDiv;
        }

        function playVideo(item, retryCount = 0) {
            currentPlayingItem = item;
            const maxRetries = 3;
            
            try {
                // 确保在开始新播放前清除所有错误提示
                clearErrorMessage();
                
                // 显示视频信息和播放器
                const videoInfo = document.getElementById('videoInfo');
                const videoTitle = videoInfo.querySelector('.video-title');
                const videoCategory = videoInfo.querySelector('.video-category');
                const playerElement = document.getElementById('videoPlayer');
                const playerContainer = document.querySelector('.player-container');
                const liveBadge = document.querySelector('.live-badge');
                
                // 初始隐藏 LIVE 标志
                if (liveBadge) {
                    liveBadge.style.display = 'none';
                }
                
                videoTitle.textContent = item.tvgName;
                videoCategory.textContent = item.groupTitle;
                videoInfo.classList.remove('d-none');
                playerElement.style.display = 'block';
                playerContainer.classList.remove('d-none');

                console.log('Starting playback of:', item.source);

                // 停止当前播放
                if (hls) {
                    hls.destroy();
                }

                // 创建新的 HLS 实例，添加更多配置选项
                hls = new Hls({
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60,
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90,
                    // 修改 xhrSetup 配置
                    xhrSetup: function(xhr, url) {
                        xhr.withCredentials = false;
                        // 保持原始URL，不做任何修改
                        xhr.open('GET', url, true);
                    },
                    // 添加自定义加载器配置
                    fragLoadingMaxRetry: 5,
                    manifestLoadingMaxRetry: 5,
                    levelLoadingMaxRetry: 5
                });

                // 使用 HLS.js 加载视频
                if (Hls.isSupported()) {
                    console.log('Loading source:', item.source);
                    
                    hls.loadSource(item.source);
                    hls.attachMedia(playerElement);
                    
                    let loadTimeout;
                    
                    // 添加错误处理
                    hls.on(Hls.Events.ERROR, function(event, data) {
                        if (data.fatal) {
                            // 清除超时计时器
                            clearTimeout(loadTimeout);
                            
                            switch(data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    showErrorMessage('网络错误：无法加载视频流，请检查网络连接', true);
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    showErrorMessage('媒体错误：视频格式不支持或已损坏', true);
                                    break;
                                default:
                                    showErrorMessage('播放错误：' + (data.details || '未知错误'), true);
                                    break;
                            }
                        }
                    });

                    // 修改超时检测
                    loadTimeout = setTimeout(() => {
                        // 只有在还没有触发其他错误的情况下才显示超时错误
                        if (!document.querySelector('.player-error')) {
                            showErrorMessage('加载超时：请检查网络连接或视频源是否可用', true);
                        }
                    }, 10000);

                    // 修改播放错误处理
                    hls.on(Hls.Events.MANIFEST_PARSED, function() {
                        clearTimeout(loadTimeout);  // 成功加载后清除超时计时器
                        player.play().catch(error => {
                            showErrorMessage('播放失败：' + error.message, true);
                        });
                    });

                    // 在视频开始播放时显示 LIVE 标志
                    player.on('playing', () => {
                        if (liveBadge) {
                            liveBadge.style.display = 'inline-block';
                        }
                    });

                    // 在视频暂停或结束时隐藏 LIVE 标志
                    player.on('pause ended', () => {
                        if (liveBadge) {
                            liveBadge.style.display = 'none';
                        }
                    });
                }
                // 原生 HLS 支持（如 Safari）
                else if (playerElement.canPlayType('application/vnd.apple.mpegurl')) {
                    playerElement.src = item.source;
                    player.play().catch(error => {
                        showErrorMessage('播放失败：' + error.message, true);
                    });
                }

                // 保存到最近播放
                saveRecentPlayed(item);
                
                // 滚动到播放器位置
                playerElement.scrollIntoView({ behavior: 'smooth' });

            } catch (error) {
                console.error('Error in playVideo:', error);
                showErrorMessage('播放错误：' + error.message, true);
                
                if (retryCount < maxRetries) {
                    setTimeout(() => {
                        playVideo(item, retryCount + 1);
                    }, 1000);
                }
            }
        }

        // 更新显示错误提示的函数
        function showErrorMessage(message, isPlayerError = false) {
            if (isPlayerError) {
                // 播放器内的错误提示
                const errorDiv = document.createElement('div');
                errorDiv.className = 'player-error';
                errorDiv.innerHTML = `
                    <i class="fas fa-exclamation-circle"></i>
                    <div>${message}</div>
                    <button class="retry-btn">
                        <i class="fas fa-redo"></i> 重试
                    </button>
                `;
                
                const playerContainer = document.querySelector('.player-container');
                playerContainer.classList.add('has-error');
                playerContainer.appendChild(errorDiv);
                
                // 重试按钮点击事件
                const retryBtn = errorDiv.querySelector('.retry-btn');
                retryBtn.onclick = () => {
                    playerContainer.classList.remove('has-error');
                    errorDiv.remove();
                    playVideo(currentPlayingItem);
                };
                
                // 30秒后自动移除错误提示
                setTimeout(() => {
                    playerContainer.classList.remove('has-error');
                    errorDiv.remove();
                }, 30000);
            } else {
                // 在输入框下方显示错误信息
                const errorMessage = document.getElementById('errorMessage');
                errorMessage.textContent = message;
                errorMessage.classList.remove('d-none');
                
                // 3秒后自动隐藏错误信息
                setTimeout(() => {
                    errorMessage.classList.add('d-none');
                }, 3000);
            }
        }

        // 修改清除错误信息函数
        function clearErrorMessage() {
            // 清除播放器错误
            document.querySelectorAll('.player-error').forEach(el => el.remove());
            document.querySelector('.player-container')?.classList.remove('has-error');
            
            // 清除输入框下方的错误信息
            const errorMessage = document.getElementById('errorMessage');
            errorMessage.classList.add('d-none');
        }

        function parseM3U(content) {
            const lines = content.split('\n');
            const categories = new Map(); // 使用 Map 存储分类
            let currentItem = null;
            let billedMsg = '';

            for (let line of lines) {
                line = line.trim();

                if (line.startsWith('#EXTM3U')) {
                    const billedMsgMatch = line.match(/billed-msg="([^"]+)"/);
                    if (billedMsgMatch) {
                        billedMsg = billedMsgMatch[1];
                    }
                } else if (line.startsWith('#EXTINF:')) {
                    currentItem = { tvgName: '', tvgLogo: '', groupTitle: '', source: '', key: null };

                    const groupTitleMatch = line.match(/group-title="([^"]+)"/);
                    if (groupTitleMatch) {
                        currentItem.groupTitle = groupTitleMatch[1] || '未分类';
                    } else {
                        currentItem.groupTitle = '未分类';
                    }

                    const tvgIdMatch = line.match(/tvg-id="([^"]+)"/);
                    if (tvgIdMatch) {
                        currentItem.tvgId = tvgIdMatch[1];
                    }

                    const tvgNameMatch = line.match(/tvg-name="([^"]+)"/);
                    if (tvgNameMatch) {
                        currentItem.tvgName = tvgNameMatch[1];
                    } else {
                        const lastCommaIndex = line.lastIndexOf(",");
                        if (lastCommaIndex !== -1) {
                            currentItem.tvgName = line.substring(lastCommaIndex + 1).trim();
                        }
                    }

                    const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/);
                    if (tvgLogoMatch) {
                        currentItem.tvgLogo = convertToHttps(tvgLogoMatch[1]);
                    }

                    // console.log('Parsed EXTINF:', currentItem);
                } else if (line.startsWith('#KODIPROP:')) {
                    if (currentItem) {
                        const keyInfo = extractKey(line);
                        if (keyInfo) {
                            if (!currentItem.key) currentItem.key = {};
                            Object.assign(currentItem.key, keyInfo);
                        }
                    }
                } else if (line.length > 0 && !line.startsWith('#')) {
                    if (currentItem) {
                        currentItem.source = convertToHttps(line);
                        
                        // 将频道添加到对应分类中
                        if (!categories.has(currentItem.groupTitle)) {
                            categories.set(currentItem.groupTitle, []);
                        }
                        categories.get(currentItem.groupTitle).push(currentItem);
                        
                        currentItem = null;
                    }
                }
            }

            // 将 Map 转换为数组格式
            const items = Array.from(categories).map(([category, channels]) => ({
                category,
                channels
            }));

            return { items, billedMsg };
        }

        function extractKey(line) {
            if (line.includes('inputstream.adaptive.license_type=')) {
                return { license_type: line.split('=')[1].trim() };
            } else if (line.includes('inputstream.adaptive.license_key=')) {
                const keyValue = line.split('=')[1].trim();
                
                // Check if it's a URL
                if (keyValue.startsWith('http')) {
                    return { license_key: keyValue };
                }
                
                // Check if it's a direct key (format: key_id:key)
                const keyParts = keyValue.split(':');
                if (keyParts.length === 2) {
                    return {
                        key_id: keyParts[0],
                        key: keyParts[1]
                    };
                }
                
                // Try parsing as JSON
                try {
                    const json = JSON.parse(keyValue);
                    if (json && json.keys && json.keys.length > 0) {
                        return {
                            key_id: base64ToHex(json.keys[0].kid),
                            key: base64ToHex(json.keys[0].k)
                        };
                    }
                } catch (error) {
                    // If it's not valid JSON, treat it as a raw key
                    console.log('Key is not in JSON format, treating as raw key:', keyValue);
                    return { raw_key: keyValue };
                }
            }
            return null;
        }

        function clearPlaylist(clearItems = true) {
            // Clear the existing playlist items
            if (clearItems) {
                playlistItems = [];
            }

            // 移除所有现有的分类容器
            const categoryContainers = playlistItemsContainer.querySelectorAll('.category-container');
            categoryContainers.forEach(container => container.remove());
        }

        function trimLineBreak(text) {
            // Replace multiple line breaks with a single line break
            return text.replace(/[\r\n]{2,}/g, '\n\n');
        }

        function reorderIndexes(items) {
            let rearrangedItems = [];

            items.forEach(item => {
                if (item !== undefined) {
                    rearrangedItems.push(item);
                }
            });

            return rearrangedItems;
        }

        function base64ToHex(base64) {
            try {
                if (!base64 || base64.length === 0) return base64;
                const binary = atob(base64);
                let hex = '';
                for (let i = 0; i < binary.length; i++) {
                    let char = binary.charCodeAt(i).toString(16);
                    hex += (char.length === 1 ? '0' : '') + char;
                }
                return hex;
            } catch (error) {
                console.error('Error converting base64 to hex:', error);
                return base64;
            }
        }

        function convertToHttps(url) {
            return url.replace(/^http:/, 'https:');
        }

        function saveRecentPlayed(item) {
            // Retrieve the recentPlayed array from localStorage
            let recentPlayed = JSON.parse(localStorage.getItem("recentPlayed")) || [];

            // Remove the item if it already exists in the list based on tvgId
            recentPlayed = recentPlayed.filter((entry) => entry.tvgId !== item.tvgId);

            // Add the new item to the beginning of the list
            recentPlayed.unshift(item);

            // 将限制改为10个
            if (recentPlayed.length > 10) {
                recentPlayed.pop();
            }

            // Save the updated list back to localStorage
            localStorage.setItem("recentPlayed", JSON.stringify(recentPlayed));

            // Reload the recent played items
            loadRecentPlayed();
        }


        function getRecentPlayed() {
            const recentPlayed = JSON.parse(localStorage.getItem("recentPlayed")) || [];

            return recentPlayed;
        }

        function loadRecentPlayed() {
            recentPlayed = getRecentPlayed();
            recentPlayedList.innerHTML = "";
            if (recentPlayed.length > 0) {
                renderPlaylist(recentPlayed, recentPlayedList, true);
                recentPlayedSection.classList.remove("d-none");
            } else {
                recentPlayedSection.classList.add("d-none");
            }
        }

        // 清理函数
        function cleanupPlayer() {
            if (hls) {
                hls.destroy();
            }
            if (player) {
                player.destroy();
            }
            // 清除所有错误提示
            document.querySelectorAll('.error-toast, .player-error').forEach(el => el.remove());
        }

        // 页面卸载时清理
        window.addEventListener('beforeunload', cleanupPlayer);

        // 添加 IntersectionObserver 初始化函数
        function initializeLazyLoading() {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const actualSrc = img.dataset.src;
                        if (actualSrc) {
                            img.src = actualSrc;
                            img.removeAttribute('data-src');
                            observer.unobserve(img);
                        }
                    }
                });
            }, {
                rootMargin: '50px 0px', // 提前50px加载
                threshold: 0.01
            });

            // 观察所有带有 data-src 属性的图片
            document.querySelectorAll('img[data-src]').forEach(img => {
                imageObserver.observe(img);
            });
        }

        // 添加 polyfill 检查（在文件开头添加）
        if (!('IntersectionObserver' in window)) {
            const script = document.createElement('script');
            script.src = 'https://polyfill.io/v3/polyfill.min.js?features=IntersectionObserver';
            document.head.appendChild(script);
        }