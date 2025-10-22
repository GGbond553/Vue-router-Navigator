document.addEventListener('DOMContentLoaded', async () => {
  const statusText = document.getElementById('status-text');
  const statusIndicator = document.getElementById('status-indicator');
  const clearCacheBtn = document.getElementById('clear-cache');
  const openDevtoolsBtn = document.getElementById('open-devtools');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    
    const isLocalhost = url.hostname === 'localhost' || 
                       url.hostname === '127.0.0.1' || 
                       url.hostname === '[::1]';
    
    if (!isLocalhost) {
      statusText.textContent = '非本地环境';
      statusIndicator.classList.remove('active');
      return;
    }

    const result = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
    
    if (result && result.hasRouter) {
      statusText.textContent = '已检测到 Vue Router';
      statusIndicator.classList.add('active');
    } else {
      statusText.textContent = '未检测到 Vue Router';
      statusIndicator.classList.remove('active');
    }
  } catch (error) {
    statusText.textContent = '连接失败';
    statusIndicator.classList.remove('active');
  }

  clearCacheBtn.addEventListener('click', async () => {
    await chrome.storage.local.clear();
    alert('缓存已清除');
  });

  openDevtoolsBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.runtime.sendMessage({ action: 'openDevtools', tabId: tabs[0].id });
    });
  });
});