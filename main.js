        // Define an array to store all playlist items
        let playlistItems = [];
        let player = null;
        let recentPlayed = [];

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

            //  Get playlist url from url if any
            var urlParams = new URLSearchParams(window.location.search);
            var playlistParam = urlParams.get('playlist');
            if (playlistParam != null) {
                localStorage.setItem("m3uPlaylistURL", playlistParam);
            }

            // Load search input from local storage
            const savedPlaylistURL = localStorage.getItem("m3uPlaylistURL");
            if (savedPlaylistURL) {
                m3uURLInput.value = savedPlaylistURL;
                // Automatically load the saved playlist
                setTimeout(function() {
                    loadM3UButton.click();
                }, 500);
            }

            // Load recent played
            loadRecentPlayed();

            loadM3UButton.addEventListener("click", async () => {
                try {
                    loadM3UButton.disabled = true;
                    const loadingProgress = document.getElementById('loadingProgress');
                    const progressBar = loadingProgress.querySelector('.progress-bar');
                    loadingProgress.classList.remove('d-none');
                    progressBar.style.width = '0%';
                    progressBar.textContent = 'Connecting...';
                    
                    const m3uURL = m3uURLInput.value;
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
                    videoPlayer.innerHTML = '';
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
                    console.error("Error loading the M3U file:", error);
                    // 显示错误信息给用户
                    const errorMsg = document.createElement('div');
                    errorMsg.className = 'alert alert-danger';
                    errorMsg.textContent = `Loading failed: ${error.message}`;
                    playlistItemsContainer.prepend(errorMsg);
                    
                    // 3秒后移除错误信息
                    setTimeout(() => errorMsg.remove(), 3000);
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
                            if (player !== null) {
                                await player.destroy();
                            }

                            player = new shaka.Player(videoPlayer);

                            // Add error event listener
                            player.addEventListener('error', onPlayerError);

                            // Configure network filters
                            player.getNetworkingEngine().registerRequestFilter(function(type, request) {
                                console.log('Outgoing request:', type, request);
                            });

                            player.getNetworkingEngine().registerResponseFilter(function(type, response) {
                                console.log('Incoming response:', type, response);
                            });

                            if (item.key) {
                                console.log('Key information:', item.key);
                                if (item.key.license_type === 'clearkey' && item.key.license_key) {
                                    console.log('Configuring for URL-based license key');
                                    player.configure({
                                        drm: {
                                            servers: {
                                                'org.w3.clearkey': item.key.license_key
                                            }
                                        }
                                    });
                                } else if (item.key.key_id && item.key.key) {
                                    console.log('Configuring for direct key values');
                                    player.configure({
                                        drm: {
                                            clearKeys: {
                                                [item.key.key_id]: item.key.key
                                            }
                                        }
                                    });
                                } else if (item.key.raw_key) {
                                    console.log('Configuring for raw key');
                                    // You might need to adjust this based on how your raw key should be used
                                    player.configure({
                                        drm: {
                                            clearKeys: item.key.raw_key
                                        }
                                    });
                                }
                            }

                            console.log('Loading source:', item.source);
                            await player.load(item.source);
                            console.log('Source loaded successfully');

                            // 显示视频信息
                            const videoInfo = document.getElementById('videoInfo');
                            const videoTitle = videoInfo.querySelector('.video-title');
                            const videoCategory = videoInfo.querySelector('.video-category .badge');
                            
                            videoTitle.textContent = item.tvgName;
                            videoCategory.textContent = item.groupTitle;
                            
                            videoInfo.classList.remove('d-none');
                            videoPlayer.scrollIntoView({ behavior: 'smooth' });
                            videoPlayer.classList.remove("d-none");

                            saveRecentPlayed(item);
                        } catch (error) {
                            console.error('Error in renderPlaylist:', error);
                            onPlayerError(error);
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
                        const channelItem = document.createElement("div");
                        channelItem.className = "channel d-flex flex-column p-3";
                        channelItem.textContent = item.tvgName || `Stream ${index + 1}`;

                        if (item.tvgLogo) {
                            const logoImage = document.createElement("img");
                            logoImage.src = item.tvgLogo;
                            logoImage.className = "tv-logo";
                            channelItem.appendChild(logoImage);
                        }

                        channelItem.addEventListener("click", async () => {
                            clearErrorMessage();
                            try {
                                if (player !== null) {
                                    await player.destroy();
                                }

                                player = new shaka.Player(videoPlayer);

                                // Add error event listener
                                player.addEventListener('error', onPlayerError);

                                // Configure network filters
                                player.getNetworkingEngine().registerRequestFilter(function(type, request) {
                                    console.log('Outgoing request:', type, request);
                                });

                                player.getNetworkingEngine().registerResponseFilter(function(type, response) {
                                    console.log('Incoming response:', type, response);
                                });

                                if (item.key) {
                                    console.log('Key information:', item.key);
                                    if (item.key.license_type === 'clearkey' && item.key.license_key) {
                                        console.log('Configuring for URL-based license key');
                                        player.configure({
                                            drm: {
                                                servers: {
                                                    'org.w3.clearkey': item.key.license_key
                                                }
                                            }
                                        });
                                    } else if (item.key.key_id && item.key.key) {
                                        console.log('Configuring for direct key values');
                                        player.configure({
                                            drm: {
                                                clearKeys: {
                                                    [item.key.key_id]: item.key.key
                                                }
                                            }
                                        });
                                    } else if (item.key.raw_key) {
                                        console.log('Configuring for raw key');
                                        // You might need to adjust this based on how your raw key should be used
                                        player.configure({
                                            drm: {
                                                clearKeys: item.key.raw_key
                                            }
                                        });
                                    }
                                }

                                console.log('Loading source:', item.source);
                                await player.load(item.source);
                                console.log('Source loaded successfully');

                                // 显示视频信息
                                const videoInfo = document.getElementById('videoInfo');
                                const videoTitle = videoInfo.querySelector('.video-title');
                                const videoCategory = videoInfo.querySelector('.video-category .badge');
                                
                                videoTitle.textContent = item.tvgName;
                                videoCategory.textContent = item.groupTitle;
                                
                                videoInfo.classList.remove('d-none');
                                videoPlayer.scrollIntoView({ behavior: 'smooth' });
                                videoPlayer.classList.remove("d-none");

                                saveRecentPlayed(item);
                            } catch (error) {
                                console.error('Error in renderPlaylist:', error);
                                onPlayerError(error);
                                videoPlayer.classList.add("d-none");
                            }
                        });

                        channelsContainer.appendChild(channelItem);
                    });

                    categoryContainer.appendChild(categoryHeader);
                    categoryContainer.appendChild(channelsContainer);
                    fragment.appendChild(categoryContainer);
                });
            }

            target.appendChild(fragment);
        }

        function onPlayerError(error) {
            console.error('Detailed error information:', error);
            
            // You can add more specific error handling here
            if (error.code === shaka.util.Error.Code.DASH_INVALID_XML) {
                console.error('Invalid DASH manifest');
            } else if (error.code === shaka.util.Error.Code.BAD_HTTP_STATUS) {
                console.error('Bad HTTP status');
            }
            
            // Clear any existing error messages
            clearErrorMessage();

            // Display an error message to the user
            const errorMessage = document.createElement('div');
            errorMessage.classList.add('video-error-message');  // Add a class for easy identification
            errorMessage.textContent = `Error loading video: ${error.message || error.code}`;
            errorMessage.style.color = 'red';
            videoPlayer.parentNode.insertBefore(errorMessage, videoPlayer.nextSibling);
        }

        function clearErrorMessage() {
            // Clear any existing error messages
            const existingErrorMessage = document.querySelector('.video-error-message');
            if (existingErrorMessage) {
                existingErrorMessage.remove();
            }
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