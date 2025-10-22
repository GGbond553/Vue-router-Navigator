class VueRouterNavigator {
  constructor() {
    this.router = null;
    this.routes = [];
    this.floatingWindow = null;
    this.shadowRoot = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.position = { x: 0, y: 0 };
    this.menuOpen = false;
    this.searchResults = [];
    this.scrollAnimations = new Map();
    
    this.init();
  }

  async init() {
    await this.loadPosition();
    this.detectRouter();
    this.createFloatingWindow();
    this.setupMessageListener();
  }

  detectRouter() {
    // 立即检查一次
    this.performRouterDetection();
    
    let attempts = 0;
    const maxAttempts = 50;
    
    const checkRouter = () => {
      if (attempts >= maxAttempts) {
        this.updateStatus();
        return;
      }
      
      if (attempts > 0) {
        this.performRouterDetection();
      }
      
      attempts++;
      setTimeout(checkRouter, 100);
    };
    
    checkRouter();
  }
  
  performRouterDetection() {
    // Vue 3 检测
    const appElement = document.querySelector('#app') || document.querySelector('.app');
    if (appElement && appElement.__vue_app__) {
      const router = appElement.__vue_app__.config?.globalProperties?.$router;
      if (router) {
        this.router = router;
        this.extractRoutes();
        this.updateStatus();
        return;
      }
    }
    
    // Vue 2 检测
    if (window.Vue && window.Vue.prototype && window.Vue.prototype.$router) {
      this.router = window.Vue.prototype.$router;
      this.extractRoutes();
      this.updateStatus();
      return;
    }
    
    // 全局路由检测
    if (window.$router) {
      this.router = window.$router;
      this.extractRoutes();
      this.updateStatus();
    }
    
    // 扫描页面中的 Vue 实例
    const allElements = document.querySelectorAll('*');
    
    for (let element of allElements) {
      if (element.__vue__) {
        const vueInstance = element.__vue__;
        if (vueInstance.$router) {
          this.router = vueInstance.$router;
          this.extractRoutes();
          this.updateStatus();
          return;
        }
      }
      
      if (element.__vueParentComponent__) {
        const parentComponent = element.__vueParentComponent__;
        if (parentComponent.$router) {
          this.router = parentComponent.$router;
          this.extractRoutes();
          this.updateStatus();
          return;
        }
      }
    }
    
    // 检查常见的 Vue 挂载点
    const commonSelectors = ['#app', '#root', '.app', '.root'];
    for (let selector of commonSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        if (element.__vue__) {
          const vueInstance = element.__vue__;
          if (vueInstance.$router) {
            this.router = vueInstance.$router;
            this.extractRoutes();
            this.updateStatus();
            return;
          }
        }
        
        if (element.__vueParentComponent__) {
          const parentComponent = element.__vueParentComponent__;
          if (parentComponent.$router) {
            this.router = parentComponent.$router;
            this.extractRoutes();
            this.updateStatus();
            return;
          }
        }
      }
    }
  }

  extractRoutes() {
    if (!this.router) return;
    
    try {
      let routes;
      if (this.router.getRoutes) {
        routes = this.router.getRoutes();
      } else if (this.router.options?.routes) {
        routes = this.router.options.routes;
      } else if (this.router.matcher?.getRoutes) {
        routes = this.router.matcher.getRoutes();
      } else if (Array.isArray(this.router)) {
        routes = this.router;
      } else {
        this.routes = [];
        return;
      }
      
      this.routes = routes ? this.flattenRoutes(routes) : [];
    } catch (error) {
      this.routes = [];
    }
  }

  flattenRoutes(routes, parentPath = '', depth = 0) {
    if (!Array.isArray(routes)) return [];
    
    return routes.reduce((result, route) => {
      if (!route) return result;
      
      const fullPath = parentPath + (route.path || '');
      result.push({
        name: route.name,
        path: fullPath,
        depth,
        parent: parentPath,
        children: route.children || []
      });
      
      if (route.children?.length) {
        result.push(...this.flattenRoutes(route.children, fullPath + '/', depth + 1));
      }
      
      return result;
    }, []);
  }

  createFloatingWindow() {
    const container = document.createElement('div');
    container.id = 'vue-router-navigator';
    
    this.shadowRoot = container.attachShadow({ mode: 'open' });
    
    this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="floating-window" id="floating-window">
        <div class="drag-handle" id="drag-handle">
          <button id="back-button" type="button" style="display:none;">←</button>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M2 5h12M2 8h12M2 11h12" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
        </div>
        <div class="search-container">
          <input type="text" id="search-input" placeholder="搜索路由 (Alt+R)" />
          <button id="menu-toggle" type="button">☰</button>
        </div>
        <div class="search-results" id="search-results"></div>
        <div class="route-menu" id="route-menu"></div>
      </div>
    `;
    
    document.body.appendChild(container);
    this.floatingWindow = this.shadowRoot.getElementById('floating-window');
    
    // 悬浮窗元素检查完成
    
    this.setupEventListeners();
    this.updatePosition();
    
    // 初始化时检测边缘
    setTimeout(() => {
      this.checkEdgeCollision();
    }, 100);
  }

  getStyles() {
    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      
      .floating-window {
        position: fixed;
        width: auto;
        min-width: 100px;
        max-width: 20vw;
        background: #fff;
        border: 1px solid #000;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.1);
        z-index: 10000;
        transition: opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        line-height: 1.5;
        overflow: visible;
        opacity: 0.25;
      }
      
      .floating-window.focused {
        opacity: 1;
      }
      
      .floating-window.expanded {
        width: auto;
        min-width: 100px;
        max-width: 20vw;
      }
      
      .floating-window.dragging {
        opacity: 0.7;
      }
      
      .drag-handle {
        cursor: move;
        padding: 4px;
        text-align: center;
        border-bottom: 1px solid #e0e0e0;
        color: #666;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }
      
      .drag-handle:hover {
        color: #000;
      }
      
      #back-button {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 12px;
        padding: 2px 4px;
        border-radius: 2px;
        color: #666;
      }
      
      #back-button:hover {
        background: #f5f5f5;
        color: #000;
      }
      
      .search-container {
        display: flex;
        padding: 8px;
        gap: 4px;
        flex-shrink: 0;
      }
      
      #search-input {
        flex: 1;
        padding: 4px 6px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        font-size: 11px;
        outline: none;
        min-width: 0;
        transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      }
      
      #search-input:focus {
        border-color: #000;
      }
      
      #menu-toggle {
        padding: 4px 6px;
        border: 1px solid #e0e0e0;
        background: #fff;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        flex-shrink: 0;
      }
      
      #menu-toggle:hover {
        background: #f5f5f5;
      }
      
      .search-results, .route-menu {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: #fff;
        border: 1px solid #000;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        opacity: 0;
        transform: scale(0.95) translateY(-10px);
        transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        z-index: 10001;
        margin-top: 4px;
        max-width: 20vw;
        max-height: 200px;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-width: thin;
        scrollbar-color: #ccc #f5f5f5;
      }
      
      .search-results {
        pointer-events: auto;
      }
      
      .search-results::-webkit-scrollbar, .route-menu::-webkit-scrollbar {
        width: 6px;
      }
      
      .search-results::-webkit-scrollbar-track, .route-menu::-webkit-scrollbar-track {
        background: #f5f5f5;
        border-radius: 3px;
      }
      
      .search-results::-webkit-scrollbar-thumb, .route-menu::-webkit-scrollbar-thumb {
        background: #ccc;
        border-radius: 3px;
      }
      
      .search-results::-webkit-scrollbar-thumb:hover, .route-menu::-webkit-scrollbar-thumb:hover {
        background: #999;
      }
      
      .search-results.show, .route-menu.show {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
      
      .search-item, .menu-item {
        padding: 4px 6px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        transition: background 0.1s ease;
        position: relative;
        overflow: hidden;
      }
      
      .search-item:hover, .menu-item:hover {
        background: #f5f5f5;
      }
      
      .search-item.selected {
        background: #e8f4fd;
        border-left: 2px solid #007acc;
      }
      
      .search-item:last-child, .menu-item:last-child {
        border-bottom: none;
      }
      
      .route-name {
        font-weight: 600;
        color: #000;
        white-space: nowrap;
        display: block;
        transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        max-width: 20vw;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        line-height: 1.3;
      }
      
      .route-path {
        font-size: 9px;
        color: #666;
        margin-top: 1px;
        white-space: nowrap;
        display: block;
        transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.2;
      }
      
      .search-item:hover .route-name,
      .search-item:hover .route-path,
      .menu-item:hover .route-name,
      .menu-item:hover .route-path {
        transform: translateX(0) !important;
      }
    `;
  }

  setupEventListeners() {
    const dragHandle = this.shadowRoot.getElementById('drag-handle');
    const searchInput = this.shadowRoot.getElementById('search-input');
    const menuToggle = this.shadowRoot.getElementById('menu-toggle');
    const backButton = this.shadowRoot.getElementById('back-button');
    
    // 拖拽功能
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    
    dragHandle.addEventListener('mousedown', (e) => {
      if (e.target === backButton) return;
      isDragging = true;
      dragOffset.x = e.clientX - this.position.x;
      dragOffset.y = e.clientY - this.position.y;
      this.floatingWindow.classList.add('dragging');
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      this.position.x = e.clientX - dragOffset.x;
      this.position.y = e.clientY - dragOffset.y;
      
      // 拖拽过程中使用简单边界限制，不触发复杂的边缘检测
      const rect = this.floatingWindow.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;
      
      // 简单边界限制，允许临时超出边界
      this.position.x = Math.max(0, Math.min(this.position.x, maxX));
      this.position.y = Math.max(0, Math.min(this.position.y, maxY));
      
      // 直接更新位置，不触发任何边缘检测
      this.floatingWindow.style.left = this.position.x + 'px';
      this.floatingWindow.style.top = this.position.y + 'px';
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        this.floatingWindow.classList.remove('dragging');
        
        // 拖拽停止后进行完整的边缘检测和位置调整
        this.checkEdgeCollision();
        this.savePosition();
      }
    });
    
    searchInput.addEventListener('input', this.handleSearch.bind(this));
    searchInput.addEventListener('keydown', this.handleSearchKeydown.bind(this));
    searchInput.addEventListener('focus', this.handleSearchFocus.bind(this));
    searchInput.addEventListener('blur', this.handleSearchBlur.bind(this));
    
    menuToggle?.addEventListener('click', e => {
      e.stopPropagation();
      this.toggleMenu();
    });
    backButton?.addEventListener('click', this.handleBackButton.bind(this));
    
    window.addEventListener('resize', this.handleWindowResize.bind(this));
    document.addEventListener('keydown', this.handleGlobalKeydown.bind(this));
    
    // 点击悬浮窗内部聚焦，点击外部失焦
    this.floatingWindow.addEventListener('click', e => {
      this.handleFloatingWindowFocus();
      e.stopPropagation();
    });
    
    document.addEventListener('click', e => {
      if (!this.floatingWindow.contains(e.target)) {
        this.handleFloatingWindowBlur();
        this.hideSearchResults();
        this.hideRouteMenu();
      }
    });
  }

  setupMessageListener() {
    try {
      if (chrome && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
          if (request.action === 'getStatus') {
            sendResponse({ hasRouter: !!this.router });
          }
        });
      }
    } catch (error) {
      // 消息监听器设置失败
    }
  }

  startDrag(e) {
    this.isDragging = true;
    this.dragOffset.x = e.clientX - this.position.x;
    this.dragOffset.y = e.clientY - this.position.y;
    this.floatingWindow.classList.add('dragging');
  }

  drag(e) {
    if (!this.isDragging) return;
    
    const newX = e.clientX - this.dragOffset.x;
    const newY = e.clientY - this.dragOffset.y;
    
    const rect = this.floatingWindow.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    
    this.position.x = Math.max(8, Math.min(newX, maxX));
    this.position.y = Math.max(8, Math.min(newY, maxY));
    
    this.updatePosition();
  }

  endDrag() {
    if (this.isDragging) {
      this.isDragging = false;
      this.floatingWindow.classList.remove('dragging');
      this.savePosition();
      
      // 拖拽停止后检测边缘碰撞，确保至少10px距离
      // 注意：现在主要在mouseup事件中处理边缘检测
      this.checkEdgeCollision();
    }
  }

  updatePosition() {
    this.floatingWindow.style.left = this.position.x + 'px';
    this.floatingWindow.style.top = this.position.y + 'px';
    
    // 仅在非拖拽状态下检测边缘碰撞，避免影响拖拽流畅性
    if (!this.isDragging) {
      setTimeout(() => {
        this.checkEdgeCollision();
      }, 0);
    }
  }

  async savePosition() {
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({
          navigatorPosition: this.position
        });
      }
    } catch (error) {
      // 位置保存失败
    }
  }

  async loadPosition() {
    try {
      if (chrome?.storage?.local) {
        const result = await chrome.storage.local.get('navigatorPosition');
        if (result.navigatorPosition) {
          this.position = result.navigatorPosition;
          return;
        }
      }
    } catch (error) {
      // 位置加载失败
    }
    
    // 默认位置：右上角，无间距
    this.position = {
      x: window.innerWidth - 84, // 紧贴右侧
      y: 16
    };
  }

  handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
      this.hideSearchResults();
      return;
    }
    
    this.searchResults = this.routes.filter(route => 
      route.name?.toLowerCase().includes(query) || 
      route.path?.toLowerCase().includes(query)
    ).slice(0, 15); // 增加结果数量到15个
    
    this.showSearchResults();
  }

  showSearchResults() {
    const resultsContainer = this.shadowRoot.getElementById('search-results');
    resultsContainer.innerHTML = '';
    
    this.searchResults.forEach((route, index) => {
      const item = document.createElement('div');
      item.className = 'search-item';
      if (index === 0) item.classList.add('selected'); // 默认选中第一项
      item.innerHTML = `<div class="route-name">${route.name || '未命名'}</div><div class="route-path">${route.path}</div>`;
      
      item.addEventListener('click', () => this.navigateToRoute(route));
      item.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.showContextMenu(e, route);
      });
      
      // 添加鼠标悬停效果
      item.addEventListener('mouseenter', () => {
        const selected = resultsContainer.querySelector('.search-item.selected');
        if (selected) selected.classList.remove('selected');
        item.classList.add('selected');
      });
      
      resultsContainer.appendChild(item);
    });
    
    resultsContainer.classList.add('show');
    
    // 确保搜索结果可见且可以滚动
    resultsContainer.scrollTop = 0;
    
    // 搜索结果展示后重新计算宽度并检测边缘
    this.adjustWidthByContent();
    
    // 高度变化后检测边缘碰撞
    setTimeout(() => {
      this.checkEdgeCollision();
    }, 100);
  }

  hideSearchResults() {
    const resultsContainer = this.shadowRoot.getElementById('search-results');
    resultsContainer.classList.remove('show');
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
    // 菜单切换状态处理
    
    const menuContainer = this.shadowRoot.getElementById('route-menu');
    if (!menuContainer) {
      // 菜单容器未找到，静默处理
      return;
    }
    
    if (this.menuOpen) {
      this.showRouteMenu();
      // 显示下拉框时确保悬浮窗保持聚焦状态
      this.handleFloatingWindowFocus();
      // 下拉框打开时根据内容调整宽度
      this.adjustWidthByContent();
    } else {
      this.hideRouteMenu();
      // 下拉框关闭时恢复最小宽度
      this.floatingWindow.style.width = '100px';
      
      // 宽度变化后检测边缘碰撞
      setTimeout(() => {
        this.checkEdgeCollision();
      }, 100);
    }
  }

  showRouteMenu() {
    const menuContainer = this.shadowRoot.getElementById('route-menu');
    
    if (!this.routes?.length) {
      menuContainer.innerHTML = '<div class="menu-item" style="padding: 8px 12px; color: #999;">暂无路由</div>';
    } else {
      menuContainer.innerHTML = this.buildMenuHTML(this.getRouteTree());
    }
    
    menuContainer.classList.add('show');
    this.attachMenuEventListeners(menuContainer);
    
    // 下拉框显示后根据内容调整宽度
    setTimeout(() => {
      this.adjustWidthForMenu();
      
      // 高度变化后检测边缘碰撞
      setTimeout(() => {
        this.checkEdgeCollision();
      }, 100);
    }, 50);
  }

  hideRouteMenu() {
    const menuContainer = this.shadowRoot.getElementById('route-menu');
    menuContainer.classList.remove('show');
  }

  getRouteTree() {
    if (!this.routes?.length) return [];
    
    const routeMap = new Map();
    
    this.routes.forEach(route => {
      if (route.depth === 0) {
        routeMap.set(route.path, { ...route, children: [] });
      }
    });
    
    this.routes.forEach(route => {
      if (route.depth > 0) {
        const parent = routeMap.get(route.parent);
        if (parent) {
          parent.children.push(route);
        }
      }
    });
    
    return Array.from(routeMap.values());
  }

  buildMenuHTML(routes, level = 0) {
    return routes.map(route => 
      `<div class="menu-item" style="padding-left:${12+level*16}px" data-path="${route.path}">
        <div class="route-name">${route.name||'未命名'}</div>
        <div class="route-path">${route.path}</div>
      </div>${route.children.length?this.buildMenuHTML(route.children,level+1):''}`
    ).join('');
  }

  attachMenuEventListeners(container) {
    const items = container.querySelectorAll('.menu-item');
    
    items.forEach(item => {
      item.addEventListener('click', () => {
        const path = item.dataset.path;
        const route = this.routes.find(r => r.path === path);
        if (route) {
          this.navigateToRoute(route);
        }
      });
      
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const path = item.dataset.path;
        const route = this.routes.find(r => r.path === path);
        if (route) {
          this.showContextMenu(e, route);
        }
      });
      
      this.setupScrollAnimation(item);
    });
  }

  navigateToRoute(route) {
    if (this.router) {
      try {
        if (route.name) {
          this.router.push({ name: route.name });
        } else {
          this.router.push(route.path);
        }
        this.hideSearchResults();
        this.hideRouteMenu();
        this.menuOpen = false; // 重置菜单状态
      } catch (error) {
        // 路由导航失败，静默处理
      }
    }
  }

  showContextMenu(e, route) {
    const menu = document.createElement('div');
    menu.style.cssText = `
      position: fixed;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      background: #fff;
      border: 1px solid #000;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10002;
      font-size: 12px;
    `;
    
    menu.innerHTML = `
      <div style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0;" onclick="window.open('${route.path}', '_blank')">
        新标签打开
      </div>
      <div style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0;" onclick="navigator.clipboard.writeText('${route.path}')">
        复制路径
      </div>
      ${route.name ? `<div style="padding: 8px 12px; cursor: pointer;" onclick="navigator.clipboard.writeText('${route.name}')">
        复制 name
      </div>` : ''}
    `;
    
    document.body.appendChild(menu);
    
    const removeMenu = () => {
      if (menu.parentNode) {
        menu.parentNode.removeChild(menu);
      }
      document.removeEventListener('click', removeMenu);
    };
    
    setTimeout(() => {
      document.addEventListener('click', removeMenu);
    }, 100);
  }


   handleSearchKeydown(e) {
    if (e.key === 'Escape') {
      this.hideSearchResults();
      this.hideRouteMenu();
      this.shadowRoot.getElementById('search-input').blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedItem = this.shadowRoot.querySelector('.search-item.selected');
      if (selectedItem && this.searchResults.length > 0) {
        selectedItem.click();
      } else if (this.searchResults.length > 0) {
        // 如果没有选中项但有搜索结果，默认点击第一个结果
        const firstItem = this.shadowRoot.querySelector('.search-item');
        if (firstItem) {
          firstItem.click();
        }
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.handleSearchResultsNavigation(e.key);
    }
  }
  
  showSearchResultsWithAnimation() {
    const searchContainer = this.shadowRoot.querySelector('.search-container');
    const searchResults = this.shadowRoot.getElementById('search-results');
    const backButton = this.shadowRoot.getElementById('back-button');
    
    searchContainer.style.transition = 'opacity 0.3s ease';
    searchResults.style.transition = 'opacity 0.3s ease';
    
    searchContainer.style.opacity = '0';
    searchResults.style.opacity = '1';
    backButton.style.display = 'block';
    
    setTimeout(() => {
      searchContainer.style.display = 'none';
      searchResults.classList.add('show');
      // 搜索结果显示后根据内容调整宽度
      this.adjustWidthByContent();
      // 保持搜索框焦点并启用键盘导航
      const searchInput = this.shadowRoot.getElementById('search-input');
      searchInput.focus();
      searchInput.addEventListener('keydown', this.handleKeyboardNavigation.bind(this));
    }, 300);
  }
  
  handleSearchFocus() {
    this.floatingWindow.classList.add('focused', 'expanded');
    // 聚焦搜索框时停止事件冒泡，避免触发外部点击事件
    event?.stopPropagation();
    // 搜索框聚焦时根据内容计算所需宽度
    this.adjustWidthByContent();
  }
  
  handleFloatingWindowFocus() {
    this.floatingWindow.classList.add('focused');
  }
  
  handleFloatingWindowBlur() {
    this.floatingWindow.classList.remove('focused');
    // 失焦时恢复最小宽度
    this.floatingWindow.style.width = '100px';
  }
  
  adjustWidthByContent() {
    // 根据内容计算所需宽度 - 搜索结果和菜单使用相同的宽度计算逻辑
    const searchContainer = this.shadowRoot.querySelector('.search-container');
    const searchInput = this.shadowRoot.getElementById('search-input');
    const menuToggle = this.shadowRoot.getElementById('menu-toggle');
    const searchResults = this.shadowRoot.getElementById('search-results');
    const routeMenu = this.shadowRoot.getElementById('route-menu');
    
    // 临时显示元素来计算实际宽度
    const originalDisplay = searchContainer.style.display;
    searchContainer.style.display = 'flex';
    searchContainer.style.visibility = 'hidden';
    
    // 计算搜索输入框和按钮的实际宽度
    const inputWidth = searchInput.scrollWidth + 12; // padding和边框
    const buttonWidth = menuToggle.offsetWidth + 8; // 间距和padding
    let totalWidth = inputWidth + buttonWidth + 16; // 容器padding
    
    // 如果搜索结果可见，使用与菜单相同的宽度计算逻辑
    if (searchResults.classList.contains('show') && searchResults.children.length > 0) {
      let maxResultWidth = 0;
      searchResults.querySelectorAll('.search-item').forEach(item => {
        const routeName = item.querySelector('.route-name');
        const routePath = item.querySelector('.route-path');
        const nameWidth = this.getTextWidth(routeName.textContent, '11px Arial'); // 使用与菜单相同的字体
        const pathWidth = this.getTextWidth(routePath.textContent, '9px Arial');
        const itemWidth = Math.max(nameWidth, pathWidth) + 24; // 加上padding和边距
        maxResultWidth = Math.max(maxResultWidth, itemWidth);
      });
      totalWidth = Math.max(totalWidth, maxResultWidth);
    }
    
    // 如果菜单可见，计算菜单项的最大宽度
    if (routeMenu.classList.contains('show') && routeMenu.children.length > 0) {
      let maxMenuWidth = 0;
      routeMenu.querySelectorAll('.menu-item').forEach(item => {
        const textWidth = this.getTextWidth(item.textContent, '14px Arial');
        const indent = parseInt(item.style.paddingLeft) || 12;
        const itemWidth = textWidth + indent + 24; // 24px for arrow and padding
        maxMenuWidth = Math.max(maxMenuWidth, itemWidth);
      });
      totalWidth = Math.max(totalWidth, maxMenuWidth);
    }
    
    // 恢复原始状态
    searchContainer.style.display = originalDisplay;
    searchContainer.style.visibility = '';
    
    // 设置宽度，确保能显示完整内容，但不超过最大宽度(20vw)
    const maxWidth = window.innerWidth * 0.2; // 20vw
    const newWidth = Math.min(Math.max(totalWidth, 100), maxWidth);
    
    // 记录原始位置用于后续边缘检测
    const originalPosition = { x: this.position.x, y: this.position.y };
    
    // 更新宽度
    this.floatingWindow.style.width = newWidth + 'px';
    
    // 如果达到20vw上限，添加展开类
    if (newWidth >= maxWidth) {
      this.floatingWindow.classList.add('expanded');
    } else {
      this.floatingWindow.classList.remove('expanded');
    }
    
    // 宽度变化后重新检测边缘碰撞
    setTimeout(() => {
      this.checkEdgeCollision();
    }, 0);
  }
  
  adjustWidthForMenu() {
    // 根据下拉框内容调整宽度
    const menuContainer = this.shadowRoot.getElementById('route-menu');
    const menuItems = menuContainer.querySelectorAll('.menu-item');
    
    if (menuItems.length === 0) {
      this.floatingWindow.style.width = '100px';
      return;
    }
    
    // 计算最长菜单项的宽度
    let contentMaxWidth = 0;
    menuItems.forEach(item => {
      const textWidth = this.getTextWidth(item.textContent, '14px Arial');
      const indent = parseInt(item.style.paddingLeft) || 12;
      contentMaxWidth = Math.max(contentMaxWidth, textWidth + indent + 24); // 24px for arrow and padding
    });
    
    // 设置宽度，确保能显示完整菜单内容，但不超过最大宽度(20vw)
    const maxWidth = window.innerWidth * 0.2; // 20vw
    const newWidth = Math.min(Math.max(contentMaxWidth, 100), maxWidth);
    
    // 记录原始位置用于后续边缘检测
    const originalPosition = { x: this.position.x, y: this.position.y };
    
    // 更新宽度
    this.floatingWindow.style.width = newWidth + 'px';
    
    // 如果达到20vw上限，添加展开类
    if (newWidth >= maxWidth) {
      this.floatingWindow.classList.add('expanded');
    } else {
      this.floatingWindow.classList.remove('expanded');
    }
    
    // 宽度变化后重新检测边缘碰撞
    setTimeout(() => {
      this.checkEdgeCollision();
    }, 0);
  }
  
  getTextWidth(text, font) {
    // 计算文本宽度
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = font;
    const width = context.measureText(text).width;
    canvas.remove();
    return width;
  }
  
  handleSearchBlur() {
    setTimeout(() => {
      if (!this.shadowRoot.querySelector(':focus')) {
        this.floatingWindow.classList.remove('focused', 'expanded');
      }
    }, 200);
  }
  
  handleSearchResultsNavigation(key) {
    const resultsContainer = this.shadowRoot.getElementById('search-results');
    const items = resultsContainer.querySelectorAll('.search-item');
    
    if (items.length === 0) return;
    
    let currentIndex = Array.from(items).findIndex(item => item.classList.contains('selected'));
    
    if (key === 'ArrowDown') {
      currentIndex = (currentIndex + 1) % items.length;
    } else if (key === 'ArrowUp') {
      currentIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    }
    
    items.forEach(item => item.classList.remove('selected'));
    items[currentIndex].classList.add('selected');
    
    // 滚动到选中项
    const selectedItem = items[currentIndex];
    const containerRect = resultsContainer.getBoundingClientRect();
    const itemRect = selectedItem.getBoundingClientRect();
    
    if (itemRect.top < containerRect.top) {
      resultsContainer.scrollTop -= (containerRect.top - itemRect.top);
    } else if (itemRect.bottom > containerRect.bottom) {
      resultsContainer.scrollTop += (itemRect.bottom - containerRect.bottom);
    }
    
    // 确保滚动条可用
    resultsContainer.style.overflowY = 'auto';
  }
  
  handleKeyboardNavigation(e) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.handleSearchResultsNavigation(e.key);
    } else if (e.key === 'Enter') {
      const selectedItem = this.shadowRoot.querySelector('.search-item.selected');
      if (selectedItem) {
        e.preventDefault();
        selectedItem.click();
      }
    }
  }
  
  handleBackButton() {
    const searchContainer = this.shadowRoot.querySelector('.search-container');
    const searchResults = this.shadowRoot.getElementById('search-results');
    const searchInput = this.shadowRoot.getElementById('search-input');
    const backButton = this.shadowRoot.getElementById('back-button');
    
    searchContainer.style.transition = 'opacity 0.3s ease';
    searchResults.style.transition = 'opacity 0.3s ease';
    
    searchContainer.style.opacity = '1';
    searchResults.style.opacity = '0';
    backButton.style.display = 'none';
    
    // 恢复悬浮窗宽度
    this.floatingWindow.classList.remove('expanded');
    
    setTimeout(() => {
      searchResults.classList.remove('show');
      searchResults.innerHTML = '';
      searchInput.value = '';
      this.searchResults = [];
      searchContainer.style.display = 'flex';
      // 返回后恢复最小宽度
      this.floatingWindow.style.width = '100px';
      // 移除键盘导航事件监听
      searchInput.removeEventListener('keydown', this.handleKeyboardNavigation.bind(this));
    }, 300);
  }
  
  handleWindowResize() {
    // 窗口大小变化时检测边缘碰撞
    this.checkEdgeCollision();
  }
  
  checkEdgeCollision() {
    // 仅在拖拽停止后执行边缘检测，确保至少10px距离
    const rect = this.floatingWindow.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const margin = 10; // 距离边缘的最小距离
    
    let newX = this.position.x;
    let newY = this.position.y;
    let needsAdjustment = false;
    
    // 检测右边缘
    if (rect.right > windowWidth - margin) {
      newX = windowWidth - rect.width - margin;
      needsAdjustment = true;
    }
    
    // 检测左边缘
    if (rect.left < margin) {
      newX = margin;
      needsAdjustment = true;
    }
    
    // 检测下边缘
    if (rect.bottom > windowHeight - margin) {
      newY = windowHeight - rect.height - margin;
      needsAdjustment = true;
    }
    
    // 检测上边缘
    if (rect.top < margin) {
      newY = margin;
      needsAdjustment = true;
    }
    
    // 只在需要调整时添加动画
    if (needsAdjustment) {
      this.floatingWindow.style.transition = 'left 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      this.position.x = newX;
      this.position.y = newY;
      this.floatingWindow.style.left = newX + 'px';
      this.floatingWindow.style.top = newY + 'px';
      
      // 清除过渡效果
      setTimeout(() => {
        this.floatingWindow.style.transition = '';
      }, 300);
    }
  }

  handleGlobalKeydown(e) {
    if ((e.altKey && e.key === 'r') || (e.ctrlKey && e.key === 'k')) {
      e.preventDefault();
      const searchInput = this.shadowRoot.getElementById('search-input');
      searchInput.focus();
    }
  }

  updateStatus() {
    // 状态更新方法 - 用于调试路由检测状态
  }

  setupScrollAnimation(item) {
    const routeName = item.querySelector('.route-name');
    const routePath = item.querySelector('.route-path');
    
    if (!routeName || !routePath) return;
    
    let scrollTimeout;
    let isScrolling = false;
    let scrollDirection = 1;
    let animationId;
    
    const startScroll = () => {
      if (isScrolling) return;
      
      const nameWidth = routeName.scrollWidth;
      const pathWidth = routePath.scrollWidth;
      const maxWidth = Math.max(nameWidth, pathWidth, 80);
      
      if (maxWidth <= 80) return;
      
      isScrolling = true;
      scrollDirection = 1;
      
      const scroll = () => {
        if (!isScrolling) return;
        
        const currentTransform = routeName.style.transform || 'translateX(0px)';
        const currentX = parseFloat(currentTransform.match(/-?\d+\.?\d*/)[0]) || 0;
        
        let targetX;
        if (scrollDirection === 1) {
          targetX = -(maxWidth - 80 + 8);
          if (currentX <= targetX) {
            scrollDirection = -1;
            setTimeout(() => {
              if (isScrolling) scroll();
            }, 1000);
            return;
          }
        } else {
          targetX = 0;
          if (currentX >= targetX) {
            scrollDirection = 1;
            setTimeout(() => {
              if (isScrolling) scroll();
            }, 1000);
            return;
          }
        }
        
        const deltaX = scrollDirection * 0.8;
        const newX = currentX + deltaX;
        
        const progress = scrollDirection === 1 ? 
          Math.abs(newX) / Math.abs(targetX) : 
          (Math.abs(targetX) - Math.abs(newX)) / Math.abs(targetX);
        
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const easedDeltaX = deltaX * (1 - easeOut * 0.3);
        
        const finalX = currentX + easedDeltaX;
        
        routeName.style.transform = `translateX(${finalX}px)`;
        routePath.style.transform = `translateX(${finalX}px)`;
        
        animationId = requestAnimationFrame(scroll);
      };
      
      scroll();
    };
    
    const stopScroll = () => {
      isScrolling = false;
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      
      routeName.style.transform = 'translateX(0px)';
      routePath.style.transform = 'translateX(0px)';
      routeName.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      routePath.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      
      setTimeout(() => {
        routeName.style.transition = '';
        routePath.style.transition = '';
      }, 300);
    };
    
    item.addEventListener('mouseenter', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(startScroll, 200);
    });
    
    item.addEventListener('mouseleave', () => {
      clearTimeout(scrollTimeout);
      stopScroll();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new VueRouterNavigator();
  });
} else {
  new VueRouterNavigator();
}