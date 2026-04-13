class MovieSearchApp {
    constructor() {
        this.apiToken = '349c3e1fd42a4974f61efee753c3a038';
        this.clientId = 'b0MGiq8L7Awu';
        this.baseUrl = 'https://portal.lumex.host/api/short';
        this.currentMovie = null;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchMovies();
            }
        });
        
        searchBtn.addEventListener('click', () => {
            this.searchMovies();
        });
    }

    async searchMovies() {
        const query = document.getElementById('searchInput').value.trim();
        if (!query) return;

        this.showLoading(true);
        this.clearResults();

        try {
            const url = `${this.baseUrl}?api_token=${this.apiToken}&title=${encodeURIComponent(query)}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.result && data.data) {
                this.displaySearchResults(data.data);
            } else {
                this.showNoResults();
            }
        } catch (error) {
            console.error('Ошибка поиска:', error);
            this.showError('Ошибка при поиске фильмов');
        } finally {
            this.showLoading(false);
        }
    }

    displaySearchResults(movies) {
        const resultsContainer = document.getElementById('searchResults');
        
        if (movies.length === 0) {
            this.showNoResults();
            return;
        }

        const moviesHtml = movies.map(movie => this.createMovieCard(movie)).join('');
        resultsContainer.innerHTML = `
            <div class="row">
                ${moviesHtml}
            </div>
        `;
    }

    createMovieCard(movie) {
        const year = movie.year ? new Date(movie.year).getFullYear() : 'Неизвестно';
        const type = movie.type === 'serial' ? 'Сериал' : 'Фильм';
        
        return `
            <div class="col-12 mb-3">
                <div class="card bg-secondary movie-card" data-movie-id="${movie.id}" onclick="app.selectMovie(${movie.id})">
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-3">
                                <div class="movie-poster bg-dark d-flex align-items-center justify-content-center">
                                    <i class="fas fa-film fa-3x text-muted"></i>
                                </div>
                            </div>
                            <div class="col-md-9">
                                <h5 class="card-title">${movie.title}</h5>
                                <p class="card-text">
                                    <small class="text-muted">
                                        ${movie.orig_title ? `Оригинальное название: ${movie.orig_title}<br>` : ''}
                                        Год: ${year} | Тип: ${type}
                                        ${movie.seasons_count ? ` | Сезонов: ${movie.seasons_count}` : ''}
                                        ${movie.episodes_count ? ` | Серий: ${movie.episodes_count}` : ''}
                                    </small>
                                </p>
                                <div class="translations-preview">
                                    <small class="text-info">
                                        Переводы: ${movie.translations.slice(0, 2).join(', ')}
                                        ${movie.translations.length > 2 ? ` и еще ${movie.translations.length - 2}...` : ''}
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async selectMovie(movieId) {
        try {
            const url = `${this.baseUrl}?api_token=${this.apiToken}&id=${movieId}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.result && data.data && data.data.length > 0) {
                this.currentMovie = data.data[0];
                this.showMovieInfo(this.currentMovie);
                this.showTranslationModal(this.currentMovie);
            }
        } catch (error) {
            console.error('Ошибка загрузки фильма:', error);
            this.showError('Ошибка при загрузке фильма');
        }
    }

    showMovieInfo(movie) {
        const movieInfo = document.getElementById('movieInfo');
        const movieTitle = document.getElementById('movieTitle');
        const movieDetails = document.getElementById('movieDetails');
        
        const year = movie.year ? new Date(movie.year).getFullYear() : 'Неизвестно';
        const type = movie.type === 'serial' ? 'Сериал' : 'Фильм';
        
        movieTitle.textContent = movie.title;
        movieDetails.innerHTML = `
            ${movie.orig_title ? `<strong>Оригинальное название:</strong> ${movie.orig_title}<br>` : ''}
            <strong>Год:</strong> ${year} | <strong>Тип:</strong> ${type}
            ${movie.seasons_count ? ` | <strong>Сезонов:</strong> ${movie.seasons_count}` : ''}
            ${movie.episodes_count ? ` | <strong>Серий:</strong> ${movie.episodes_count}` : ''}
        `;
        
        movieInfo.style.display = 'block';
    }

    showTranslationModal(movie) {
        const modal = new bootstrap.Modal(document.getElementById('translationModal'));
        const translationList = document.getElementById('translationList');
        
        const translationsHtml = movie.translations.map((translation, index) => `
            <div class="form-check mb-2">
                <input class="form-check-input" type="radio" name="translation" id="translation${index}" value="${index}">
                <label class="form-check-label" for="translation${index}">
                    ${translation}
                </label>
            </div>
        `).join('');
        
        translationList.innerHTML = translationsHtml;
        
        // Добавляем обработчик выбора перевода
        translationList.addEventListener('change', (e) => {
            if (e.target.type === 'radio') {
                this.playMovie(movie, parseInt(e.target.value));
                modal.hide();
            }
        });
        
        modal.show();
    }

    playMovie(movie, translationIndex) {
        const videoPlayer = document.getElementById('videoPlayer');
        
        // Формируем URL для воспроизведения
        const iframeSrc = movie.iframe_src;
        const streamUrl = `https:${iframeSrc}`;
        
        // Для интеграции потока в наш плеер, нам нужно получить прямую ссылку на поток
        // Это может потребовать дополнительных API вызовов или использования специальных методов
        this.loadStream(movie, translationIndex, streamUrl);
    }

    async loadStream(movie, translationIndex, streamUrl) {
        try {
            // Здесь должна быть логика для получения прямой ссылки на поток
            // В зависимости от API, это может быть отдельный запрос или парсинг iframe
            
            // Пока что показываем сообщение о том, что нужно настроить интеграцию
            this.showStreamInfo(movie, translationIndex, streamUrl);
            
        } catch (error) {
            console.error('Ошибка загрузки потока:', error);
            this.showError('Ошибка при загрузке видео');
        }
    }

    showStreamInfo(movie, translationIndex, streamUrl) {
        const videoPlayer = document.getElementById('videoPlayer');
        
        // Создаем информационное сообщение
        const infoDiv = document.createElement('div');
        infoDiv.className = 'alert alert-info';
        infoDiv.innerHTML = `
            <h5>Информация о потоке</h5>
            <p><strong>Фильм:</strong> ${movie.title}</p>
            <p><strong>Перевод:</strong> ${movie.translations[translationIndex]}</p>
            <p><strong>URL потока:</strong> ${streamUrl}</p>
            <p class="mb-0"><em>Для полной интеграции необходимо настроить получение прямой ссылки на поток из API.</em></p>
        `;
        
        videoPlayer.parentNode.insertBefore(infoDiv, videoPlayer);
        videoPlayer.style.display = 'none';
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        loading.style.display = show ? 'block' : 'none';
    }

    clearResults() {
        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = '';
    }

    showNoResults() {
        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-search fa-3x mb-3"></i>
                <p>Фильмы не найдены</p>
            </div>
        `;
    }

    showError(message) {
        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> ${message}
            </div>
        `;
    }
}

// Инициализация приложения
const app = new MovieSearchApp();