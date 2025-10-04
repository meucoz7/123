class LumexMovieSearch {
    constructor() {
        this.apiToken = '349c3e1fd42a4974f61efee753c3a038';
        this.clientId = 'b0MGiq8L7Awu';
        this.username = 'filma4';
        this.password = 'KKsWhX4xqW7f';
        this.accessToken = null;
        this.refreshToken = null;
        this.currentPage = 1;
        this.currentMovie = null;
        this.hls = null;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.authenticate();
    }

    setupEventListeners() {
        document.getElementById('searchForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.searchMovies();
        });

        document.getElementById('closePlayer').addEventListener('click', () => {
            this.closePlayer();
        });

        document.getElementById('translationSelect').addEventListener('change', (e) => {
            this.changeTranslation(e.target.value);
        });

        // Close player on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closePlayer();
            }
        });
    }

    async authenticate() {
        try {
            const response = await fetch('https://api.lumex.pw/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: this.username,
                    password: this.password
                })
            });

            if (!response.ok) {
                throw new Error('Ошибка авторизации');
            }

            const data = await response.json();
            this.accessToken = data.accessToken;
            this.refreshToken = data.refreshToken;
            
            console.log('Авторизация успешна');
        } catch (error) {
            console.error('Ошибка авторизации:', error);
            this.showError('Ошибка авторизации в системе');
        }
    }

    async refreshAccessToken() {
        try {
            const response = await fetch('https://api.lumex.pw/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token: this.refreshToken
                })
            });

            if (!response.ok) {
                throw new Error('Ошибка обновления токена');
            }

            const data = await response.json();
            this.accessToken = data.accessToken;
            
            console.log('Токен обновлен');
        } catch (error) {
            console.error('Ошибка обновления токена:', error);
            await this.authenticate();
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'User-Agent': navigator.userAgent,
                ...options.headers
            }
        };

        const response = await fetch(url, { ...options, ...defaultOptions });
        
        if (response.status === 403) {
            await this.refreshAccessToken();
            defaultOptions.headers['Authorization'] = `Bearer ${this.accessToken}`;
            return await fetch(url, { ...options, ...defaultOptions });
        }

        return response;
    }

    async searchMovies(page = 1) {
        const searchTerm = document.getElementById('searchInput').value.trim();
        if (!searchTerm) {
            this.showError('Введите название фильма для поиска');
            return;
        }

        this.showLoading(true);
        this.currentPage = page;

        try {
            const url = `https://portal.lumex.host/api/short?api_token=${this.apiToken}&title=${encodeURIComponent(searchTerm)}&page=${page}&limit=20`;
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Ошибка поиска');
            }

            const data = await response.json();
            this.displaySearchResults(data);
            
        } catch (error) {
            console.error('Ошибка поиска:', error);
            this.showError('Ошибка при поиске фильмов');
        } finally {
            this.showLoading(false);
        }
    }

    displaySearchResults(data) {
        const resultsContainer = document.getElementById('searchResults');
        const paginationNav = document.getElementById('paginationNav');
        
        if (!data.result || !data.data || data.data.length === 0) {
            resultsContainer.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-search fa-3x text-muted mb-3"></i>
                    <h4>Фильмы не найдены</h4>
                    <p class="text-muted">Попробуйте изменить поисковый запрос</p>
                </div>
            `;
            paginationNav.style.display = 'none';
            return;
        }

        // Display results
        resultsContainer.innerHTML = `
            <div class="row">
                ${data.data.map(movie => this.createMovieCard(movie)).join('')}
            </div>
        `;

        // Display pagination
        this.displayPagination(data);
    }

    createMovieCard(movie) {
        const posterUrl = movie.iframe_src ? `https://p.lumex.cloud${movie.iframe_src}/poster.jpg` : 'https://via.placeholder.com/300x450?text=No+Image';
        
        return `
            <div class="col-md-3 col-sm-6 mb-4">
                <div class="card movie-card h-100" onclick="movieSearch.playMovie(${movie.id}, '${movie.title}', '${movie.year}', '${movie.type}')">
                    <img src="${posterUrl}" class="card-img-top movie-poster" alt="${movie.title}" 
                         onerror="this.src='https://via.placeholder.com/300x450?text=No+Image'">
                    <div class="card-body d-flex flex-column">
                        <h6 class="card-title">${movie.title}</h6>
                        <p class="card-text text-muted small">
                            ${movie.orig_title ? `<strong>Оригинал:</strong> ${movie.orig_title}<br>` : ''}
                            <strong>Год:</strong> ${movie.year ? movie.year.split('-')[0] : 'Не указан'}<br>
                            <strong>Тип:</strong> ${movie.type === 'movie' ? 'Фильм' : 'Сериал'}<br>
                            ${movie.seasons_count ? `<strong>Сезонов:</strong> ${movie.seasons_count}<br>` : ''}
                            ${movie.episodes_count ? `<strong>Серий:</strong> ${movie.episodes_count}` : ''}
                        </p>
                        <div class="mt-auto">
                            <span class="badge bg-primary">${movie.translations ? movie.translations.length : 0} переводов</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    displayPagination(data) {
        const paginationNav = document.getElementById('paginationNav');
        const pagination = document.getElementById('pagination');
        
        if (data.last_page <= 1) {
            paginationNav.style.display = 'none';
            return;
        }

        paginationNav.style.display = 'block';
        
        let paginationHTML = '';
        
        // Previous button
        if (data.current_page > 1) {
            paginationHTML += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="movieSearch.searchMovies(${data.current_page - 1})">Предыдущая</a>
                </li>
            `;
        }

        // Page numbers
        const startPage = Math.max(1, data.current_page - 2);
        const endPage = Math.min(data.last_page, data.current_page + 2);

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <li class="page-item ${i === data.current_page ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="movieSearch.searchMovies(${i})">${i}</a>
                </li>
            `;
        }

        // Next button
        if (data.current_page < data.last_page) {
            paginationHTML += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="movieSearch.searchMovies(${data.current_page + 1})">Следующая</a>
                </li>
            `;
        }

        pagination.innerHTML = paginationHTML;
    }

    async playMovie(contentId, title, year, contentType) {
        this.showLoading(true);
        
        try {
            const url = `https://api.lumex.pw/stream?clientId=${this.clientId}&contentType=${contentType}&contentId=${contentId}&domain=movie-search`;
            
            const response = await this.makeAuthenticatedRequest(url);
            if (!response.ok) {
                throw new Error('Ошибка получения данных о фильме');
            }

            const data = await response.json();
            this.currentMovie = data;
            
            this.displayPlayer(title, year, data);
            
        } catch (error) {
            console.error('Ошибка воспроизведения:', error);
            this.showError('Ошибка при загрузке фильма');
        } finally {
            this.showLoading(false);
        }
    }

    displayPlayer(title, year, movieData) {
        const playerContainer = document.getElementById('playerContainer');
        const movieTitle = document.getElementById('movieTitle');
        const movieYear = document.getElementById('movieYear');
        const translationSelector = document.getElementById('translationSelector');
        const translationSelect = document.getElementById('translationSelect');
        
        // Set movie info
        movieTitle.textContent = title;
        movieYear.textContent = year ? year.split('-')[0] : '';
        
        // Setup translations
        if (movieData.player.media && movieData.player.media.length > 0) {
            translationSelector.style.display = 'block';
            translationSelect.innerHTML = '';
            
            movieData.player.media.forEach((media, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${media.translation_name} (${media.max_quality}p)`;
                translationSelect.appendChild(option);
            });
            
            // Play first translation
            this.playTranslation(0);
        }
        
        playerContainer.style.display = 'flex';
    }

    async playTranslation(translationIndex) {
        if (!this.currentMovie || !this.currentMovie.player.media[translationIndex]) {
            return;
        }

        const media = this.currentMovie.player.media[translationIndex];
        const playlistUrl = `https://api.lumex.pw${media.playlist}`;
        
        try {
            // Get actual stream URL
            const response = await this.makeAuthenticatedRequest(playlistUrl, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error('Ошибка получения ссылки на поток');
            }
            
            const streamUrl = await response.text();
            
            // Setup video player
            const videoPlayer = document.getElementById('videoPlayer');
            
            // Destroy existing HLS instance
            if (this.hls) {
                this.hls.destroy();
            }
            
            // Check if HLS is supported
            if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
                videoPlayer.src = streamUrl;
            } else if (Hls.isSupported()) {
                // HLS.js support
                this.hls = new Hls();
                this.hls.loadSource(streamUrl);
                this.hls.attachMedia(videoPlayer);
            } else {
                throw new Error('HLS не поддерживается в вашем браузере');
            }
            
            // Show ads if available
            if (this.currentMovie.ads && this.currentMovie.ads.rolls) {
                await this.showAds(this.currentMovie.ads.rolls);
            }
            
        } catch (error) {
            console.error('Ошибка воспроизведения:', error);
            this.showError('Ошибка при загрузке видео');
        }
    }

    async showAds(ads) {
        // Simple ad implementation - in real app you'd use proper VAST player
        if (ads && ads.length > 0) {
            const adUrl = ads[0].tag_url;
            console.log('Показ рекламы:', adUrl);
            
            // Here you would implement proper VAST ad player
            // For now, just show a simple alert
            alert('Реклама (в реальном приложении здесь будет VAST плеер)');
        }
    }

    changeTranslation(translationIndex) {
        this.playTranslation(parseInt(translationIndex));
    }

    closePlayer() {
        const playerContainer = document.getElementById('playerContainer');
        const videoPlayer = document.getElementById('videoPlayer');
        
        // Stop video
        videoPlayer.pause();
        videoPlayer.src = '';
        
        // Destroy HLS instance
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        
        // Hide player
        playerContainer.style.display = 'none';
        this.currentMovie = null;
    }

    showLoading(show) {
        const loadingSpinner = document.getElementById('loadingSpinner');
        loadingSpinner.style.display = show ? 'block' : 'none';
    }

    showError(message) {
        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = `
            <div class="alert alert-danger text-center">
                <i class="fas fa-exclamation-triangle me-2"></i>
                ${message}
            </div>
        `;
    }
}

// Initialize the application
const movieSearch = new LumexMovieSearch();