function updatePanel() {
  chrome.devtools.inspectedWindow.eval(`
    (function() {
      const router = window.app?.$router || window.router || window.__VUE_ROUTER__;
      if (router) {
        const routes = router.getRoutes ? router.getRoutes() : router.options.routes;
        return {
          hasRouter: true,
          routes: routes.map(route => ({
            name: route.name,
            path: route.path,
            children: route.children || []
          }))
        };
      }
      return { hasRouter: false };
    })()
  `, (result, isException) => {
    if (isException) {
      // 窗口检查失败时静默处理
      return;
    }
    
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const content = document.getElementById('content');
    
    if (result && result.hasRouter) {
      statusIndicator.classList.add('active');
      statusText.textContent = '已检测到 Vue Router';
      
      content.innerHTML = '<div class="routes-container" id="routes-list"></div>';
      const routesList = document.getElementById('routes-list');
      
      function renderRoutes(routes, level = 0) {
        routes.forEach(route => {
          const item = document.createElement('div');
          item.className = 'route-item';
          item.style.paddingLeft = `${12 + level * 16}px`;
          item.innerHTML = `
            <div class="route-name">${route.name || '未命名'}</div>
            <div class="route-path">${route.path}</div>
          `;
          
          item.addEventListener('click', () => {
            chrome.devtools.inspectedWindow.eval(`
              const router = window.app?.$router || window.router || window.__VUE_ROUTER__;
              if (router) {
                router.push('${route.path}');
              }
            `);
          });
          
          routesList.appendChild(item);
          
          if (route.children && route.children.length > 0) {
            renderRoutes(route.children, level + 1);
          }
        });
      }
      
      renderRoutes(result.routes);
    } else {
      statusIndicator.classList.remove('active');
      statusText.textContent = '未检测到 Vue Router';
      content.innerHTML = `
        <div class="no-router">
          <p>未检测到 Vue Router</p>
          <p>请确保页面已正确加载 Vue Router</p>
          <p><a href="https://router.vuejs.org/" target="_blank">查看官方文档</a></p>
        </div>
      `;
    }
  });
}

updatePanel();

chrome.devtools.network.onNavigated.addListener(updatePanel);