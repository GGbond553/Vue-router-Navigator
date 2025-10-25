document.addEventListener('DOMContentLoaded', async () => {
  const statusIndicator = document.getElementById('status-indicator');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    
    const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    
    if (isLocalhost) {
      try {
        const result = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
        statusIndicator.classList.toggle('active', result?.hasRouter);
      } catch {
        // 静默处理错误
      }
    }
  } catch {
    // 静默处理错误
  }
});