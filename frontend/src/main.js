import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';

import App from './App.vue';
import router from './router';
import { useAuthSession } from './stores/authSession';
import './style.css';

// Fix: Element Plus 的 focus-trap 在浏览器最小化时会调用 element.focus()，
// 导致窗口被重新激活、任务栏图标闪烁。页面不可见时跳过 focus 调用。
const _nativeFocus = HTMLElement.prototype.focus;
HTMLElement.prototype.focus = function (options) {
  if (document.visibilityState === 'hidden') return;
  return _nativeFocus.call(this, options);
};

(async () => {
  try {
    await useAuthSession().initializeAuthSession();
  } catch (error) {
    console.error('Failed to initialize auth session:', error);
  }
  
  createApp(App).use(ElementPlus).use(router).mount('#app');
})();
