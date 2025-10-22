chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const url = new URL(tab.url);
    const isLocalhost = url.hostname === 'localhost' || 
                       url.hostname === '127.0.0.1' || 
                       url.hostname === '[::1]';
    
    if (isLocalhost && (url.protocol === 'http:' || url.protocol === 'https:')) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }).catch(err => {
        // 脚本注入失败时静默处理
      });
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openDevtools') {
    chrome.devtools.inspectedWindow.eval('');
  }
  return true;
});